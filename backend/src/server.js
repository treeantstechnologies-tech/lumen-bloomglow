require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const { getPrisma } = require("./prisma");
const { hashCode, randomCode, signToken, requireAuth, ageToMinor } = require("./auth");
const { sendOtpEmail } = require("./mailer");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", true);
const prisma = getPrisma();
const DEV_RETURN_CODES = String(process.env.DEV_RETURN_CODES) === "true" && process.env.NODE_ENV !== "production";
const TERMS_VERSION = process.env.TERMS_VERSION || "1.0";

app.use(cors({ origin: (process.env.CORS_ORIGIN || "*").split(","), exposedHeaders: ["X-Refresh-Token"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/admin", require("./admin")); // admin module API

app.get("/messages", (req, res) => res.json(require("./messages").merged()));
app.get("/game-config", (req, res) => res.json(require("./game-config").merged()));
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "glowbloom-backend", version: "0.1.0", time: new Date().toISOString() });
});

// ---- audit-log helpers ----
function reqMeta(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return { ip: fwd || (req.socket && req.socket.remoteAddress) || null, userAgent: req.headers["user-agent"] || null };
}
function deviceMeta(body) {
  body = body || {};
  return { platform: body.platform || null, device: body.device || null, osVersion: body.osVersion || null, appVersion: body.appVersion || null };
}
async function logAuth(req, opts) {
  try {
    await prisma.authLog.create({ data: { userId: opts.userId || null, event: opts.event, method: opts.method || null, success: opts.success !== false, ...reqMeta(req), ...deviceMeta(req.body) } });
  } catch (e) {}
}
async function logConsent(req, opts) {
  try {
    await prisma.consentLog.create({ data: { userId: opts.userId || null, doc: opts.doc, version: opts.version || TERMS_VERSION, accepted: opts.accepted !== false, ...reqMeta(req), ...deviceMeta(req.body) } });
  } catch (e) {}
}

