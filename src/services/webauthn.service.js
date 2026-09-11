const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const prisma = require("../lib/prisma");
const env = require("../lib/env");

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// Persistent challenge store (replaces an in-process Map) so a challenge
// issued by one serverless instance can be verified by another, and so
// challenges survive cold starts. Function signatures below are unchanged
// from the in-memory version, so callers (routes) need no changes.
async function storeChallenge(studentId, purpose, challenge) {
  // Invalidate any prior unused challenge for this student+purpose first —
  // only one active challenge per purpose at a time, same as the Map did.
  await prisma.webAuthnChallenge.updateMany({
    where: { studentId, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.webAuthnChallenge.create({
    data: { studentId, purpose, challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
}

async function popChallenge(studentId, purpose) {
  const record = await prisma.webAuthnChallenge.findFirst({
    where: { studentId, purpose, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return null;
  await prisma.webAuthnChallenge.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  if (record.expiresAt.getTime() < Date.now()) return null;
  return record.challenge;
}

async function getRegistrationOptions(student) {
  const existing = await prisma.webAuthnCredential.findMany({ where: { studentId: student.id } });
  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    userID: Buffer.from(student.id),
    userName: student.matricNumber,
    userDisplayName: student.fullName,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: Buffer.from(c.credentialId, "base64url"),
      type: "public-key",
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
  await storeChallenge(student.id, "REGISTRATION", options.challenge);
  return options;
}

async function verifyRegistration(student, response) {
  const expectedChallenge = await popChallenge(student.id, "REGISTRATION");
  if (!expectedChallenge) throw new Error("No pending registration challenge");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.WEBAUTHN_ORIGIN,
    expectedRPID: env.WEBAUTHN_RP_ID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("WebAuthn registration verification failed");
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  await prisma.webAuthnCredential.create({
    data: {
      studentId: student.id,
      credentialId: Buffer.from(credential.id).toString("base64url"),
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter ?? 0),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: (response.response.transports || []).join(","),
    },
  });

  return true;
}

async function getAuthenticationOptions(student) {
  const credentials = await prisma.webAuthnCredential.findMany({ where: { studentId: student.id } });
  const options = await generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    userVerification: "preferred",
    allowCredentials: credentials.map((c) => ({
      id: Buffer.from(c.credentialId, "base64url"),
      transports: c.transports ? c.transports.split(",") : undefined,
    })),
  });
  await storeChallenge(student.id, "AUTHENTICATION", options.challenge);
  return options;
}

async function verifyAuthentication(student, response) {
  const expectedChallenge = await popChallenge(student.id, "AUTHENTICATION");
  if (!expectedChallenge) throw new Error("No pending authentication challenge");

  const credentialIdB64 = Buffer.from(response.rawId, "base64url").toString("base64url");
  const stored = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: response.id || credentialIdB64 },
  });
  if (!stored) throw new Error("Unknown credential");

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.WEBAUTHN_ORIGIN,
    expectedRPID: env.WEBAUTHN_RP_ID,
    credential: {
      id: stored.credentialId,
      publicKey: stored.publicKey,
      counter: Number(stored.counter),
    },
  });

  if (!verification.verified) throw new Error("WebAuthn authentication verification failed");

  await prisma.webAuthnCredential.update({
    where: { id: stored.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });

  return true;
}

module.exports = {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
};
