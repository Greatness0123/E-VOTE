const crypto = require("crypto");
const env = require("../lib/env");

const ALGORITHM = "aes-256-gcm";
const EMBEDDING_LENGTH = 128;
const MATCH_THRESHOLD = 0.52;

function encryptionKey() {
  return crypto.createHash("sha256").update(`${env.SESSION_SECRET}:face-embedding-v1`).digest();
}

function validateEmbedding(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_LENGTH || embedding.some((value) => !Number.isFinite(value))) {
    const error = new Error("A valid face embedding is required");
    error.status = 400;
    throw error;
  }
}

function encryptEmbedding(embedding) {
  validateEmbedding(embedding);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(embedding), "utf8")), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

function decryptEmbedding(record) {
  if (!record?.faceEmbeddingCiphertext || !record.faceEmbeddingIv || !record.faceEmbeddingTag) return null;
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(record.faceEmbeddingIv));
  decipher.setAuthTag(Buffer.from(record.faceEmbeddingTag));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(record.faceEmbeddingCiphertext)), decipher.final()]);
  const embedding = JSON.parse(plaintext.toString("utf8"));
  validateEmbedding(embedding);
  return embedding;
}

function cosineDistance(left, right) {
  validateEmbedding(left);
  validateEmbedding(right);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (!leftNorm || !rightNorm) return 1;
  return 1 - dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function matchesEnrollment(record, liveEmbedding) {
  const enrolled = decryptEmbedding(record);
  if (!enrolled) return { enrolled: false, matched: true, distance: null };
  const distance = cosineDistance(enrolled, liveEmbedding);
  return { enrolled: true, matched: distance <= MATCH_THRESHOLD, distance };
}

module.exports = { encryptEmbedding, decryptEmbedding, matchesEnrollment, MATCH_THRESHOLD, EMBEDDING_LENGTH };
