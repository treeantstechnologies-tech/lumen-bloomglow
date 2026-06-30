// Email sender for OTP via Microsoft Graph (app-only / client credentials).
// Config precedence: admin file config (data/config.json) > environment vars.
// File config is read fresh each call, so admin changes apply with no restart.
const store = require("./config-store");

let cachedToken = null, tokenExp = 0, tokenKey = "";

const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || "https://glowbloom.treeantstechnologies.com").replace(/\/$/, "");
const EXP_MIN = Number(process.env.OTP_TTL_MIN) || 10;

function cfg() {
  const c = store.load();
  return {
    tenant: c.graphTenantId || process.env.GRAPH_TENANT_ID || process.env.TENANT_ID,
    client: c.graphClientId || process.env.GRAPH_CLIENT_ID || process.env.CLIENT_ID,
    secret: c.graphClientSecret || process.env.GRAPH_CLIENT_SECRET || process.env.CLIENT_SECRET,
    sender: c.graphSender || process.env.GRAPH_SENDER || process.env.MAIL_FROM,
  };
}
function configured() { const c = cfg(); return !!(c.tenant && c.client && c.secret && c.sender); }

function provider() { const c = store.load(); return (c.emailProvider || process.env.EMAIL_PROVIDER || "graph").toLowerCase(); }
function sesFrom() { const c = store.load(); return c.sesFrom || process.env.SES_FROM || process.env.GRAPH_SENDER || process.env.MAIL_FROM; }
// Is the *currently selected* provider ready to send?
function ready() { return provider() === "ses" ? !!sesFrom() : configured(); }

async function getToken() {
  const c = cfg();
  const key = c.tenant + "|" + c.client + "|" + c.secret;
  if (cachedToken && key === tokenKey && Date.now() < tokenExp - 60000) return cachedToken;
  const url = `https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({ client_id: c.client, client_secret: c.secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) { const e = new Error("token_error"); e.stage = "token"; e.status = r.status; e.detail = j; throw e; }
  cachedToken = j.access_token; tokenKey = key; tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
  return cachedToken;
}

// ---------- Branded, email-client-safe HTML (tables + inline styles) ----------
function shell(innerHtml) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5fb;padding:26px 12px;font-family:Segoe UI,Roboto,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e7e9f3;border-radius:16px;overflow:hidden;">
        <tr><td bgcolor="#7C5BFF" align="center" style="background:#7C5BFF;background:linear-gradient(135deg,#7C5BFF,#9B6BFF);padding:24px 28px;">
          <img src="${PUBLIC_BASE}/treeants_icon.png" width="46" height="46" alt="TreeAnts" style="display:block;margin:0 auto 8px;border:0;"/>
          <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.3px;">Glowbloom</div>
          <div style="color:#ece6ff;font-size:12px;margin-top:3px;font-style:italic;">Where memory blooms into light.</div>
        </td></tr>
        ${innerHtml}
        <tr><td align="center" style="padding:20px 28px 26px;border-top:1px solid #eef0f6;">
          <img src="${PUBLIC_BASE}/treeants_dark.png" height="18" alt="TreeAnts Technologies" style="display:block;margin:0 auto 6px;border:0;"/>
          <div style="color:#9aa0b8;font-size:11px;">&copy; ${year} TreeAnts Technologies. All rights reserved.</div>
          <div style="color:#bfc4d6;font-size:11px;margin-top:4px;">This is an automated message — please do not reply.</div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function otpHtml(code) {
  const inner = `
    <tr><td style="padding:28px 30px 4px;">
      <div style="color:#1c2030;font-size:17px;font-weight:700;">Verify your email</div>
      <div style="color:#565b73;font-size:14px;line-height:1.6;margin-top:6px;">Enter the verification code below to finish signing in to your Glowbloom account.</div>
    </td></tr>
    <tr><td align="center" style="padding:18px 30px 6px;">
      <div style="display:inline-block;background:#f2efff;border:1px solid #ddd5ff;border-radius:12px;padding:14px 26px;">
        <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#4327b8;">${code}</span>
      </div>
    </td></tr>
    <tr><td align="center" style="padding:8px 30px 0;">
      <div style="color:#6b7186;font-size:13px;">This code expires in <b>${EXP_MIN} minutes</b>.</div>
    </td></tr>
    <tr><td style="padding:20px 30px 6px;">
      <div style="color:#8a90a6;font-size:12px;line-height:1.7;border-top:1px solid #eef0f6;padding-top:14px;">
        Didn't request this code? You can safely ignore this email — no changes will be made to your account.
        For your security, <b>never share this code</b> with anyone. Glowbloom will never ask you for it.
      </div>
    </td></tr>`;
  return shell(inner);
}

function testHtml() {
  const inner = `
    <tr><td style="padding:28px 30px 6px;">
      <div style="color:#1c2030;font-size:17px;font-weight:700;">Test email</div>
      <div style="color:#565b73;font-size:14px;line-height:1.7;margin-top:6px;">
        This is a test message sent from the Glowbloom admin panel. If you can read this,
        Microsoft Graph email delivery for Glowbloom is working correctly.
      </div>
    </td></tr>`;
  return shell(inner);
}

// Sends and RETURNS a structured result (never throws) — used by admin test.
async function sendVerbose(to, subject, html, saveToSentItems) {
  const c = cfg();
  if (!configured()) return { ok: false, stage: "config", detail: "Email not configured: missing " +
    ["tenant","client","secret","sender"].filter(k => !c[k]).join(", ") + "." };
  let token;
  try { token = await getToken(); }
  catch (e) { return { ok: false, stage: "token", status: e.status, detail: e.detail || e.message }; }
  try {
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.sender)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: !!saveToSentItems }),
    });
    if (r.ok) return { ok: true, stage: "sent", status: r.status, sender: c.sender };
    const text = await r.text();
    return { ok: false, stage: "sendMail", status: r.status, detail: text, sender: c.sender };
  } catch (e) { return { ok: false, stage: "sendMail", detail: e.message }; }
}

async function sendOtpEmail(to, code) {
  const res = await sendVerbose(to, `Your Glowbloom verification code is ${code}`, otpHtml(code), false);
  if (!res.ok) throw new Error(res.stage + " " + (res.status || "") + ": " + (typeof res.detail === "string" ? res.detail : JSON.stringify(res.detail)));
  return true;
}

async function sendTest(to) {
  return sendVerbose(to, "Glowbloom — test email", testHtml(), true); // saved to Sent Items for verification
}

module.exports = { sendOtpEmail, sendTest, sendVerbose, cfg, configured, ready, provider, sesFrom, EXP_MIN, otpHtml, testHtml };