async function issueCode(target, channel) {
  const code = randomCode();
  await prisma.verificationCode.create({ data: { target, channel, codeHash: hashCode(code), expiresAt: new Date(Date.now() + (Number(process.env.OTP_TTL_MIN) || 10) * 60 * 1000) } });
  if (channel === "EMAIL") {
    try { await sendOtpEmail(target, code); } catch (e) { console.error("OTP email failed:", e.message); }
  }
  return DEV_RETURN_CODES ? code : null;
}
async function consumeCode(target, channel, code) {
  const wanted = hashCode(code);
  // Match ANY recent unconsumed, unexpired code for this target/channel — not just the
  // newest. This makes re-sends and out-of-order email delivery still verify correctly.
  const recs = await prisma.verificationCode.findMany({ where: { target, channel, consumed: false, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 10 });
  if (!recs.length) return false;
  const match = recs.find((r) => r.codeHash === wanted);
  if (!match) {
    await prisma.verificationCode.update({ where: { id: recs[0].id }, data: { attempts: { increment: 1 } } }).catch(() => {});
    return false;
  }
  await prisma.verificationCode.update({ where: { id: match.id }, data: { consumed: true } });
  return true;
}
// Returns a matching valid code record WITHOUT consuming it, so a later failure
// (e.g. account setup) does not burn the code — the user can retry the same code.
async function peekCode(target, channel, code) {
  const wanted = hashCode(code);
  const recs = await prisma.verificationCode.findMany({ where: { target, channel, consumed: false, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 10 });
  return recs.find((r) => r.codeHash === wanted) || null;
}
function publicUser(u) {
  return { id: u.id, email: u.email, emailVerified: u.emailVerified, mobile: u.mobile, mobileVerified: u.mobileVerified, displayName: u.displayName, firstName: u.firstName, lastName: u.lastName, avatarUrl: u.avatarUrl, isMinor: u.isMinor, initialProvider: u.initialProvider, glade: u.glade ? { totalLight: u.glade.totalLight } : undefined };
}

app.post("/auth/email/start", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email_required" });
  const code = await issueCode(String(email).toLowerCase(), "EMAIL");
  res.json({ ok: true, devCode: code });
});

app.get("/auth/email/exists", async (req, res) => {
  const email = String(req.query.email || "").toLowerCase().trim();
  if (!email) return res.status(400).json({ error: "email_required" });
  const user = await prisma.user.findUnique({ where: { email } }).catch(() => null);
  res.json({ exists: !!user });
});

app.post("/auth/email/verify", async (req, res) => {
  const { email, code, displayName, birthYear, firstName, lastName } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: "email_and_code_required" });
  const target = String(email).toLowerCase();
  const _vc = await peekCode(target, "EMAIL", code);
  if (!_vc) return res.status(401).json({ error: "invalid_or_expired_code" });
  try {
    const minor = ageToMinor(birthYear);
    const existed = await prisma.user.findUnique({ where: { email: target } });
    const user = await prisma.user.upsert({
      where: { email: target },
      update: { emailVerified: true },
      create: {
        email: target, emailVerified: true,
        firstName: firstName || null, lastName: lastName || null,
        displayName: displayName || [firstName, lastName].filter(Boolean).join(" ").trim() || target.split("@")[0],
        birthYear: birthYear ? Number(birthYear) : null, isMinor: minor,
        glade: { create: {} }, initialProvider: "EMAIL",
      },
      include: { glade: true },
    });
    // Safe, conflict-proof provider link (no nested create that can throw on a unique clash).
    await prisma.authProvider.upsert({
      where: { provider_providerUserId: { provider: "EMAIL", providerUserId: target } },
      update: {},
      create: { userId: user.id, provider: "EMAIL", providerUserId: target },
    }).catch(() => {});
    await logAuth(req, { userId: user.id, event: existed ? "LOGIN" : "REGISTER", method: "EMAIL" });
    if (!existed && (req.body || {}).acceptedTerms) {
      await logConsent(req, { userId: user.id, doc: "TERMS" });
      await logConsent(req, { userId: user.id, doc: "PRIVACY" });
    }
    await prisma.verificationCode.update({ where: { id: _vc.id }, data: { consumed: true } }).catch(() => {});
    res.json({ token: signToken(user), user: publicUser(user), kidsMode: user.isMinor, termsVersion: TERMS_VERSION });
  } catch (e) {
    console.error("email verify failed:", e);
    res.status(500).json({ error: "account_setup_failed", detail: String((e && e.message) || e) });
  }
});

app.post("/auth/social", async (req, res) => {
  const { provider, providerUserId, email, displayName, birthYear } = req.body || {};
  if (!["GOOGLE", "META", "APPLE"].includes(provider) || !providerUserId) return res.status(400).json({ error: "provider_and_id_required" });
  const link = await prisma.authProvider.findUnique({ where: { provider_providerUserId: { provider, providerUserId } }, include: { user: { include: { glade: true } } } }).catch(() => null);
  let user = link && link.user;
  const isNew = !user;
  if (!user) {
    const minor = ageToMinor(birthYear);
    user = await prisma.user.create({
      data: {
        email: email ? String(email).toLowerCase() : `pending+${providerUserId}@glowbloom.local`,
        emailVerified: !!email, displayName: displayName || "Player",
        birthYear: birthYear ? Number(birthYear) : null, isMinor: minor,
        glade: { create: {} }, initialProvider: provider, providers: { create: { provider, providerUserId } },
      },
      include: { glade: true },
    });
  }
  await logAuth(req, { userId: user.id, event: isNew ? "REGISTER" : "LOGIN", method: provider });
  if (isNew && (req.body || {}).acceptedTerms) {
    await logConsent(req, { userId: user.id, doc: "TERMS" });
    await logConsent(req, { userId: user.id, doc: "PRIVACY" });
  }
  res.json({ token: signToken(user), user: publicUser(user), emailComplete: user.emailVerified && !user.email.endsWith("@glowbloom.local"), kidsMode: user.isMinor, termsVersion: TERMS_VERSION });
});

