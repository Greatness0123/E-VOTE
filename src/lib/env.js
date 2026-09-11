require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

const INSECURE_DEFAULTS = new Set(["dev-only-insecure-secret-change-me", "dev-only-otp-pepper-change-me"]);

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  NODE_ENV,
  APP_URL: required("APP_URL", "http://localhost:3000"),
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: required("SESSION_SECRET", "dev-only-insecure-secret-change-me"),
  OTP_PEPPER: required("OTP_PEPPER", "dev-only-otp-pepper-change-me"),
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "SUG VOTE <no-reply@example.edu>",
  WEBAUTHN_RP_ID: process.env.WEBAUTHN_RP_ID || "localhost",
  WEBAUTHN_RP_NAME: process.env.WEBAUTHN_RP_NAME || "SUG VOTE",
  WEBAUTHN_ORIGIN: process.env.WEBAUTHN_ORIGIN || "http://localhost:3000",
  COOKIE_SECURE: IS_PRODUCTION,
};

// Fail loudly and immediately at boot in production rather than on the
// first request that happens to touch a missing/insecure value.
function validateForBoot() {
  const problems = [];

  if (!env.DATABASE_URL) problems.push("DATABASE_URL is not set");
  if (IS_PRODUCTION) {
    if (INSECURE_DEFAULTS.has(env.SESSION_SECRET)) problems.push("SESSION_SECRET is using the insecure development default");
    if (INSECURE_DEFAULTS.has(env.OTP_PEPPER)) problems.push("OTP_PEPPER is using the insecure development default");
    if (env.SESSION_SECRET.length < 32) problems.push("SESSION_SECRET should be at least 32 characters");
    if (env.OTP_PEPPER.length < 32) problems.push("OTP_PEPPER should be at least 32 characters");
    if (!env.RESEND_API_KEY) problems.push("RESEND_API_KEY is not set — OTP/reset emails cannot be sent");
    if (env.APP_URL.startsWith("http://localhost")) problems.push("APP_URL still points at localhost");
    if (env.WEBAUTHN_ORIGIN.startsWith("http://localhost")) problems.push("WEBAUTHN_ORIGIN still points at localhost");
  }

  if (problems.length > 0) {
    const message = `Environment configuration problem(s):\n - ${problems.join("\n - ")}`;
    if (IS_PRODUCTION) {
      throw new Error(message);
    } else {
      console.warn(`[env] ${message}`);
    }
  }
}

validateForBoot();

module.exports = env;
