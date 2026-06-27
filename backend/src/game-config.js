// Admin-configurable game difficulty / tuning.
// Live value is file-backed (config.json -> gameConfig), read fresh each time so
// changes apply WITHOUT a restart. merged() feeds the public /game-config endpoint
// (the frontend), list() feeds the admin editor. Every change is also written to the
// "GameConfigHistory" table from the admin route (see admin.js) for an audit trail.
const store = require("./config-store");

// key -> { value(default), label, hint, min, max, step }
const DEFAULTS = {
  lenBase:          { value: 2,   label: "Base pattern length",      hint: "Tiles to remember at level 1.",                              min: 1,  max: 6,    step: 1 },
  lenStepLevels:    { value: 3,   label: "Levels per extra tile",    hint: "Add 1 tile every N levels. Higher = easier.",                min: 1,  max: 10,   step: 1 },
  recallBaseSec:    { value: 10,  label: "Recall time — minimum (s)",hint: "Minimum seconds to tap the pattern back.",                   min: 3,  max: 60,   step: 1 },
  recallPerTileSec: { value: 2,   label: "Recall time per tile (s)", hint: "Seconds per tile; the larger of this x tiles or the minimum wins.", min: 0, max: 10, step: 0.5 },
  revealMs:         { value: 520, label: "Reveal speed (ms / tile)", hint: "Gap between tiles when showing the pattern. Higher = slower & easier.",   min: 150, max: 1500, step: 10 },
  startBuds:        { value: 4,   label: "Starting Buds (lives)",    hint: "Lives at the start of a run.",                               min: 1,  max: 10,   step: 1 },
  maxBuyBuds:       { value: 2,   label: "Max Buds buyable / run",   hint: "How many Buds a player can buy in one run.",                 min: 0,  max: 10,   step: 1 },
  budCostPerLevel:  { value: 10,  label: "Bud cost per level",       hint: "Cost of a Bud = current level x this value.",                min: 0,  max: 100,  step: 1 },
  scorePerTile:     { value: 15,  label: "Light earned per tile",    hint: "Light per tile cleared (x Radiance). Higher = more points.", min: 1,  max: 200,  step: 1 },
  roundBonus:       { value: 5,   label: "Flat bonus per round",     hint: "Extra Light added on top for every round cleared.",          min: 0,  max: 500,  step: 1 },
};

function overrides() {
  const c = store.load();
  return (c.gameConfig && typeof c.gameConfig === "object") ? c.gameConfig : {};
}

function clamp(key, n) {
  const d = DEFAULTS[key];
  if (typeof d.min === "number" && n < d.min) n = d.min;
  if (typeof d.max === "number" && n > d.max) n = d.max;
  return n;
}

// Effective numeric value for one key (override if a valid number, else default).
function effective(key, o) {
  o = o || overrides();
  const raw = o[key];
  const n = Number(raw);
  if (raw != null && raw !== "" && isFinite(n)) return clamp(key, n);
  return DEFAULTS[key].value;
}

// { key: number } map for the frontend.
function merged() {
  const o = overrides(), out = {};
  for (const k in DEFAULTS) out[k] = effective(k, o);
  return out;
}

// rich list for the admin editor.
function list() {
  const o = overrides();
  return Object.keys(DEFAULTS).map((k) => {
    const d = DEFAULTS[k];
    return {
      key: k, label: d.label, hint: d.hint,
      min: d.min, max: d.max, step: d.step,
      default: d.value,
      current: effective(k, o),
      overridden: o[k] != null && o[k] !== "",
    };
  });
}

// Save one key. value === "" / null  ->  reset to default.
// Returns { ok, key, oldValue, newValue } so the caller can log history.
function save(key, value) {
  if (!(key in DEFAULTS)) return { ok: false, error: "unknown_key" };
  const oldValue = effective(key);
  const c = store.load();
  const g = Object.assign({}, c.gameConfig || {});
  let newValue;
  if (value == null || value === "") {
    delete g[key];                 // reset to default
    newValue = DEFAULTS[key].value;
  } else {
    const n = Number(value);
    if (!isFinite(n)) return { ok: false, error: "not_a_number" };
    newValue = clamp(key, n);
    g[key] = newValue;
  }
  store.save({ gameConfig: g });
  return { ok: true, key, oldValue, newValue };
}

module.exports = { DEFAULTS, merged, list, save };
