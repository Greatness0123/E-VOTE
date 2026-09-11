// Email provider layer. Isolated behind this module so the underlying
// provider (currently Resend) can be swapped without touching callers.
const env = require("../lib/env");

let resendClient = null;
function getClient() {
  if (!env.RESEND_API_KEY) return null;
  if (!resendClient) {
    const { Resend } = require("resend");
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Sends an email. In development without a configured RESEND_API_KEY, the
 * message is logged instead of sent so local flows remain testable without
 * live credentials.
 */
async function sendEmail({ to, subject, html, text }) {
  const client = getClient();
  if (!client) {
    if (env.NODE_ENV !== "production") {
      console.log(`[email:dev-mode] to=${to} subject="${subject}"\n${text || html}`);
      return { id: "dev-mode-not-sent" };
    }
    throw new Error("Email provider not configured: set RESEND_API_KEY");
  }
  const result = await client.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });
  return result;
}

module.exports = { sendEmail };
