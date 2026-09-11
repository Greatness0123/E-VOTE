const argon2 = require("argon2");

async function hashPassword(plain) {
  return argon2.hash(plain, { type: argon2.argon2id });
}

async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// Minimum password security rules enforced at signup / reset time.
function isPasswordStrong(plain) {
  if (typeof plain !== "string" || plain.length < 10) return false;
  const hasUpper = /[A-Z]/.test(plain);
  const hasLower = /[a-z]/.test(plain);
  const hasDigit = /[0-9]/.test(plain);
  const hasSymbol = /[^A-Za-z0-9]/.test(plain);
  return hasUpper && hasLower && hasDigit && hasSymbol;
}

module.exports = { hashPassword, verifyPassword, isPasswordStrong };