app.post("/auth/google", async (req, res) => {
  const { credential, acceptedTerms } = req.body || {};
  if (!credential) return res.status(400).json({ error: "credential_required" });
  let info;
  try {
    const vr = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
    info = await vr.json();
    if (!vr.ok || !info || !info.sub) return res.status(401).json({ error: "google_verify_failed" });
  } catch (e) { return res.status(401).json({ error: "google_verify_failed" }); }
  const expected = (process.env.GOOGLE_CLIENT_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (expected.length && !expected.includes(info.aud)) return res.status(401).json({ error: "google_aud_mismatch" });
  const providerUserId = info.sub;
  const email = (info.email || "").toLowerCase();
  const name = info.name || (email ? email.split("@")[0] : "Player");
  let user = null, isNew = false;
  const link = await prisma.authProvider.findUnique({ where: { provider_providerUserId: { provider: "GOOGLE", providerUserId } }, include: { user: { include: { glade: true } } } }).catch(() => null);
  if (link) user = link.user;
  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email }, include: { glade: true } }).catch(() => null);
    if (user) await prisma.authProvider.create({ data: { userId: user.id, provider: "GOOGLE", providerUserId } }).catch(() => {});
  }
  if (!user) {
    isNew = true;
    user = await prisma.user.create({
      data: {
        email: email || ("google_" + providerUserId + "@glowbloom.local"),
        emailVerified: info.email_verified === "true" || info.email_verified === true || !!email,
        displayName: name, firstName: info.given_name || null, lastName: info.family_name || null, avatarUrl: info.picture || null,
        glade: { create: {} }, initialProvider: "GOOGLE", providers: { create: { provider: "GOOGLE", providerUserId } },
      },
      include: { glade: true },
    });
  }
  await logAuth(req, { userId: user.id, event: isNew ? "REGISTER" : "LOGIN", method: "GOOGLE" });
  if (isNew && acceptedTerms) { await logConsent(req, { userId: user.id, doc: "TERMS" }); await logConsent(req, { userId: user.id, doc: "PRIVACY" }); }
  res.json({ token: signToken(user), user: publicUser(user), isNew, kidsMode: user.isMinor, termsVersion: TERMS_VERSION });
});

app.post("/auth/google/callback", async (req, res) => {
  try {
    const credential = (req.body && req.body.credential) || "";
    if (!credential) return res.redirect("/#gerror=1");
    const vr = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
    const info = await vr.json();
    if (!vr.ok || !info || !info.sub) return res.redirect("/#gerror=1");
    const expected = (process.env.GOOGLE_CLIENT_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (expected.length && !expected.includes(info.aud)) return res.redirect("/#gerror=1");
    const providerUserId = info.sub;
    const email = (info.email || "").toLowerCase();
    const name = info.name || (email ? email.split("@")[0] : "Player");
    let user = null, isNew = false;
    const link = await prisma.authProvider.findUnique({ where: { provider_providerUserId: { provider: "GOOGLE", providerUserId } }, include: { user: { include: { glade: true } } } }).catch(() => null);
    if (link) user = link.user;
    if (!user && email) {
      user = await prisma.user.findUnique({ where: { email }, include: { glade: true } }).catch(() => null);
      if (user) await prisma.authProvider.create({ data: { userId: user.id, provider: "GOOGLE", providerUserId } }).catch(() => {});
    }
    if (!user) {
      isNew = true;
      user = await prisma.user.create({ data: { email: email || ("google_" + providerUserId + "@glowbloom.local"), emailVerified: info.email_verified === "true" || info.email_verified === true || !!email, displayName: name, firstName: info.given_name || null, lastName: info.family_name || null, avatarUrl: info.picture || null, glade: { create: {} }, initialProvider: "GOOGLE", providers: { create: { provider: "GOOGLE", providerUserId } } }, include: { glade: true } });
    }
    await logAuth(req, { userId: user.id, event: isNew ? "REGISTER" : "LOGIN", method: "GOOGLE" });
    if (isNew) { await logConsent(req, { userId: user.id, doc: "TERMS" }); await logConsent(req, { userId: user.id, doc: "PRIVACY" }); }
    return res.redirect("/#gtoken=" + encodeURIComponent(signToken(user)));
  } catch (e) { return res.redirect("/#gerror=1"); }
});

app.post("/auth/mobile/start", requireAuth, async (req, res) => {
  const { mobile } = req.body || {};
  if (!mobile) return res.status(400).json({ error: "mobile_required" });
  const code = await issueCode(String(mobile), "MOBILE");
  res.json({ ok: true, devCode: code });
});

app.post("/auth/mobile/verify", requireAuth, async (req, res) => {
  const { mobile, code } = req.body || {};
  if (!mobile || !code) return res.status(400).json({ error: "mobile_and_code_required" });
  if (!(await consumeCode(String(mobile), "MOBILE", code))) return res.status(401).json({ error: "invalid_or_expired_code" });
  const user = await prisma.user.update({ where: { id: req.userId }, data: { mobile: String(mobile), mobileVerified: true }, include: { glade: true } });
  res.json({ user: publicUser(user) });
});

app.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { glade: true } });
  if (!user) return res.status(404).json({ error: "not_found" });
  res.json({ user: publicUser(user) });
});

