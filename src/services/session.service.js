const jwt = require("jsonwebtoken");
const env = require("../lib/env");

const COOKIE_NAME = "sugvote_session";
const SESSION_TTL = "12h";

function issueSessionCookie(res, student) {
  const token = jwt.sign(
    { sub: student.id, role: student.role, matric: student.matricNumber },
    env.SESSION_SECRET,
    { expiresIn: SESSION_TTL }
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    maxAge: 12 * 60 * 60 * 1000,
    path: "/",
  });
  return token;
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

function verifySessionToken(token) {
  try {
    return jwt.verify(token, env.SESSION_SECRET);
  } catch {
    return null;
  }
}

module.exports = { issueSessionCookie, clearSessionCookie, verifySessionToken, COOKIE_NAME };
