// Admin API: login, email config (file-backed), test send, overview.
const express = require("express");
const jwt = require("jsonwebtoken");
const store = require("./config-store");
const mailer = require("./mailer");
const ses = require("./ses");
const messages = require("./messages");
const gameConfig = require("./game-config");
const crypto = require("crypto");
const { getPrisma } = require("./prisma");

const router = express.Router();
const prisma = getPrisma();
const SECRET = process.env.JWT_SECRET || "change-me";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@niytri.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function requireAdmin(req, res, next) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  try { const p = jwt.verify(t, SECRET); if (!p.adm) throw new Error("not admin"); req.admin = p; next(); }
  catch (e) { res.status(401).json({ error: "admin_unauthorized" }); }
}
function mask(v) { if (!v) return ""; if (v.length <= 6) return "••••"; return v.slice(0, 3) + "••••" + v.slice(-2); }

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!ADMIN_PASSWORD) return res.status(500).json({ error: "admin_password_not_set", hint: "Set ADMIN_PASSWORD in the server .env, then restart." });
  if (String(email || "").toLowerCase() !== ADMIN_EMAIL || password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: "invalid_credentials" });
  const token = jwt.sign({ adm: true, email: ADMIN_EMAIL }, SECRET, { expiresIn: "12h" });
  res.json({ token, email: ADMIN_EMAIL });
});

router.get("/config", requireAdmin, (req, res) => {
  const c = mailer.cfg();
  const file = store.load();
  const src = (fileKey, val) => file[fileKey] ? "admin" : (val ? "env" : "unset");
  res.json({
    provider: mailer.provider(),
    ready: mailer.ready(),
    configured: mailer.configured(),
    sender: c.sender || "", tenantId: c.tenant || "", clientId: c.client || "",
    secretMasked: mask(c.secret), secretSet: !!c.secret,
    sesRegion: ses.region(), sesFrom: mailer.sesFrom() || "",
    source: { tenant: src("graphTenantId", c.tenant), client: src("graphClientId", c.client), secret: src("graphClientSecret", c.secret), sender: src("graphSender", c.sender) },
  });
});

router.post("/config", requireAdmin, (req, res) => {
  const { provider, tenantId, clientId, clientSecret, sender, sesRegion, sesFrom } = req.body || {};
  const patch = {};
  if (provider !== undefined) patch.emailProvider = String(provider).trim().toLowerCase();
  if (tenantId !== undefined) patch.graphTenantId = String(tenantId).trim();
  if (clientId !== undefined) patch.graphClientId = String(clientId).trim();
  if (sender !== undefined) patch.graphSender = String(sender).trim();
  if (clientSecret) patch.graphClientSecret = String(clientSecret).trim(); // only overwrite when provided
  if (sesRegion !== undefined) patch.sesRegion = String(sesRegion).trim();
  if (sesFrom !== undefined) patch.sesFrom = String(sesFrom).trim();
  store.save(patch);
  res.json({ ok: true, provider: mailer.provider(), ready: mailer.ready() });
});

router.post("/test-email", requireAdmin, async (req, res) => {
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ error: "recipient_required" });
  res.json(await mailer.sendTest(String(to).trim()));
});

router.get("/overview", requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.count();
    const verified = await prisma.user.count({ where: { emailVerified: true } });
    const recentUsers = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { email: true, displayName: true, createdAt: true, emailVerified: true, initialProvider: true } });
    const recentAuth = await prisma.authLog.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { event: true, method: true, ip: true, platform: true, createdAt: true } });
    res.json({ users, verified, recentUsers, recentAuth });
  } catch (e) { res.json({ users: 0, verified: 0, recentUsers: [], recentAuth: [], error: "db_unavailable" }); }
});

router.get("/messages", requireAdmin, (req, res) => {
  res.json({ messages: messages.list() });
});

router.post("/messages", requireAdmin, (req, res) => {
  const { key, text } = req.body || {};
  if (!key) return res.status(400).json({ error: "key_required" });
  const ok = messages.save(key, text);
  if (!ok) return res.status(400).json({ error: "unknown_key" });
  res.json({ ok: true, messages: messages.list() });
});

// ---- Game difficulty / tuning (admin-configurable, with DB audit trail) ----
router.get("/game-config", requireAdmin, (req, res) => {
  res.json({ config: gameConfig.list() });
});

async function logConfigChange(key, oldValue, newValue, who) {
  // Best-effort audit row. If the table doesn't exist yet, don't block the save.
  const id = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "GameConfigHistory" ("id","key","oldValue","newValue","changedBy")
    VALUES (${id}, ${String(key)}, ${String(oldValue)}, ${String(newValue)}, ${String(who || "admin")})`;
}

router.post("/game-config", requireAdmin, async (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: "key_required" });
  const r = gameConfig.save(key, value);
  if (!r.ok) return res.status(400).json({ error: r.error || "save_failed" });

  let historyLogged = true, historyError = null;
  if (String(r.oldValue) !== String(r.newValue)) {
    try { await logConfigChange(r.key, r.oldValue, r.newValue, (req.admin && req.admin.email) || "admin"); }
    catch (e) { historyLogged = false; historyError = "history_table_missing"; }
  }
  res.json({ ok: true, key: r.key, oldValue: r.oldValue, newValue: r.newValue, historyLogged, historyError, config: gameConfig.list() });
});

router.get("/game-config/history", requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT "key", "oldValue", "newValue", "changedBy", "createdAt"
      FROM "GameConfigHistory" ORDER BY "createdAt" DESC LIMIT 50`;
    res.json({ history: rows });
  } catch (e) {
    res.json({ history: [], error: "history_table_missing" });
  }
});

