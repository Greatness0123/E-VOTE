const prisma = require("../lib/prisma");
const { verifySessionToken, COOKIE_NAME } = require("../services/session.service");

// Verifies the session cookie and attaches the current, live student record
// (never trusts stale claims baked into the token for authorization).
async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  const payload = verifySessionToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired session" });

  const student = await prisma.student.findUnique({ where: { id: payload.sub } });
  if (!student || student.accountStatus !== "ACTIVE") {
    return res.status(401).json({ error: "Account not available" });
  }

  req.user = student;
  req.auth = payload;
  next();
}

// Every protected route independently checks role — never relies on the
// frontend hiding UI.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
