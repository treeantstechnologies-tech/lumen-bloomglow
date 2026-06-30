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
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, { expiresIn: process.env.SESSION_TTL || "30d" });
}

// Express middleware: requires a valid Bearer token, attaches req.userId.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing_token" });
  try {
    const payload = jwt.verify(token, SECRET);
    req.userId = payload.sub;
    // Sliding session: once a valid token is past half its lifetime, hand back a
    // fresh one so anyone who keeps using the app never gets logged out.
    try {
      if (payload.exp && payload.iat) {
        const now = Math.floor(Date.now() / 1000);
        if (now > payload.iat + (payload.exp - payload.iat) / 2) {
          const fresh = jwt.sign({ sub: payload.sub, email: payload.email }, SECRET, { expiresIn: process.env.SESSION_TTL || "30d" });
          res.setHeader("X-Refresh-Token", fresh);
        }
      }
    } catch (e2) {}
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