// ---- User feedback (read-only view from the Feedback table) ----
router.get("/feedback", requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT "name", "email", "category", "rating", "message", "platform", "createdAt"
      FROM "Feedback" ORDER BY "createdAt" DESC LIMIT 100`;
    res.json({ feedback: rows });
  } catch (e) {
    res.json({ feedback: [], error: "feedback_table_missing" });
  }
});

// ---- Dashboard analytics (everything aggregated from our own DB) ----
router.get("/dashboard", requireAdmin, async (req, res) => {
  const num = (v) => (v == null ? 0 : Number(v));
  try {
    const since = (d) => new Date(Date.now() - d * 86400000);
    const [users, verified, new1, new7, new30] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: true } }),
      prisma.user.count({ where: { createdAt: { gte: since(1) } } }),
      prisma.user.count({ where: { createdAt: { gte: since(7) } } }),
      prisma.user.count({ where: { createdAt: { gte: since(30) } } }),
    ]);

    const activeRows = await prisma.$queryRaw`
      SELECT
        count(DISTINCT "userId") FILTER (WHERE "createdAt" > now() - interval '1 day')::int   AS d1,
        count(DISTINCT "userId") FILTER (WHERE "createdAt" > now() - interval '7 days')::int   AS d7,
        count(DISTINCT "userId") FILTER (WHERE "createdAt" > now() - interval '30 days')::int  AS d30
      FROM "AuthLog" WHERE "userId" IS NOT NULL`;
    const active = activeRows[0] || { d1: 0, d7: 0, d30: 0 };

    const regSeries = await prisma.$queryRaw`
      SELECT to_char(date_trunc('day',"createdAt"),'YYYY-MM-DD') d, count(*)::int c
      FROM "User" WHERE "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`;
    const loginSeries = await prisma.$queryRaw`
      SELECT to_char(date_trunc('day',"createdAt"),'YYYY-MM-DD') d, count(*)::int c
      FROM "AuthLog" WHERE "event"='LOGIN' AND "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`;
    const gameSeries = await prisma.$queryRaw`
      SELECT to_char(date_trunc('day',"createdAt"),'YYYY-MM-DD') d, count(*)::int c
      FROM "Score" WHERE "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`;

    const providers = await prisma.$queryRaw`
      SELECT COALESCE("initialProvider"::text,'UNKNOWN') p, count(*)::int c FROM "User" GROUP BY 1 ORDER BY 2 DESC`;
    const platforms = await prisma.$queryRaw`
      SELECT COALESCE(NULLIF("platform",''),'unknown') p, count(*)::int c FROM "AuthLog" GROUP BY 1 ORDER BY 2 DESC`;

    const sa = await prisma.score.aggregate({ _count: { _all: true }, _sum: { light: true }, _avg: { level: true, light: true }, _max: { level: true, light: true } });

    let feedback = { count: 0, avg: 0, byCat: [] };
    try {
      const fa = await prisma.$queryRaw`SELECT count(*)::int c, COALESCE(avg("rating"),0)::float a FROM "Feedback"`;
      const fc = await prisma.$queryRaw`SELECT COALESCE("category",'other') cat, count(*)::int c FROM "Feedback" GROUP BY 1 ORDER BY 2 DESC`;
      feedback = { count: num(fa[0] && fa[0].c), avg: Math.round(num(fa[0] && fa[0].a) * 10) / 10, byCat: fc };
    } catch (e) {}

    let leaderboard = [];
    try {
      leaderboard = await prisma.$queryRaw`
        SELECT COALESCE(u."displayName",'Player') name, max(s."light")::int light, max(s."level")::int level
        FROM "Score" s JOIN "User" u ON u."id"=s."userId"
        GROUP BY u."id", u."displayName" ORDER BY light DESC LIMIT 10`;
    } catch (e) {}

    res.json({
      kpis: {
        users, verified, new1, new7, new30,
        active: { d1: num(active.d1), d7: num(active.d7), d30: num(active.d30) },
        games: num(sa._count && sa._count._all), totalLight: num(sa._sum && sa._sum.light),
        avgLevel: Math.round(num(sa._avg && sa._avg.level) * 10) / 10, avgScore: Math.round(num(sa._avg && sa._avg.light)),
        maxLevel: num(sa._max && sa._max.level), maxScore: num(sa._max && sa._max.light),
      },
      series: { registrations: regSeries, logins: loginSeries, games: gameSeries },
      providers, platforms, feedback, leaderboard,
      external: { connected: false, note: "Revenue and store downloads require connecting AdMob, Google Play Console, and App Store Connect APIs." },
    });
  } catch (e) {
    console.error("dashboard error:", e);
    res.status(500).json({ error: "dashboard_failed", detail: String((e && e.message) || e) });
  }
});

module.exports = router;
