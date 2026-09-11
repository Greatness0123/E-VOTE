const { test } = require("node:test");
const assert = require("node:assert/strict");
const { hashPassword, verifyPassword, isPasswordStrong } = require("../src/services/password.service");

test("hashPassword + verifyPassword round-trip correctly", async () => {
  const hash = await hashPassword("Str0ng!Passw0rd");
  assert.equal(await verifyPassword(hash, "Str0ng!Passw0rd"), true);
  assert.equal(await verifyPassword(hash, "wrong-password"), false);
});

test("isPasswordStrong enforces minimum complexity", () => {
  assert.equal(isPasswordStrong("short1!"), false);
  assert.equal(isPasswordStrong("alllowercase"), false);
  assert.equal(isPasswordStrong("NoDigitsOrSymbols"), false);
  assert.equal(isPasswordStrong("Valid1Password!"), true);
});
