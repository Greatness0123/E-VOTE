const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sessionHasRequiredVerification, VoteError } = require("../src/services/vote.service");

function baseSession(overrides = {}) {
  return {
    status: "ACTIVE",
    expiresAt: new Date(Date.now() + 60_000),
    passwordVerifiedAt: new Date(),
    otpVerifiedAt: new Date(),
    livenessVerifiedAt: new Date(),
    eligibilityCheckedAt: new Date(),
    ...overrides,
  };
}

test("sessionHasRequiredVerification passes when all required stages are done", () => {
  assert.equal(sessionHasRequiredVerification(baseSession()), true);
});

test("sessionHasRequiredVerification fails if OTP was never verified", () => {
  assert.equal(sessionHasRequiredVerification(baseSession({ otpVerifiedAt: null })), false);
});

test("sessionHasRequiredVerification fails if liveness was never verified", () => {
  assert.equal(sessionHasRequiredVerification(baseSession({ livenessVerifiedAt: null })), false);
});

test("sessionHasRequiredVerification fails if session already expired", () => {
  assert.equal(sessionHasRequiredVerification(baseSession({ expiresAt: new Date(Date.now() - 1000) })), false);
});

test("sessionHasRequiredVerification fails if session is not ACTIVE", () => {
  assert.equal(sessionHasRequiredVerification(baseSession({ status: "COMPLETED" })), false);
});

test("sessionHasRequiredVerification fails on a null session", () => {
  assert.equal(sessionHasRequiredVerification(null), false);
});

test("VoteError carries a code and optional details", () => {
  const err = new VoteError("INCOMPLETE_BALLOT", { missingPositionIds: ["p1"] });
  assert.equal(err.code, "INCOMPLETE_BALLOT");
  assert.deepEqual(err.details, { missingPositionIds: ["p1"] });
  assert.ok(err instanceof Error);
});
