const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAction } = require("../services/audit.service");
const { notifyElectionEligibility } = require("../services/notification.service");

const NOTIFICATION_BY_STATUS = {
  ACTIVE: { type: "ELECTION_STARTED", title: "Voting is now open" },
  CLOSED: { type: "ELECTION_CLOSED", title: "Voting has closed" },
  RESULTS_PUBLISHED: { type: "RESULTS_PUBLISHED", title: "Results have been published" },
};

const router = express.Router();

const ALLOWED_TRANSITIONS = {
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["PAUSED", "CLOSED"],
  PAUSED: ["ACTIVE", "CLOSED"],
  CLOSED: ["RESULTS_PUBLISHED"],
  CANCELLED: [],
  RESULTS_PUBLISHED: [],
};

router.use(requireAuth, requireRole("ADMIN", "ELECTION_OFFICER"));

router.get("/", async (req, res) => {
  const elections = await prisma.election.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ elections });
});

router.get("/:id", async (req, res) => {
  const election = await prisma.election.findUnique({
    where: { id: req.params.id },
    include: {
      positions: {
        orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
        include: {
          candidates: {
            orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
  if (!election) return res.status(404).json({ error: "Election not found" });
  res.json({ election });
});

router.post("/", async (req, res) => {
  const { title, description, academicSession, startDate, endDate } = req.body || {};
  if (!title || !startDate || !endDate) {
    return res.status(400).json({ error: "title, startDate and endDate are required" });
  }
  const election = await prisma.election.create({
    data: {
      title,
      description,
      academicSession,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      createdBy: req.user.id,
      status: "DRAFT",
    },
  });
  await logAction({ actorId: req.user.id, action: "ELECTION_CREATED", entity: "Election", entityId: election.id });
  res.status(201).json({ election });
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.election.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Election not found" });
  if (existing.status !== "DRAFT") {
    return res.status(409).json({ error: "Only draft elections can be edited directly" });
  }
  const { title, description, academicSession, startDate, endDate } = req.body || {};
  const election = await prisma.election.update({
    where: { id: req.params.id },
    data: {
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(academicSession !== undefined && { academicSession }),
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
    },
  });
  await logAction({ actorId: req.user.id, action: "ELECTION_UPDATED", entity: "Election", entityId: election.id });
  res.json({ election });
});

router.post("/:id/transition", async (req, res) => {
  const { status } = req.body || {};
  const existing = await prisma.election.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Election not found" });

  const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(status)) {
    return res.status(409).json({ error: `Cannot transition from ${existing.status} to ${status}` });
  }

  const data = { status };
  if (status === "RESULTS_PUBLISHED") data.publishedAt = new Date();

  const election = await prisma.election.update({ where: { id: req.params.id }, data });
  await logAction({
    actorId: req.user.id,
    action: "ELECTION_STATUS_CHANGED",
    entity: "Election",
    entityId: election.id,
    metadata: { from: existing.status, to: status },
  });

  const notification = NOTIFICATION_BY_STATUS[status];
  if (notification) {
    await notifyElectionEligibility({
      electionId: election.id,
      type: notification.type,
      title: notification.title,
      body: election.title,
    });
  }

  res.json({ election });
});

// Eligible voter list management for an election.
router.post("/:id/eligibility", async (req, res) => {
  const { studentIds } = req.body || {};
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ error: "studentIds array is required" });
  }
  const electionId = req.params.id;
  const result = await prisma.electionEligibility.createMany({
    data: studentIds.map((studentId) => ({ electionId, studentId })),
    skipDuplicates: true,
  });
  await logAction({ actorId: req.user.id, action: "ELIGIBILITY_LIST_UPDATED", entity: "Election", entityId: electionId, metadata: { added: result.count } });
  res.json({ added: result.count });
});

module.exports = router;
