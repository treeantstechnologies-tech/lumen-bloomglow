require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const { getPrisma } = require("./prisma");
const { hashCode, randomCode, signToken, requireAuth, ageToMinor } = require("./auth");
const { sendOtpEmail } = require("./mailer");

const app = express();
const prisma = getPrisma();
const DEV_RETURN_CODES = String(process.env.DEV_RETURN_CODES) === "true" && process.env.NODE_ENV !== "production";
const TERMS_VERSION = process.env.TERMS_VERSION || "1.0";

app.use(cors({ origin: (process.env.CORS_ORIGIN || "*").split(",") }));
app.use(express.json());
app.use(morgan("dev"));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/admin", require("./admin")); // admin module API

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
  await prisma.verificationCode.create({ data: { target, channel, codeHash: hashCode(code), expiresAt: new Date(Date.now() + (Number(process.env.OTP_TTL_MIN) || 5) * 60 * 1000) } });
  if (channel === "EMAIL") {
    try { await sendOtpEmail(target, code); } catch (e) { console.error("OTP email failed:", e.message); }
  }
  return DEV_RETURN_CODES ? code : null;
}
async function consumeCode(target, channel, code) {
  const rec = await prisma.verificationCode.findFirst({ where: { target, channel, consumed: false, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!rec) return false;
  if (rec.codeHash !== hashCode(code)) {
    await prisma.verificationCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
    return false;
  }
  await prisma.verificationCode.update({ where: { id: rec.id }, data: { consumed: true } });
  return true;
}
function publicUser(u) {
  return { id: u.id, email: u.email, emailVerified: u.emailVerified, mobile: u.mobile, mobileVerified: u.mobileVerified, displayName: u.displayName, avatarUrl: u.avatarUrl, isMinor: u.isMinor, glade: u.glade ? { totalLight: u.glade.totalLight } : undefined };
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
  const { email, code, displayName, birthYear } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: "email_and_code_required" });
  const target = String(email).toLowerCase();
  if (!(await consumeCode(target, "EMAIL", code))) return res.status(401).json({ error: "invalid_or_expired_code" });
  const minor = ageToMinor(birthYear);
  const existed = await prisma.user.findUnique({ where: { email: target } });
  const user = await prisma.user.upsert({
    where: { email: target },
    update: { emailVerified: true },
    create: {
      email: target, emailVerified: true, displayName: displayName || target.split("@")[0],
      birthYear: birthYear ? Number(birthYear) : null, isMinor: minor,
      glade: { create: {} }, providers: { create: { provider: "EMAIL", providerUserId: target } },
    },
    include: { glade: true },
  });
  await logAuth(req, { userId: user.id, event: existed ? "LOGIN" : "REGISTER", method: "EMAIL" });
  if (!existed && (req.body || {}).acceptedTerms) {
    await logConsent(req, { userId: user.id, doc: "TERMS" });
    await logConsent(req, { userId: user.id, doc: "PRIVACY" });
  }
  res.json({ token: signToken(user), user: publicUser(user), kidsMode: user.isMinor, termsVersion: TERMS_VERSION });
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
        glade: { create: {} }, providers: { create: { provider, providerUserId } },
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
  const expected = process.env.GOOGLE_CLIENT_ID;
  if (expected && info.aud !== expected) return res.status(401).json({ error: "google_aud_mismatch" });
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
        displayName: name, avatarUrl: info.picture || null,
        glade: { create: {} }, providers: { create: { provider: "GOOGLE", providerUserId } },
      },
      include: { glade: true },
    });
  }
  await logAuth(req, { userId: user.id, event: isNew ? "REGISTER" : "LOGIN", method: "GOOGLE" });
  if (isNew && acceptedTerms) { await logConsent(req, { userId: user.id, doc: "TERMS" }); await logConsent(req, { userId: user.id, doc: "PRIVACY" }); }
  res.json({ token: signToken(user), user: publicUser(user), isNew, kidsMode: user.isMinor, termsVersion: TERMS_VERSION });
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

app.post("/scores", requireAuth, async (req, res) => {
  const { mode, light, level, maxRadiance, dailySeed } = req.body || {};
  const score = await prisma.score.create({ data: { userId: req.userId, mode: mode || "JOURNEY", light: Number(light) || 0, level: Number(level) || 1, maxRadiance: Number(maxRadiance) || 1, dailySeed: dailySeed || null } });
  await prisma.glade.update({ where: { userId: req.userId }, data: { totalLight: { increment: Number(light) || 0 } } }).catch(() => {});
  res.json({ score });
});

function windowSince(window) {
  const now = Date.now();
  if (window === "day") return new Date(now - 24 * 3600e3);
  if (window === "week") return new Date(now - 7 * 24 * 3600e3);
  if (window === "month") return new Date(now - 30 * 24 * 3600e3);
  return null;
}
async function rankedBoard(opts) {
  const where = { mode: opts.mode };
  if (opts.seed) where.dailySeed = String(opts.seed);
  const since = windowSince(opts.window);
  if (since) where.createdAt = { gte: since };
  const scores = await prisma.score.findMany({ where, orderBy: { light: "desc" }, take: 1000, include: { user: { select: { id: true, displayName: true } } } });
  const seen = new Set();
  const best = [];
  for (const s of scores) { if (seen.has(s.user.id)) continue; seen.add(s.user.id); best.push(s); }
  return best;
}
app.get("/scores/top", async (req, res) => {
  const best = await rankedBoard({ mode: req.query.mode || "JOURNEY", window: req.query.window || "all", seed: req.query.seed });
  const top = best.slice(0, 50).map((s, i) => ({ rank: i + 1, userId: s.user.id, name: s.user.displayName, light: s.light, level: s.level }));
  res.json({ window: req.query.window || "all", top });
});
app.get("/scores/rank", requireAuth, async (req, res) => {
  const best = await rankedBoard({ mode: req.query.mode || "JOURNEY", window: req.query.window || "all" });
  const idx = best.findIndex((s) => s.user.id === req.userId);
  res.json({ rank: idx >= 0 ? idx + 1 : null, of: best.length });
});
app.get("/stats/me", requireAuth, async (req, res) => {
  const agg = await prisma.score.aggregate({ where: { userId: req.userId }, _max: { light: true, level: true, maxRadiance: true }, _count: true });
  const recent = await prisma.score.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" }, take: 12, select: { light: true } });
  res.json({ bestScore: agg._max.light || 0, bestLevel: agg._max.level || 0, bestRadiance: agg._max.maxRadiance || 1, runs: agg._count, trend: recent.reverse().map((r) => r.light) });
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

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Glowbloom backend listening on :${PORT}`));
}
module.exports = app;
