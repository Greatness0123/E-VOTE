const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const prisma = require("../src/lib/prisma");
const { submitBallot } = require("../src/services/vote.service");

const enabled = process.env.RUN_DB_TESTS === "1";
const cleanupElectionIds = [];
const cleanupStudentIds = [];
const cleanupMediaIds = [];

async function fixture() {
  const suffix = crypto.randomUUID();
  const student = await prisma.student.create({
    data: { fullName: "Integration Voter", matricNumber: `TEST/${suffix}`, email: `${suffix}@test.invalid`, passwordHash: "unused" },
  });
  const election = await prisma.election.create({
    data: { title: `Integration ${suffix}`, startDate: new Date(Date.now() - 60_000), endDate: new Date(Date.now() + 600_000), status: "ACTIVE" },
  });
  const position = await prisma.position.create({ data: { electionId: election.id, title: "President", required: true } });
  const optionalPosition = await prisma.position.create({ data: { electionId: election.id, title: "Treasurer", required: false } });
  const candidate = await prisma.candidate.create({ data: { electionId: election.id, positionId: position.id, fullName: "Candidate A" } });
  const optionalCandidate = await prisma.candidate.create({ data: { electionId: election.id, positionId: optionalPosition.id, fullName: "Candidate B" } });
  await prisma.electionEligibility.create({ data: { electionId: election.id, studentId: student.id } });
  cleanupElectionIds.push(election.id);
  cleanupStudentIds.push(student.id);
  return { student, election, position, optionalPosition, candidate, optionalCandidate };
}

async function verifiedSession(studentId, electionId, overrides = {}) {
  return prisma.votingSession.create({
    data: {
      studentId,
      electionId,
      sessionToken: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
      passwordVerifiedAt: new Date(),
      otpVerifiedAt: new Date(),
      livenessVerifiedAt: new Date(),
      eligibilityCheckedAt: new Date(),
      ...overrides,
    },
  });
}

test("database integration: verified ballot is stored atomically", { skip: !enabled }, async () => {
  const data = await fixture();
  const session = await verifiedSession(data.student.id, data.election.id);
  const result = await submitBallot({ studentId: data.student.id, electionId: data.election.id, sessionId: session.id, selections: [{ positionId: data.position.id, candidateId: data.candidate.id }] });
  assert.ok(result.referenceId);
  assert.equal(await prisma.voterParticipation.count({ where: { studentId: data.student.id, electionId: data.election.id } }), 1);
  assert.equal(await prisma.ballotSelection.count({ where: { ballot: { electionId: data.election.id } } }), 1);
});

test("database integration: incomplete and duplicate positions are rejected without writes", { skip: !enabled }, async () => {
  const data = await fixture();
  const session = await verifiedSession(data.student.id, data.election.id);
  await assert.rejects(submitBallot({ studentId: data.student.id, electionId: data.election.id, sessionId: session.id, selections: [{ positionId: data.optionalPosition.id, candidateId: data.optionalCandidate.id }] }), { code: "INCOMPLETE_BALLOT" });
  await assert.rejects(submitBallot({ studentId: data.student.id, electionId: data.election.id, sessionId: session.id, selections: [{ positionId: data.position.id, candidateId: data.candidate.id }, { positionId: data.position.id, candidateId: data.candidate.id }] }), { code: "DUPLICATE_POSITION_SELECTION" });
  assert.equal(await prisma.voterParticipation.count({ where: { studentId: data.student.id, electionId: data.election.id } }), 0);
});

test("database integration: cross-election candidate is rejected", { skip: !enabled }, async () => {
  const first = await fixture();
  const second = await fixture();
  const session = await verifiedSession(first.student.id, first.election.id);
  await assert.rejects(submitBallot({ studentId: first.student.id, electionId: first.election.id, sessionId: session.id, selections: [{ positionId: first.position.id, candidateId: second.candidate.id }] }), { code: "INVALID_CANDIDATE_SELECTION" });
});

test("database integration: expired or incompletely verified sessions are rejected", { skip: !enabled }, async () => {
  const data = await fixture();
  const expired = await verifiedSession(data.student.id, data.election.id, { expiresAt: new Date(Date.now() - 1) });
  await assert.rejects(submitBallot({ studentId: data.student.id, electionId: data.election.id, sessionId: expired.id, selections: [{ positionId: data.position.id, candidateId: data.candidate.id }] }), { code: "VERIFICATION_INCOMPLETE" });
  const incomplete = await verifiedSession(data.student.id, data.election.id, { otpVerifiedAt: null });
  await assert.rejects(submitBallot({ studentId: data.student.id, electionId: data.election.id, sessionId: incomplete.id, selections: [{ positionId: data.position.id, candidateId: data.candidate.id }] }), { code: "VERIFICATION_INCOMPLETE" });
});

test("database integration: concurrent submissions cannot double vote", { skip: !enabled }, async () => {
  const data = await fixture();
  const first = await verifiedSession(data.student.id, data.election.id);
  const second = await verifiedSession(data.student.id, data.election.id);
  const ballot = [{ positionId: data.position.id, candidateId: data.candidate.id }];
  const outcomes = await Promise.allSettled([
    submitBallot({ studentId: data.student.id, electionId: data.election.id, sessionId: first.id, selections: ballot }),
    submitBallot({ studentId: data.student.id, electionId: data.election.id, sessionId: second.id, selections: ballot }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(await prisma.voterParticipation.count({ where: { studentId: data.student.id, electionId: data.election.id } }), 1);
  assert.equal(await prisma.ballot.count({ where: { electionId: data.election.id } }), 1);
});

test("database integration: candidate media survives a new Prisma connection", { skip: !enabled }, async () => {
  const { PrismaClient } = require("@prisma/client");
  const data = await fixture();
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const asset = await prisma.mediaAsset.create({
    data: { contentType: "image/jpeg", bytes, byteLength: bytes.length, sha256: "test-sha" },
  });
  cleanupMediaIds.push(asset.id);
  await prisma.candidate.update({ where: { id: data.candidate.id }, data: { mediaAssetId: asset.id, profilePhotoUrl: `/api/media/${asset.id}` } });
  const freshClient = new PrismaClient();
  const stored = await freshClient.mediaAsset.findUnique({ where: { id: asset.id } });
  await freshClient.$disconnect();
  assert.deepEqual(Buffer.from(stored.bytes), bytes);
  assert.equal(stored.contentType, "image/jpeg");
});

after(async () => {
  if (!enabled) return;
  for (const electionId of cleanupElectionIds) await prisma.election.delete({ where: { id: electionId } }).catch(() => {});
  for (const mediaId of cleanupMediaIds) await prisma.mediaAsset.delete({ where: { id: mediaId } }).catch(() => {});
  for (const studentId of cleanupStudentIds) await prisma.student.delete({ where: { id: studentId } }).catch(() => {});
  await prisma.$disconnect();
});
