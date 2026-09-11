const rateLimit = require("express-rate-limit");

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification code requests. Try again later." },
});

const voteSubmitLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submission attempts. Try again later." },
});

module.exports = { loginLimiter, otpLimiter, voteSubmitLimiter };
