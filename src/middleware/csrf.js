const crypto = require("crypto");
const env = require("../lib/env");

const CSRF_COOKIE = "sugvote_csrf";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Issues a readable (non-httpOnly) CSRF cookie on every response if the
// caller doesn't already have one. The frontend reads this cookie and
// echoes it back in the X-CSRF-Token header on state-changing requests;
// an attacker's cross-site request can't read the cookie to do the same.
function ensureCsrfCookie(req, res, next) {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString("hex");
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: env.COOKIE_SECURE,
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 1000,
      path: "/",
    });
    req.cookies[CSRF_COOKIE] = token;
  }
  next();
}

function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (
    !cookieToken ||
    !headerToken ||
    cookieToken.length !== headerToken.length ||
    !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
  ) {
    return res.status(403).json({ error: "Invalid or missing CSRF token" });
  }
  next();
}

module.exports = { ensureCsrfCookie, requireCsrf, CSRF_COOKIE, CSRF_HEADER };
