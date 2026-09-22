const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { otpLimiter, voteSubmitLimiter } = require("../middleware/rateLimit");
const voteService = require("../services/vote.service");
const { issueOtp, verifyOtp } = require("../services/otp.service");
const { issueChallengeData, verifyChallenge } = require("../services/liveness.service");
const { matchesEnrollment } = require("../services/faceVerification.service");
const { logAction } = require("../services/audit.service");

const router = express.Router();

router.get("/elections/active-for-me", requireAuth, async (req, res) => {
  const eligible = await prisma.electionEligibility.findMany({
    where: { studentId: req.user.id, election: { status: "ACTIVE" } },
    include: { election: true },
  });
  const participated = await prisma.voterParticipation.findMany({ where: { studentId: req.user.id }, select: { electionId: true } });
  const votedIds = new Set(participated.map((item) => item.electionId));
  const now = new Date();
  const elections = eligible.map((item) => item.election)
    .filter((election) => !votedIds.has(election.id) && election.startDate <= now && election.endDate >= now)
    .map((election) => ({
      id: election.id,
      title: election.title,
      description: election.description,
      academicSession: election.academicSession,
      startDate: election.startDate,
      endDate: election.endDate,
    }));
  res.json({ elections });
});

router.post("/elections/:electionId/session", requireAuth, async (req, res) => {
  const { electionId } = req.params;
  const eligibility = await voteService.checkEligibility({ studentId: req.user.id, electionId });
  if (!eligibility.eligible) return res.status(403).json({ error: "Not eligible to vote", reason: eligibility.reason });

  const session = await prisma.$transaction(async (tx) => {
    await tx.votingSession.updateMany({
      where: { studentId: req.user.id, electionId, status: "ACTIVE" },
      data: { status: "ABANDONED" },
    });
    return tx.votingSession.create({
      data: {
        studentId: req.user.id,
        electionId,
        sessionToken: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
        passwordVerifiedAt: new Date(req.auth.iat * 1000),
        eligibilityCheckedAt: new Date(),
      },
    });
  });
  res.json({ sessionId: session.id, expiresAt: session.expiresAt });
});

