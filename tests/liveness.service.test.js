const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ACTIONS, issueChallengeData, verifyChallenge } = require("../src/services/liveness.service");

function sessionFor(challenge, overrides = {}) {
  return {
    status: "ACTIVE",
    expiresAt: new Date(Date.now() + 60_000),
    livenessChallengeId: challenge.challengeId,
    livenessAction: challenge.action,
    livenessNonceHash: challenge.nonceHash,
    livenessExpiresAt: challenge.expiresAt,
    livenessConsumedAt: null,
    ...overrides,
  };
}

test("issued liveness challenge uses a supported action and verifies", () => {
  const challenge = issueChallengeData();
  assert.ok(ACTIONS.includes(challenge.action));
  assert.equal(verifyChallenge(sessionFor(challenge), {
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    completedAction: challenge.action,
  }).ok, true);
});

test("liveness challenge rejects wrong nonce, action, and identifier", () => {
  const challenge = issueChallengeData();
  const session = sessionFor(challenge);
  assert.equal(verifyChallenge(session, { challengeId: challenge.challengeId, nonce: "wrong", completedAction: challenge.action }).reason, "WRONG_NONCE");
  assert.equal(verifyChallenge(session, { challengeId: challenge.challengeId, nonce: challenge.nonce, completedAction: "wrong" }).reason, "WRONG_ACTION");
  assert.equal(verifyChallenge(session, { challengeId: "wrong", nonce: challenge.nonce, completedAction: challenge.action }).reason, "WRONG_CHALLENGE");
});

test("liveness challenge rejects expired and consumed challenges", () => {
  const challenge = issueChallengeData();
  const payload = { challengeId: challenge.challengeId, nonce: challenge.nonce, completedAction: challenge.action };
  assert.equal(verifyChallenge(sessionFor(challenge, { livenessExpiresAt: new Date(Date.now() - 1) }), payload).reason, "CHALLENGE_EXPIRED");
  assert.equal(verifyChallenge(sessionFor(challenge, { livenessConsumedAt: new Date() }), payload).reason, "CHALLENGE_USED");
});
