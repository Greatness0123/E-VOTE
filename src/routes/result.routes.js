const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAction } = require("../services/audit.service");

const router = express.Router();

router.use(requireAuth, requireRole("ADMIN", "ELECTION_OFFICER"));

async function tallyByCandidate(electionId) {
  const tallies = await prisma.ballotSelection.groupBy({
    by: ["candidateId"],
    where: { position: { electionId } },
    _count: { candidateId: true },
  });
  return Object.fromEntries(tallies.map((t) => [t.candidateId, t._count.candidateId]));
}

async function buildResults(electionId) {
  const positions = await prisma.position.findMany({
    where: { electionId },
    orderBy: { displayOrder: "asc" },
    include: { candidates: { where: { status: "ACTIVE" } } },
  });
  const countByCandidate = await tallyByCandidate(electionId);
  return positions.map((position) => ({
    positionId: position.id,
    positionTitle: position.title,
    candidates: position.candidates
      .map((c) => ({ candidateId: c.id, fullName: c.fullName, votes: countByCandidate[c.id] || 0 }))
      .sort((a, b) => b.votes - a.votes),
  }));
}

// Dashboard summary metrics for an election. Live candidate totals are
// withheld while the election is ACTIVE/PAUSED to avoid influencing voting.
// Exception: ADMIN (not ELECTION_OFFICER) may request them explicitly via
// ?live=true, per the spec's "unless explicitly authorized" carve-out —
// this is logged to the audit trail every time it's used.
router.get("/elections/:id/dashboard", async (req, res) => {
  const electionId = req.params.id;
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) return res.status(404).json({ error: "Election not found" });

  const [registeredVoters, votesCast, positions] = await Promise.all([
    prisma.electionEligibility.count({ where: { electionId } }),
    prisma.voterParticipation.count({ where: { electionId } }),
    prisma.position.count({ where: { electionId } }),
  ]);

  const turnoutRate = registeredVoters > 0 ? Number(((votesCast / registeredVoters) * 100).toFixed(2)) : 0;
  const closed = ["CLOSED", "RESULTS_PUBLISHED"].includes(election.status);
  const wantsLive = req.query.live === "true";
  const canSeeLive = closed || (wantsLive && req.user.role === "ADMIN");

  if (wantsLive && req.user.role === "ADMIN" && !closed) {
    await logAction({
      actorId: req.user.id,
      action: "LIVE_RESULTS_VIEWED",
      entity: "Election",
      entityId: electionId,
    });
  }

  res.json({
    election: { id: election.id, title: election.title, status: election.status, startDate: election.startDate, endDate: election.endDate },
    metrics: { registeredVoters, votesCast, turnoutRate, positions },
    resultsVisible: canSeeLive,
  });
});

router.get("/elections/:id/results", async (req, res) => {
  const electionId = req.params.id;
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) return res.status(404).json({ error: "Election not found" });

  const closed = ["CLOSED", "RESULTS_PUBLISHED"].includes(election.status);
  const wantsLive = req.query.live === "true";
  const allowed = closed || (wantsLive && req.user.role === "ADMIN");
  if (!allowed) {
    return res.status(409).json({ error: "Results are not available until the election closes" });
  }
  if (!closed) {
    await logAction({ actorId: req.user.id, action: "LIVE_RESULTS_VIEWED", entity: "Election", entityId: electionId });
  }

  const results = await buildResults(electionId);
  res.json({ election: { id: election.id, title: election.title }, results });
});

// Turnout over time — cumulative participation bucketed by hour, for the
// admin dashboard chart. Turnout counts (not selections) are never
// election-sensitive in the same way live results are, so this is visible
// regardless of election status.
router.get("/elections/:id/turnout-timeline", async (req, res) => {
  const electionId = req.params.id;
  const participations = await prisma.voterParticipation.findMany({
    where: { electionId },
    select: { completedAt: true },
    orderBy: { completedAt: "asc" },
  });

  const buckets = new Map();
  for (const p of participations) {
    const hourKey = new Date(p.completedAt);
    hourKey.setMinutes(0, 0, 0);
    const key = hourKey.toISOString();
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  let cumulative = 0;
  const timeline = Array.from(buckets.entries())
    .sort(([a], [b]) => new Date(a) - new Date(b))
    .map(([hour, count]) => {
      cumulative += count;
      return { hour, count, cumulative };
    });

  res.json({ timeline });
});

// Per-position participation (how many ballots included a selection for
// each position) — useful even before close since it doesn't reveal who
// candidates are winning, only completion shape.
router.get("/elections/:id/position-participation", async (req, res) => {
  const electionId = req.params.id;
  const positions = await prisma.position.findMany({
    where: { electionId },
    orderBy: { displayOrder: "asc" },
    select: { id: true, title: true },
  });
  const counts = await prisma.ballotSelection.groupBy({
    by: ["positionId"],
    where: { position: { electionId } },
    _count: { positionId: true },
  });
  const countByPosition = Object.fromEntries(counts.map((c) => [c.positionId, c._count.positionId]));
  res.json({
    positions: positions.map((p) => ({ positionId: p.id, title: p.title, ballotsWithSelection: countByPosition[p.id] || 0 })),
  });
});

module.exports = router;