async function ownedActiveSession(req, res) {
  const session = await prisma.votingSession.findUnique({ where: { id: req.params.sessionId } });
  if (!session || session.studentId !== req.user.id || session.status !== "ACTIVE") {
    res.status(400).json({ error: "Invalid session" });
    return null;
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.votingSession.updateMany({ where: { id: session.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    res.status(400).json({ error: "Session expired" });
    return null;
  }
  return session;
}

router.post("/sessions/:sessionId/otp/send", requireAuth, otpLimiter, async (req, res) => {
  const session = await ownedActiveSession(req, res);
  if (!session) return;
  try {
    const result = await issueOtp({ studentId: req.user.id, email: req.user.email, purpose: `VOTE_VERIFY:${session.id}` });
    res.json(result);
  } catch (err) {
    if (err.code === "OTP_COOLDOWN") return res.status(429).json({ error: err.message, retryAfterSeconds: err.retryAfterSeconds });
    console.error(err);
    res.status(500).json({ error: "Could not send verification code" });
  }
});

router.post("/sessions/:sessionId/otp/verify", requireAuth, otpLimiter, async (req, res) => {
  const session = await ownedActiveSession(req, res);
  if (!session) return;
  const { code } = req.body || {};
  if (!/^\d{6}$/.test(code || "")) return res.status(400).json({ error: "A 6-digit code is required" });

  const result = await verifyOtp({ studentId: req.user.id, purpose: `VOTE_VERIFY:${session.id}`, code });
  if (!result.ok) return res.status(400).json({ error: "Verification failed", reason: result.reason, attemptsLeft: result.attemptsLeft });
  const updated = await prisma.votingSession.updateMany({
    where: { id: session.id, studentId: req.user.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
    data: { otpVerifiedAt: new Date() },
  });
  if (updated.count !== 1) return res.status(409).json({ error: "Session expired while verifying" });
  await logAction({ actorId: req.user.id, action: "VOTE_OTP_VERIFIED", entity: "VotingSession", entityId: session.id });
  res.json({ ok: true });
});

router.post("/sessions/:sessionId/liveness/challenge", requireAuth, async (req, res) => {
  const session = await ownedActiveSession(req, res);
  if (!session) return;
  if (!session.otpVerifiedAt) return res.status(409).json({ error: "OTP verification is required first" });

  const challenge = issueChallengeData();
  await prisma.votingSession.update({
    where: { id: session.id },
    data: {
      livenessChallengeId: challenge.challengeId,
      livenessAction: challenge.action,
      livenessNonceHash: challenge.nonceHash,
      livenessExpiresAt: challenge.expiresAt,
      livenessConsumedAt: null,
      livenessVerifiedAt: null,
    },
  });
  res.json({ challengeId: challenge.challengeId, action: challenge.action, nonce: challenge.nonce, expiresAt: challenge.expiresAt });
});

router.post("/sessions/:sessionId/liveness/complete", requireAuth, async (req, res) => {
  const session = await ownedActiveSession(req, res);
  if (!session) return;
  const verification = verifyChallenge(session, req.body || {});
  if (!verification.ok) return res.status(400).json({ error: "Liveness verification failed", reason: verification.reason });
  const faceMatch = matchesEnrollment(
    await prisma.student.findUnique({ where: { id: req.user.id }, select: { faceEmbeddingCiphertext: true, faceEmbeddingIv: true, faceEmbeddingTag: true } }),
    req.body.liveEmbedding
  );
  if (!faceMatch.matched) return res.status(401).json({ error: "Face did not match enrollment", reason: "FACE_MISMATCH" });

  const completedAt = new Date();
  const accepted = await prisma.$transaction(async (tx) => {
    const updated = await tx.votingSession.updateMany({
      where: {
        id: session.id,
        studentId: req.user.id,
        status: "ACTIVE",
        expiresAt: { gt: completedAt },
        livenessChallengeId: session.livenessChallengeId,
        livenessConsumedAt: null,
      },
      data: { livenessConsumedAt: completedAt, livenessVerifiedAt: completedAt },
    });
    if (updated.count !== 1) return false;
    await tx.verificationEvent.create({
      data: { votingSessionId: session.id, method: "CAMERA_LIVENESS", result: "VERIFIED", metadata: session.livenessAction },
    });
    return true;
  });
  if (!accepted) return res.status(409).json({ error: "Liveness challenge was already used" });
  res.json({ ok: true, faceEnrollmentMatched: faceMatch.enrolled });
});

router.get("/sessions/:sessionId/ballot", requireAuth, async (req, res) => {
  const session = await prisma.votingSession.findUnique({ where: { id: req.params.sessionId } });
  if (!session || session.studentId !== req.user.id) return res.status(404).json({ error: "Session not found" });
  if (!voteService.sessionHasRequiredVerification(session)) return res.status(403).json({ error: "Verification incomplete" });
  const eligibility = await voteService.checkEligibility({ studentId: req.user.id, electionId: session.electionId });
  if (!eligibility.eligible) return res.status(403).json({ error: "Not eligible to vote", reason: eligibility.reason });

  const positions = await prisma.position.findMany({
    where: { electionId: session.electionId, status: "ACTIVE" },
    orderBy: { displayOrder: "asc" },
    include: {
      candidates: {
        where: { status: "ACTIVE" },
        orderBy: { displayOrder: "asc" },
        select: { id: true, fullName: true, slogan: true, manifesto: true, profilePhotoUrl: true },
      },
    },
  });
  res.json({ positions });
});

router.post("/sessions/:sessionId/submit", requireAuth, voteSubmitLimiter, async (req, res) => {
  const { sessionId } = req.params;
  const { selections } = req.body || {};
  if (!Array.isArray(selections) || selections.length === 0) return res.status(400).json({ error: "selections array is required" });
  const session = await prisma.votingSession.findUnique({ where: { id: sessionId } });
  if (!session || session.studentId !== req.user.id) return res.status(404).json({ error: "Session not found" });

  try {
    const result = await voteService.submitBallot({ studentId: req.user.id, electionId: session.electionId, sessionId, selections });
    await logAction({ actorId: req.user.id, action: "VOTE_SUBMITTED", entity: "Election", entityId: session.electionId });
    res.json({ ok: true, referenceId: result.referenceId, submittedAt: result.submittedAt });
  } catch (err) {
    if (err instanceof voteService.VoteError) {
      return res.status(409).json({ error: "Vote could not be submitted", reason: err.code, details: err.details });
    }
    console.error(err);
    res.status(500).json({ error: "Vote could not be submitted" });
  }
});

module.exports = router;
