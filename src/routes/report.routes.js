const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAction } = require("../services/audit.service");

const router = express.Router();
router.use(requireAuth, requireRole("ADMIN", "ELECTION_OFFICER"));

const GREEN = "0B3D2E";
const GOLD = "C9A227";

router.get("/elections/:id/report.pptx", async (req, res) => {
  const electionId = req.params.id;
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) return res.status(404).json({ error: "Election not found" });
  if (!["CLOSED", "RESULTS_PUBLISHED"].includes(election.status)) {
    return res.status(409).json({ error: "Results are not available until the election closes" });
  }
  // Loaded only after authorization and election-state checks. Reports use
  // text, tables, and charts only; no user-supplied image is parsed here.
  const PptxGenJS = require("pptxgenjs");

  const positions = await prisma.position.findMany({
    where: { electionId },
    orderBy: { displayOrder: "asc" },
    include: { candidates: { where: { status: "ACTIVE" } } },
  });
  const tallies = await prisma.ballotSelection.groupBy({
    by: ["candidateId"],
    where: { position: { electionId } },
    _count: { candidateId: true },
  });
  const countByCandidate = Object.fromEntries(tallies.map((t) => [t.candidateId, t._count.candidateId]));
  const registeredVoters = await prisma.electionEligibility.count({ where: { electionId } });
  const votesCast = await prisma.voterParticipation.count({ where: { electionId } });

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "SUG", width: 10, height: 5.63 });
  pptx.layout = "SUG";

  const cover = pptx.addSlide();
  cover.background = { color: GREEN };
  cover.addText("SUG VOTE", { x: 0.5, y: 1.8, w: 9, h: 1, fontSize: 40, bold: true, color: "FFFFFF" });
  cover.addText(election.title, { x: 0.5, y: 2.7, w: 9, h: 0.6, fontSize: 22, color: GOLD });
  cover.addText(`Official Results Report — Registered: ${registeredVoters} · Turnout: ${votesCast}`, {
    x: 0.5, y: 3.4, w: 9, h: 0.5, fontSize: 14, color: "FFFFFF",
  });

  for (const position of positions) {
    const slide = pptx.addSlide();
    slide.addText(position.title, { x: 0.4, y: 0.3, w: 9, h: 0.6, fontSize: 24, bold: true, color: GREEN });

    const rows = position.candidates
      .map((c) => ({ name: c.fullName, votes: countByCandidate[c.id] || 0 }))
      .sort((a, b) => b.votes - a.votes);

    const tableRows = [[{ text: "Candidate", options: { bold: true } }, { text: "Votes", options: { bold: true } }]];
    rows.forEach((r) => tableRows.push([r.name, String(r.votes)]));

    slide.addTable(tableRows, { x: 0.4, y: 1.1, w: 6, colW: [4, 2], fontSize: 14, border: { type: "solid", color: "CCCCCC" } });

    if (rows.length > 0) {
      slide.addChart(pptx.ChartType.bar, [{ name: position.title, labels: rows.map((r) => r.name), values: rows.map((r) => r.votes) }], {
        x: 6.6, y: 1.1, w: 3.0, h: 3.2, chartColors: [GOLD],
      });
    }
  }

  await logAction({ actorId: req.user.id, action: "REPORT_GENERATED", entity: "Election", entityId: electionId });

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  res.setHeader("Content-Disposition", `attachment; filename="${election.title.replace(/[^a-z0-9]+/gi, "-")}-results.pptx"`);
  res.send(buffer);
});

module.exports = router;
