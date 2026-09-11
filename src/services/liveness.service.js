const crypto = require("crypto");

const ACTIONS = ["blink", "turn_left", "turn_right", "smile"];
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

function hashNonce(nonce) {
  return crypto.createHash("sha256").update(nonce).digest("hex");
}

function issueChallengeData(now = Date.now()) {
  const nonce = crypto.randomBytes(32).toString("base64url");
  return {
    challengeId: crypto.randomUUID(),
    action: ACTIONS[crypto.randomInt(ACTIONS.length)],
    nonce,
    nonceHash: hashNonce(nonce),
    expiresAt: new Date(now + CHALLENGE_TTL_MS),
  };
}

function verifyChallenge(session, { challengeId, nonce, completedAction }, now = Date.now()) {
  if (!session || session.status !== "ACTIVE") return { ok: false, reason: "INVALID_SESSION" };
  if (session.expiresAt.getTime() <= now) return { ok: false, reason: "SESSION_EXPIRED" };
  if (session.livenessConsumedAt) return { ok: false, reason: "CHALLENGE_USED" };
  if (!session.livenessExpiresAt || session.livenessExpiresAt.getTime() <= now) return { ok: false, reason: "CHALLENGE_EXPIRED" };
  if (!challengeId || challengeId !== session.livenessChallengeId) return { ok: false, reason: "WRONG_CHALLENGE" };
  if (!completedAction || completedAction !== session.livenessAction) return { ok: false, reason: "WRONG_ACTION" };
  if (!nonce || !session.livenessNonceHash) return { ok: false, reason: "WRONG_NONCE" };
  const actual = hashNonce(nonce);
  const expected = session.livenessNonceHash;
  if (actual.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    return { ok: false, reason: "WRONG_NONCE" };
  }
  return { ok: true };
}

module.exports = { ACTIONS, CHALLENGE_TTL_MS, issueChallengeData, verifyChallenge };
