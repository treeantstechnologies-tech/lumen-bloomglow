const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "dev-secret";

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function randomCode() {
  // 6-digit numeric OTP / email code.
  return String(crypto.randomInt(100000, 1000000));
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, { expiresIn: "30d" });
}

// Express middleware: requires a valid Bearer token, attaches req.userId.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing_token" });
  try {
    const payload = jwt.verify(token, SECRET);
    req.userId = payload.sub;
    next();
  } catch (e) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

function ageToMinor(birthYear) {
  if (!birthYear) return false;
  const age = new Date().getFullYear() - Number(birthYear);
  return age < 18; // DPDP: under 18 = child.
}

module.exports = { hashCode, randomCode, signToken, requireAuth, ageToMinor };
