const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { verifyPassword, hashPassword, isPasswordStrong } = require("../services/password.service");
const { issueSessionCookie, clearSessionCookie } = require("../services/session.service");
const { issueOtp, verifyOtp } = require("../services/otp.service");
const webauthn = require("../services/webauthn.service");
const { requireAuth } = require("../middleware/auth");
const { loginLimiter, otpLimiter } = require("../middleware/rateLimit");
const { logAction } = require("../services/audit.service");
const { sendEmail } = require("../services/email.service");
const { emailLayout } = require("../services/emailTemplate.service");

const router = express.Router();
const AUTH_OTP_PURPOSES = new Set(["LOGIN_VERIFY"]);

// Step 1: matric number or email + password.
router.post("/login", loginLimiter, async (req, res) => {
  const { identifier, matricNumber, password } = req.body || {};
  const loginIdentifier = (identifier || matricNumber || "").trim();
  if (!loginIdentifier || !password) {
    return res.status(400).json({ error: "email or matricNumber and password are required" });
  }

  const student = await prisma.student.findFirst({ where: { OR: [{ matricNumber: loginIdentifier }, { email: loginIdentifier.toLowerCase() }] } });
  const genericError = { error: "Invalid email, matric number or password" };
  if (!student) return res.status(401).json(genericError);
  if (student.accountStatus !== "ACTIVE") {
    return res.status(403).json({ error: "This account is not active. Contact the electoral office." });
  }

  const ok = await verifyPassword(student.passwordHash, password);
  if (!ok) {
    await logAction({ actorId: student.id, action: "LOGIN_FAILED", ipAddress: req.ip });
    return res.status(401).json(genericError);
  }

  issueSessionCookie(res, student);
  await logAction({ actorId: student.id, action: "LOGIN_SUCCESS", ipAddress: req.ip });

  res.json({
    student: {
      id: student.id,
      fullName: student.fullName,
      matricNumber: student.matricNumber,
      email: student.email,
      role: student.role,
    },
  });
});

router.post("/logout", requireAuth, async (req, res) => {
  clearSessionCookie(res);
  await logAction({ actorId: req.user.id, action: "LOGOUT", ipAddress: req.ip });
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  const { id, fullName, matricNumber, email, role } = req.user;
  res.json({ student: { id, fullName, matricNumber, email, role } });
});

// Step 2: email OTP.
router.post("/otp/send", requireAuth, otpLimiter, async (req, res) => {
  const purpose = (req.body && req.body.purpose) || "LOGIN_VERIFY";
  if (!AUTH_OTP_PURPOSES.has(purpose)) return res.status(400).json({ error: "Unsupported OTP purpose" });
  try {
    const result = await issueOtp({ studentId: req.user.id, email: req.user.email, purpose });
    res.json(result);
  } catch (err) {
    if (err.code === "OTP_COOLDOWN") {
      return res.status(429).json({ error: err.message, retryAfterSeconds: err.retryAfterSeconds });
    }
    console.error(err);
    res.status(500).json({ error: "Could not send verification code" });
  }
});

router.post("/otp/verify", requireAuth, otpLimiter, async (req, res) => {
  const { code, purpose } = req.body || {};
  if (!code) return res.status(400).json({ error: "code is required" });

  const safePurpose = purpose || "LOGIN_VERIFY";
  if (!AUTH_OTP_PURPOSES.has(safePurpose)) return res.status(400).json({ error: "Unsupported OTP purpose" });

  const result = await verifyOtp({ studentId: req.user.id, purpose: safePurpose, code });
  if (!result.ok) {
    return res.status(400).json({ error: "Verification failed", reason: result.reason, attemptsLeft: result.attemptsLeft });
  }
  await logAction({ actorId: req.user.id, action: "OTP_VERIFIED", metadata: { purpose } });
  res.json({ ok: true });
});

// Step 3: WebAuthn / passkey.
router.post("/webauthn/register/options", requireAuth, async (req, res) => {
  const options = await webauthn.getRegistrationOptions(req.user);
  res.json(options);
});

router.post("/webauthn/register/verify", requireAuth, async (req, res) => {
  try {
    await webauthn.verifyRegistration(req.user, req.body);
    await logAction({ actorId: req.user.id, action: "WEBAUTHN_REGISTERED" });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/webauthn/authenticate/options", requireAuth, async (req, res) => {
  const options = await webauthn.getAuthenticationOptions(req.user);
  res.json(options);
});

router.post("/webauthn/authenticate/verify", requireAuth, async (req, res) => {
  try {
    await webauthn.verifyAuthentication(req.user, req.body);
    await logAction({ actorId: req.user.id, action: "WEBAUTHN_VERIFIED" });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Password reset request/complete (token emailed, never returned in the API response).
router.post("/password/forgot", loginLimiter, async (req, res) => {
  const { matricNumber } = req.body || {};
  const student = matricNumber ? await prisma.student.findUnique({ where: { matricNumber } }) : null;
  // Always respond identically to avoid leaking which matric numbers exist.
  if (student) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await prisma.passwordReset.create({
      data: { studentId: student.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });
    const resetUrl = `${process.env.APP_URL || "http://localhost:3000"}/pages/reset-password.html?token=${rawToken}&matric=${encodeURIComponent(student.matricNumber)}`;
    await sendEmail({
      to: student.email,
      subject: "Reset your SUG VOTE password",
      text: `Reset your password: ${resetUrl} (expires in 30 minutes)`,
      html: emailLayout({
        heading: "Reset your password",
        bodyHtml: `
          <p style="color:#1c2422;font-size:14px;">We received a request to reset your SUG VOTE password.</p>
          <a href="${resetUrl}" style="display:inline-block;margin:16px 0;background:#0b3d2e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Reset Password</a>
          <p style="color:#6b7570;font-size:13px;">This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>
        `,
      }),
    });
  }
  res.json({ ok: true, message: "If that account exists, a reset link has been sent." });
});

router.post("/password/reset", loginLimiter, async (req, res) => {
  const { matricNumber, token, newPassword } = req.body || {};
  if (!matricNumber || !token || !newPassword) {
    return res.status(400).json({ error: "matricNumber, token and newPassword are required" });
  }
  if (!isPasswordStrong(newPassword)) {
    return res.status(400).json({ error: "Password does not meet the minimum security requirements" });
  }
  const student = await prisma.student.findUnique({ where: { matricNumber } });
  if (!student) return res.status(400).json({ error: "Invalid or expired reset link" });

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!record || record.studentId !== student.id || record.usedAt || record.expiresAt < new Date()) {
    return res.status(400).json({ error: "Invalid or expired reset link" });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.student.update({ where: { id: student.id }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await logAction({ actorId: student.id, action: "PASSWORD_RESET" });
  res.json({ ok: true });
});

module.exports = router;
