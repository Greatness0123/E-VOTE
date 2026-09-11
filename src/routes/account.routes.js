const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { hashPassword, isPasswordStrong } = require("../services/password.service");
const { logAction } = require("../services/audit.service");

const router = express.Router();
router.use(requireAuth, requireRole("ADMIN"));

router.post("/", async (req, res) => {
  const { fullName, email, password, role } = req.body || {};
  const normalizedRole = role || "ELECTION_OFFICER";
  const staffId = `STAFF/${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: "fullName, email and password are required" });
  }
  if (!isPasswordStrong(password)) {
    return res.status(400).json({ error: "Password must be at least 10 characters and include upper, lower, number and symbol" });
  }
  if (!["ADMIN", "ELECTION_OFFICER"].includes(normalizedRole)) {
    return res.status(400).json({ error: "role must be ADMIN or ELECTION_OFFICER" });
  }

  try {
    const account = await prisma.student.create({
      data: {
        fullName: fullName.trim(),
        matricNumber: staffId,
        email: email.trim().toLowerCase(),
        passwordHash: await hashPassword(password),
        role: normalizedRole,
      },
      select: { id: true, fullName: true, matricNumber: true, email: true, role: true, accountStatus: true },
    });
    await logAction({ actorId: req.user.id, action: "STAFF_ACCOUNT_CREATED", entity: "Student", entityId: account.id, metadata: { role: account.role } });
    res.status(201).json({ account });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "Email is already in use" });
    throw error;
  }
});

module.exports = router;
