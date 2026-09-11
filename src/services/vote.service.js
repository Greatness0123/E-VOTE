const crypto = require("crypto");
const prisma = require("../lib/prisma");

/**
 * Verifies every eligibility condition before a ballot may be opened.
 * Returns { eligible: true } or { eligible: false, reason }.
 */
async function checkEligibility({ studentId, electionId }) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return { eligible: false, reason: "USER_NOT_FOUND" };
  if (student.accountStatus !== "ACTIVE") return { eligible: false, reason: "ACCOUNT_NOT_ACTIVE" };

  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) return { eligible: false, reason: "ELECTION_NOT_FOUND" };
  if (election.status !== "ACTIVE") return { eligible: false, reason: "ELECTION_NOT_ACTIVE" };

  const now = new Date();
  if (now < election.startDate || now > election.endDate) {
    return { eligible: false, reason: "OUTSIDE_ELECTION_WINDOW" };
  }

  const eligibilityRecord = await prisma.electionEligibility.findUnique({
    where: { electionId_studentId: { electionId, studentId } },
  });
  if (!eligibilityRecord) return { eligible: false, reason: "NOT_ON_ELIGIBLE_LIST" };

  const alreadyVoted = await prisma.voterParticipation.findUnique({
    where: { studentId_electionId: { studentId, electionId } },
  });
  if (alreadyVoted) return { eligible: false, reason: "ALREADY_VOTED" };

  return { eligible: true };
}

/**
 * Confirms a voting session has completed the required verification stages
 * before a ballot may be opened or submitted.
 */
function sessionHasRequiredVerification(session) {
  return Boolean(
    session &&
      session.status === "ACTIVE" &&
      session.expiresAt.getTime() > Date.now() &&
      session.passwordVerifiedAt &&
      session.otpVerifiedAt &&
      session.livenessVerifiedAt &&
      session.eligibilityCheckedAt
    // WebAuthn is optional; password, OTP, liveness, and eligibility are mandatory.
  );
}

/**
 * Atomically submits a ballot: re-validates every integrity condition
 * inside a single transaction, writes the anonymous ballot + selections,
 * writes the (identity-only) participation record, and marks the session
 * complete. Rolls back entirely on any failure — never persists a partial
 * vote.
 */
async function submitBallot({ studentId, electionId, sessionId, selections }) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.votingSession.findUnique({ where: { id: sessionId } });
    if (!session || session.studentId !== studentId || session.electionId !== electionId) {
      throw new VoteError("INVALID_SESSION");
    }
    if (!sessionHasRequiredVerification(session)) {
      throw new VoteError("VERIFICATION_INCOMPLETE");
    }

    const election = await tx.election.findUnique({ where: { id: electionId } });
    if (!election || election.status !== "ACTIVE") throw new VoteError("ELECTION_NOT_ACTIVE");
    const now = new Date();
    if (now < election.startDate || now > election.endDate) throw new VoteError("OUTSIDE_ELECTION_WINDOW");

    const eligibilityRecord = await tx.electionEligibility.findUnique({
      where: { electionId_studentId: { electionId, studentId } },
    });
    if (!eligibilityRecord) throw new VoteError("NOT_ON_ELIGIBLE_LIST");

    // Positions required for this election.
    const positions = await tx.position.findMany({ where: { electionId, status: "ACTIVE" } });
    const activePositionIds = new Set(positions.map((p) => p.id));
    const requiredPositionIds = positions.filter((p) => p.required).map((p) => p.id);
    const selectedPositionIds = selections.map((s) => s.positionId);
    if (new Set(selectedPositionIds).size !== selectedPositionIds.length) {
      throw new VoteError("DUPLICATE_POSITION_SELECTION");
    }
    const missing = requiredPositionIds.filter((id) => !selectedPositionIds.includes(id));
    if (missing.length > 0) {
      throw new VoteError("INCOMPLETE_BALLOT", { missingPositionIds: missing });
    }

    // Validate every candidate belongs to the correct election + position.
    for (const sel of selections) {
      if (!activePositionIds.has(sel.positionId)) throw new VoteError("INVALID_POSITION_SELECTION");
      const candidate = await tx.candidate.findUnique({ where: { id: sel.candidateId } });
      if (
        !candidate ||
        candidate.electionId !== electionId ||
        candidate.positionId !== sel.positionId ||
        candidate.status !== "ACTIVE"
      ) {
        throw new VoteError("INVALID_CANDIDATE_SELECTION");
      }
    }

    // Database-level uniqueness prevents double voting even under
    // concurrent requests — this insert is the linchpin, not application logic.
    await tx.voterParticipation.create({
      data: { studentId, electionId },
    });

    const ballot = await tx.ballot.create({
      data: {
        electionId,
        anonymousBallotId: crypto.randomUUID(),
      },
    });

    await tx.ballotSelection.createMany({
      data: selections.map((s) => ({
        ballotId: ballot.id,
        positionId: s.positionId,
        candidateId: s.candidateId,
      })),
    });

    await tx.votingSession.update({
      where: { id: sessionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    return { referenceId: ballot.anonymousBallotId, submittedAt: ballot.createdAt };
  });
}

class VoteError extends Error {
  constructor(code, details) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

module.exports = { checkEligibility, sessionHasRequiredVerification, submitBallot, VoteError };
