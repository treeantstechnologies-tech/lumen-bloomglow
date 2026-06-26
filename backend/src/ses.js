// Amazon SES transport (transactional email — fast OTP delivery).
// Uses the AWS SDK default credential chain: EC2 instance IAM role (preferred),
// or AWS_ACCESS_KEY_ID/SECRET env vars. Region + sender come from admin config/env.
const store = require("./config-store");

let client = null, clientRegion = "";

function region() {
  const c = store.load();
  return c.sesRegion || process.env.SES_REGION || process.env.AWS_REGION || "ap-south-1";
}

function getClient() {
  const { SESv2Client } = require("@aws-sdk/client-sesv2");
  const r = region();
  if (!client || clientRegion !== r) { client = new SESv2Client({ region: r }); clientRegion = r; }
  return client;
}

// Returns a structured result (never throws).
async function sendSes(to, subject, html, from) {
  if (!from) return { ok: false, stage: "config", detail: "SES sender (From address) is not set." };
  let SendEmailCommand;
  try { ({ SendEmailCommand } = require("@aws-sdk/client-sesv2")); }
  catch (e) { return { ok: false, stage: "ses_sdk", detail: "@aws-sdk/client-sesv2 is not installed. On the server run: npm install @aws-sdk/client-sesv2" }; }
  try {
    const cmd = new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      Content: { Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: { Html: { Data: html, Charset: "UTF-8" } },
      } },
    });
    const r = await getClient().send(cmd);
    return { ok: true, stage: "sent", status: 200, messageId: r.MessageId, sender: from, region: region() };
  } catch (e) {
    const status = e && e.$metadata && e.$metadata.httpStatusCode;
    return { ok: false, stage: "ses", status, detail: (e.name ? e.name + ": " : "") + (e.message || String(e)), sender: from, region: region() };
  }
}

module.exports = { sendSes, region };
