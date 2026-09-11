// Small shared wrapper so every outgoing email looks consistent and
// on-brand rather than being plain unstyled HTML.
function emailLayout({ heading, bodyHtml, footerNote }) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f5f1;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e2da;">
      <div style="background:#0b3d2e;padding:20px 24px;">
        <div style="color:#ffffff;font-weight:700;font-size:18px;">SUG VOTE</div>
        <div style="color:#c9a227;font-size:12px;">Your Vote. Your Voice. Your Future.</div>
      </div>
      <div style="padding:28px 24px;">
        <h1 style="color:#0b3d2e;font-size:20px;margin:0 0 16px;">${heading}</h1>
        ${bodyHtml}
      </div>
      <div style="padding:16px 24px;background:#f6f5f1;color:#6b7570;font-size:12px;">
        ${footerNote || "This is an automated message from SUG VOTE. Do not reply to this email."}
      </div>
    </div>
  </div>`;
}

module.exports = { emailLayout };
