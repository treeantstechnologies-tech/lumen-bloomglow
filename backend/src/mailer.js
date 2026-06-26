// Email sender for OTP codes via Microsoft Graph (app-only / client credentials).
//
// Azure setup (one time):
//   1. Azure Portal -> App registrations -> New registration.
//   2. API permissions -> Microsoft Graph -> Application permissions -> Mail.Send
//      -> Grant admin consent.
//   3. Certificates & secrets -> new client secret.
//   4. Put these in .env:
//        GRAPH_TENANT_ID=<directory (tenant) id>
//        GRAPH_CLIENT_ID=<application (client) id>
//        GRAPH_CLIENT_SECRET=<the secret value>
//        GRAPH_SENDER=no-reply@yourdomain.com   (a real mailbox to send as)
// If not configured, sending is skipped (dev codes still work).

let cachedToken = null;
let tokenExp = 0;

// Accept either GRAPH_* names or the shorter TENANT_ID/CLIENT_ID/... names.
function cfg() {
  return {
    tenant: process.env.GRAPH_TENANT_ID || process.env.TENANT_ID,
    client: process.env.GRAPH_CLIENT_ID || process.env.CLIENT_ID,
    secret: process.env.GRAPH_CLIENT_SECRET || process.env.CLIENT_SECRET,
    sender: process.env.GRAPH_SENDER || process.env.MAIL_FROM,
  };
}
function configured() {
  const c = cfg();
  return c.tenant && c.client && c.secret && c.sender;
}

async function getToken() {
  if (!configured()) return null;
  if (cachedToken && Date.now() < tokenExp - 60000) return cachedToken;
  const c = cfg();
  const url = `https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: c.client,
    client_secret: c.secret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json();
  if (!j.access_token) throw new Error("graph token error: " + JSON.stringify(j));
  cachedToken = j.access_token;
  tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
  return cachedToken;
}

async function sendOtpEmail(to, code) {
  const token = await getToken();
  if (!token) return false; // not configured -> skip
  const sender = cfg().sender;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px">
    <h2 style="color:#7C5BFF;margin:0 0 8px">Glowbloom</h2>
    <p>Your verification code is:</p>
    <p style="font-size:30px;font-weight:700;letter-spacing:4px;color:#111">${code}</p>
    <p style="color:#666">It expires in 10 minutes. If you didn't request this, ignore this email.</p>
    <hr style="border:none;border-top:1px solid #eee"/>
    <p style="color:#999;font-size:12px">TreeAnts Technologies</p>
  </div>`;
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: `Your Glowbloom verification code: ${code}`,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: false,
    }),
  });
  if (!r.ok) throw new Error("graph sendMail " + r.status + ": " + (await r.text()));
  return true;
}

module.exports = { sendOtpEmail };