app.post("/auth/logout", requireAuth, async (req, res) => {
  await logAuth(req, { userId: req.userId, event: "LOGOUT" });
  res.json({ ok: true });
});

app.post("/consent", requireAuth, async (req, res) => {
  const { docs, version } = req.body || {};
  const allowed = ["TERMS", "PRIVACY", "MARKETING", "ADS"];
  const list = (Array.isArray(docs) && docs.length ? docs : ["TERMS", "PRIVACY"]).filter((d) => allowed.includes(d));
  for (const doc of list) await logConsent(req, { userId: req.userId, doc, version });
  res.json({ ok: true, recorded: list, version: version || TERMS_VERSION });
});

// Profile photo: store a small base64 data-URL on the user record.
app.post("/me/avatar", requireAuth, async (req, res) => {
  const { dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== "string" || !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(dataUrl))
    return res.status(400).json({ error: "invalid_image" });
  if (dataUrl.length > 600000) return res.status(413).json({ error: "image_too_large" });
  try {
    const user = await prisma.user.update({ where: { id: req.userId }, data: { avatarUrl: dataUrl }, include: { glade: true } });
    res.json({ ok: true, user: publicUser(user) });
  } catch (e) { res.status(500).json({ error: "avatar_save_failed" }); }
});

// User feedback -> "Feedback" table (created via pgAdmin). Best-effort device/ip capture.
app.post("/feedback", requireAuth, async (req, res) => {
  const { category, rating, message } = req.body || {};
  const cat = ["bug", "idea", "other"].includes(String(category)) ? String(category) : "other";
  const rate = Math.max(0, Math.min(5, parseInt(rating, 10) || 0));
  const msg = String(message || "").slice(0, 2000);
  if (!msg && !rate) return res.status(400).json({ error: "empty_feedback" });
  const meta = reqMeta(req), dev = deviceMeta(req.body);
  let u = null;
  try { u = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true, displayName: true } }); } catch (e) {}
  const id = crypto.randomUUID();
  try {
    await prisma.$executeRaw`
      INSERT INTO "Feedback" ("id","userId","email","name","category","rating","message","platform","device","ip")
      VALUES (${id}, ${req.userId}, ${u ? u.email : null}, ${u ? u.displayName : null}, ${cat}, ${rate}, ${msg}, ${dev.platform}, ${dev.device}, ${meta.ip})`;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: "feedback_save_failed" }); }
});

app.post("/scores", requireAuth, async (req, res) => {
  const { mode, light, level, maxRadiance, dailySeed } = req.body || {};
  const score = await prisma.score.create({ data: { userId: req.userId, mode: mode || "JOURNEY", light: Number(light) || 0, level: Number(level) || 1, maxRadiance: Number(maxRadiance) || 1, dailySeed: dailySeed || null } });
  await prisma.glade.update({ where: { userId: req.userId }, data: { totalLight: { increment: Number(light) || 0 } } }).catch(() => {});
  res.json({ score });
});

