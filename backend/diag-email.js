// Glowbloom email diagnostic — run on the server to find the exact failure.
//   cd glowbloom/backend && node diag-email.js you@example.com
// It loads .env, shows which Graph vars are set (masked), gets a token,
// and sends one test email — printing the precise Graph error if any.
require("dotenv").config();

function mask(v) {
  if (!v) return "(missing)";
  if (v.length <= 6) return v[0] + "***";
  return v.slice(0, 3) + "***" + v.slice(-2);
}

const cfg = {
  tenant: process.env.GRAPH_TENANT_ID || process.env.TENANT_ID,
  client: process.env.GRAPH_CLIENT_ID || process.env.CLIENT_ID,
  secret: process.env.GRAPH_CLIENT_SECRET || process.env.CLIENT_SECRET,
  sender: process.env.GRAPH_SENDER || process.env.MAIL_FROM,
};

console.log("\n=== Glowbloom email diagnostic ===");
console.log("NODE_ENV         :", process.env.NODE_ENV || "(unset)");
console.log("DEV_RETURN_CODES :", process.env.DEV_RETURN_CODES || "(unset)");
console.log("GRAPH_TENANT_ID  :", mask(cfg.tenant));
console.log("GRAPH_CLIENT_ID  :", mask(cfg.client));
console.log("GRAPH_CLIENT_SECRET:", mask(cfg.secret));
console.log("GRAPH_SENDER     :", cfg.sender || "(missing)");

if (!cfg.tenant || !cfg.client || !cfg.secret || !cfg.sender) {
  console.log("\nFAIL: one or more Graph vars are missing from .env — fill them in and re-run.");
  console.log("Note: if NODE_ENV=production, email MUST work; codes are never returned in the API.\n");
  process.exit(1);
}

const to = process.argv[2];
if (!to) {
  console.log("\nUsage: node diag-email.js recipient@example.com\n");
  process.exit(1);
}

(async () => {
  // 1) Token
  let token;
  try {
    const url = `https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: cfg.client,
      client_secret: cfg.secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const j = await r.json();
    if (!j.access_token) {
      console.log("\nFAIL at token step (HTTP " + r.status + "):");
      console.log(JSON.stringify(j, null, 2));
      console.log("\nCommon causes: wrong tenant/client id, expired or wrong client secret VALUE (not the secret ID).\n");
      process.exit(1);
    }
    token = j.access_token;
    console.log("\nStep 1 OK: got Graph token.");
  } catch (e) {
    console.log("\nFAIL getting token:", e.message, "\n");
    process.exit(1);
  }

  // 2) sendMail
  try {
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.sender)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: "Glowbloom diagnostic test email",
          body: { contentType: "Text", content: "If you received this, Graph email is working." },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: false,
      }),
    });
    if (r.ok) {
      console.log("Step 2 OK: sendMail accepted (HTTP " + r.status + "). Check the inbox for", to, "\n");
      process.exit(0);
    }
    const text = await r.text();
    console.log("\nFAIL at sendMail step (HTTP " + r.status + "):");
    console.log(text);
    if (r.status === 403) {
      console.log("\n-> 403 usually means: Mail.Send APPLICATION permission not granted, or admin consent not given.");
      console.log("   Azure Portal -> App registrations -> your app -> API permissions ->");
      console.log("   Microsoft Graph -> Application permissions -> Mail.Send -> then 'Grant admin consent'.");
    } else if (r.status === 404) {
      console.log("\n-> 404 usually means the sender mailbox '" + cfg.sender + "' does not exist or has no Exchange Online license.");
      console.log("   Use a real licensed mailbox in this tenant as GRAPH_SENDER.");
    }
    console.log("");
    process.exit(1);
  } catch (e) {
    console.log("\nFAIL sending mail:", e.message, "\n");
    process.exit(1);
  }
})();
