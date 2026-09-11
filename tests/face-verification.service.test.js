const { test } = require("node:test");
const assert = require("node:assert/strict");
const { encryptEmbedding, decryptEmbedding, matchesEnrollment } = require("../src/services/faceVerification.service");

function embedding(value) {
  return Array.from({ length: 128 }, () => value);
}

test("face embeddings are encrypted and can be decrypted", () => {
  const original = embedding(0.25);
  const encrypted = encryptEmbedding(original);
  assert.notDeepEqual(encrypted.ciphertext, Buffer.from(JSON.stringify(original)));
  assert.deepEqual(decryptEmbedding({
    faceEmbeddingCiphertext: encrypted.ciphertext,
    faceEmbeddingIv: encrypted.iv,
    faceEmbeddingTag: encrypted.tag,
  }), original);
});

test("matching accepts a close live embedding and rejects a different one", () => {
  const encrypted = encryptEmbedding(embedding(0.25));
  const record = { faceEmbeddingCiphertext: encrypted.ciphertext, faceEmbeddingIv: encrypted.iv, faceEmbeddingTag: encrypted.tag };
  assert.equal(matchesEnrollment(record, embedding(0.25)).matched, true);
  assert.equal(matchesEnrollment(record, embedding(-0.25)).matched, false);
});

test("unenrolled voters retain liveness-only fallback", () => {
  const result = matchesEnrollment({ faceEmbeddingCiphertext: null, faceEmbeddingIv: null, faceEmbeddingTag: null }, embedding(0.25));
  assert.deepEqual(result, { enrolled: false, matched: true, distance: null });
});
