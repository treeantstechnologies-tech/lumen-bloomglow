// Central registry of user-facing alert/toast texts.
// Add a key here (with its default) and use it in the frontend via M('key').
// It then shows up in the admin "Messages" tab AUTOMATICALLY — no extra wiring.
const store = require("./config-store");

const DEFAULTS = {
  google_fail:    "Google sign-in failed. Please try again.",
  terms_accept:   "Please accept the Terms & Privacy Policy to continue.",
  enter_email:    "Enter your email",
  not_registered: "You are not registered yet — please create your account first, then you can log in.",
  email_required: "Email is required",
  enter_code:     "Enter the code",
  invalid_code:   "Invalid or expired code",
  buds_max:       "You can buy at most 2 buds per run.",
  buds_low:       "Not enough light to buy a bud.",
};

function overrides() {
  const c = store.load();
  return (c.messages && typeof c.messages === "object") ? c.messages : {};
}
// merged map {key: effective text} for the frontend
function merged() {
  const o = overrides(), out = {};
  for (const k in DEFAULTS) out[k] = (o[k] != null && o[k] !== "") ? o[k] : DEFAULTS[k];
  return out;
}
// full list for the admin editor
function list() {
  const o = overrides();
  return Object.keys(DEFAULTS).map((k) => ({
    key: k, default: DEFAULTS[k],
    current: (o[k] != null && o[k] !== "") ? o[k] : DEFAULTS[k],
    overridden: o[k] != null && o[k] !== "",
  }));
}
function save(key, text) {
  if (!(key in DEFAULTS)) return false;          // only known keys
  const c = store.load();
  const m = Object.assign({}, c.messages || {});
  if (text == null || text === "") delete m[key]; // empty = reset to default
  else m[key] = String(text);
  store.save({ messages: m });
  return true;
}

module.exports = { DEFAULTS, merged, list, save };