const IST_OFFSET = 330 * 60000; // Asia/Kolkata = UTC+5:30
// Returns the UTC instant for IST midnight, optionally N days back or month-start.
function istMidnight(daysAgo, monthStart) {
  const nowIST = new Date(Date.now() + IST_OFFSET);
  const y = nowIST.getUTCFullYear(), m = nowIST.getUTCMonth();
  const d = monthStart ? 1 : nowIST.getUTCDate();
  const istMidnightUTC = Date.UTC(y, m, d, 0, 0, 0) - IST_OFFSET;
  return new Date(istMidnightUTC - (daysAgo || 0) * 24 * 3600e3);
}
function windowSince(window) {
  if (window === "day") return istMidnight(0);          // since 12:00 AM IST today
  if (window === "week") return istMidnight(6);         // last 7 days (incl. today), IST-aligned
  if (window === "month") return istMidnight(0, true);  // since the 1st of this month, IST
  return null;
}
async function rankedBoard(opts) {
  const where = { mode: opts.mode };
  if (opts.seed) where.dailySeed = String(opts.seed);
  const since = windowSince(opts.window);
  if (since) where.createdAt = { gte: since };
  const scores = await prisma.score.findMany({ where, orderBy: [{ light: "desc" }, { level: "desc" }], take: 1000, include: { user: { select: { id: true, displayName: true } } } });
  const seen = new Set();
  const best = [];
  for (const s of scores) { if (seen.has(s.user.id)) continue; seen.add(s.user.id); best.push(s); }
  return best;
}
app.get("/scores/top", async (req, res) => {
  const best = await rankedBoard({ mode: req.query.mode || "JOURNEY", window: req.query.window || "all", seed: req.query.seed });
  let _r = 0, _prev = null;
  const ranked = best.map((s, i) => {
    const key = s.light + "|" + s.level;
    if (key !== _prev) { _r = i + 1; _prev = key; }
    return { rank: _r, userId: s.user.id, name: s.user.displayName, light: s.light, level: s.level };
  });
  res.json({ window: req.query.window || "all", top: ranked.slice(0, 50) });
});
app.get("/scores/rank", requireAuth, async (req, res) => {
  const best = await rankedBoard({ mode: req.query.mode || "JOURNEY", window: req.query.window || "all" });
  let _r = 0, _prev = null, mine = null;
  best.forEach((s, i) => {
    const key = s.light + "|" + s.level;
    if (key !== _prev) { _r = i + 1; _prev = key; }
    if (s.user.id === req.userId && mine === null) mine = _r;
  });
  res.json({ rank: mine, of: best.length });
});
app.get("/stats/me", requireAuth, async (req, res) => {
  const where = { userId: req.userId };
  if (req.query.mode) where.mode = String(req.query.mode);
  const agg = await prisma.score.aggregate({ where, _max: { light: true, level: true, maxRadiance: true }, _min: { light: true, level: true }, _avg: { light: true, level: true }, _sum: { light: true }, _count: true });
  const recent = await prisma.score.findMany({ where, orderBy: { createdAt: "desc" }, take: 12, select: { light: true } });
  res.json({
    mode: req.query.mode || "ALL",
    bestScore: agg._max.light || 0, bestLevel: agg._max.level || 0, bestRadiance: agg._max.maxRadiance || 1,
    minScore: agg._min.light || 0, minLevel: agg._min.level || 0,
    avgScore: Math.round(agg._avg.light || 0), avgLevel: Math.round((agg._avg.level || 0) * 10) / 10,
    totalLight: agg._sum.light || 0,
    runs: agg._count, trend: recent.reverse().map((r) => r.light),
  });
});

app.get("/daily", async (req, res) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let dp = await prisma.dailyPattern.findUnique({ where: { date: today } }).catch(() => null);
  if (!dp) {
    const seed = today.toISOString().slice(0, 10).replace(/-/g, "");
    dp = await prisma.dailyPattern.create({ data: { date: today, seed } }).catch(() => ({ seed }));
  }
  res.json({ date: today.toISOString().slice(0, 10), seed: dp.seed });
});

app.get("/glade", requireAuth, async (req, res) => {
  const glade = await prisma.glade.findUnique({ where: { userId: req.userId } });
  res.json({ glade });
});
app.post("/glade/sync", requireAuth, async (req, res) => {
  const { totalLight, floraJson } = req.body || {};
  const glade = await prisma.glade.update({ where: { userId: req.userId }, data: { totalLight: typeof totalLight === "number" ? totalLight : undefined, floraJson: floraJson ? JSON.stringify(floraJson) : undefined } });
  res.json({ glade });
});

const PORT = process.env.PORT 