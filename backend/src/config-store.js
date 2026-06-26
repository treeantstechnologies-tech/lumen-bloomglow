// File-backed runtime config (admin-editable). Lives in backend/data/config.json
// (gitignored). Read fresh on every access so changes apply WITHOUT a restart.
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DIR, "config.json");

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { return {}; }
}
function save(patch) {
  fs.mkdirSync(DIR, { recursive: true });
  const next = { ...load() };
  for (const k of Object.keys(patch || {})) {
    if (patch[k] !== undefined && patch[k] !== null && patch[k] !== "") next[k] = patch[k];
  }
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
}
module.exports = { load, save, FILE };
