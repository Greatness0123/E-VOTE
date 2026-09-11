const express = require("express");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { hashPassword } = require("../services/password.service");
const { encryptEmbedding } = require("../services/faceVerification.service");
const { logAction } = require("../services/audit.service");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.use(requireAuth, requireRole("ADMIN", "ELECTION_OFFICER"));

function selectFields() {
  return {
    id: true,
    fullName: true,
    matricNumber: true,
    email: true,
    phoneNumber: true,
    department: true,
    level: true,
    profilePhotoUrl: true,
    accountStatus: true,
    role: true,
    createdAt: true,
    // passwordHash intentionally excluded
  };
}

router.get("/", async (req, res) => {
  const { q, status, department, page = "1", pageSize = "25" } = req.query;
  const where = {
    role: "STUDENT",
    ...(status && { accountStatus: status }),
    ...(department && { department }),
    ...(q && {
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { matricNumber: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  const take = Math.min(Number(pageSize) || 25, 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const [total, students] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({ where, select: selectFields(), take, skip, orderBy: { fullName: "asc" } }),
  ]);
  res.json({ students, total, page: Number(page), pageSize: take });
});

router.get("/by-matric/:matricNumber", requireRole("ADMIN"), async (req, res) => {
  const student = await prisma.student.findUnique({ where: { matricNumber: req.params.matricNumber }, select: { id: true, fullName: true, matricNumber: true, role: true } });
  if (!student || student.role !== "STUDENT") return res.status(404).json({ error: "Student voter not found" });
  res.json({ student });
});

router.post("/", async (req, res) => {
  const { fullName, matricNumber, email, phoneNumber, department, level, temporaryPassword } = req.body || {};
  if (!fullName || !matricNumber || !email || !temporaryPassword) {
    return res.status(400).json({ error: "fullName, matricNumber, email and temporaryPassword are required" });
  }
  const passwordHash = await hashPassword(temporaryPassword);
  const student = await prisma.student.create({
    data: { fullName, matricNumber, email, phoneNumber, department, level, passwordHash },
    select: selectFields(),
  });
  await logAction({ actorId: req.user.id, action: "VOTER_CREATED", entity: "Student", entityId: student.id });
  res.status(201).json({ student });
});

router.post("/:id/face-enrollment", requireRole("ADMIN"), async (req, res) => {
  const { embedding, consent } = req.body || {};
  if (consent !== true) return res.status(400).json({ error: "Explicit biometric consent is required" });
  let encrypted;
  try {
    encrypted = encryptEmbedding(embedding);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  const student = await prisma.student.update({
    where: { id: req.params.id },
    data: {
      faceEmbeddingCiphertext: encrypted.ciphertext,
      faceEmbeddingIv: encrypted.iv,
      faceEmbeddingTag: encrypted.tag,
      faceEnrollmentConsentAt: new Date(),
      faceEnrollmentUpdatedAt: new Date(),
    },
    select: { id: true, fullName: true, matricNumber: true, faceEnrollmentConsentAt: true, faceEnrollmentUpdatedAt: true },
  });
  await logAction({ actorId: req.user.id, action: "FACE_ENROLLMENT_CREATED", entity: "Student", entityId: student.id });
  res.status(201).json({ student });
});

router.delete("/:id/face-enrollment", requireRole("ADMIN"), async (req, res) => {
  const student = await prisma.student.update({
    where: { id: req.params.id },
    data: { faceEmbeddingCiphertext: null, faceEmbeddingIv: null, faceEmbeddingTag: null, faceEnrollmentConsentAt: null, faceEnrollmentUpdatedAt: null },
    select: { id: true, fullName: true, matricNumber: true },
  });
  await logAction({ actorId: req.user.id, action: "FACE_ENROLLMENT_DELETED", entity: "Student", entityId: student.id });
  res.json({ student });
});

router.patch("/:id", async (req, res) => {
  const { fullName, phoneNumber, department, level, accountStatus } = req.body || {};
  const student = await prisma.student.update({
    where: { id: req.params.id },
    data: {
      ...(fullName !== undefined && { fullName }),
      ...(phoneNumber !== undefined && { phoneNumber }),
      ...(department !== undefined && { department }),
      ...(level !== undefined && { level }),
      ...(accountStatus !== undefined && { accountStatus }),
    },
    select: selectFields(),
  });
  await logAction({ actorId: req.user.id, action: "VOTER_UPDATED", entity: "Student", entityId: student.id, metadata: { accountStatus } });
  res.json({ student });
});

// CSV columns expected: fullName,matricNumber,email,phoneNumber,department,level
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "CSV file is required (field name 'file')" });

  let rows;
  try {
    rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    return res.status(400).json({ error: "Could not parse CSV", detail: err.message });
  }

  const results = { created: 0, skipped: 0, errors: [] };
  for (const [i, row] of rows.entries()) {
    if (!row.fullName || !row.matricNumber || !row.email) {
      results.errors.push({ row: i + 2, error: "Missing required field(s)" });
      continue;
    }
    const tempPassword = crypto.randomBytes(6).toString("hex");
    try {
      await prisma.student.create({
        data: {
          fullName: row.fullName,
          matricNumber: row.matricNumber,
          email: row.email,
          phoneNumber: row.phoneNumber || null,
          department: row.department || null,
          level: row.level || null,
          passwordHash: await hashPassword(tempPassword),
        },
      });
      results.created += 1;
    } catch (err) {
      results.skipped += 1;
      results.errors.push({ row: i + 2, error: "Duplicate matric number or email" });
    }
  }

  await logAction({ actorId: req.user.id, action: "VOTER_CSV_IMPORT", metadata: results });
  res.json(results);
});

// CSV export mirrors the import columns so a round-trip (export, edit,
// re-import) works cleanly.
router.get("/export", async (req, res) => {
  const { q, status, department } = req.query;
  const where = {
    role: "STUDENT",
    ...(status && { accountStatus: status }),
    ...(department && { department }),
    ...(q && {
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { matricNumber: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  const students = await prisma.student.findMany({ where, select: selectFields(), orderBy: { fullName: "asc" } });

  const csv = stringify(
    students.map((s) => ({
      fullName: s.fullName,
      matricNumber: s.matricNumber,
      email: s.email,
      phoneNumber: s.phoneNumber || "",
      department: s.department || "",
      level: s.level || "",
      accountStatus: s.accountStatus,
    })),
    { header: true }
  );

  await logAction({ actorId: req.user.id, action: "VOTER_CSV_EXPORT", metadata: { count: students.length } });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="voters-export.csv"`);
  res.send(csv);
});

router.get("/:id/participation", async (req, res) => {
  // Confirms participation only — never exposes what was selected.
  const participations = await prisma.voterParticipation.findMany({
    where: { studentId: req.params.id },
    include: { election: { select: { id: true, title: true } } },
  });
  res.json({ participations });
});

module.exports = router;
