import nodemailer from 'nodemailer'

function escapeHtml(s) {
  if (s == null || s === '') return '—'
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>')
}

function row(label, value) {
  const v = value && String(value).trim() ? escapeHtml(String(value).trim()) : '<span style="color:#64748b">—</span>'
  return `
  <tr>
    <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;width:160px;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:top">${v}</td>
  </tr>`
}

function wrapHtml(title, innerBody, footerLine) {
  const foot = footerLine ? escapeHtml(footerLine) : ''
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08)">
    <tr><td style="padding:20px 24px;background:linear-gradient(135deg,#0b4f8c,#1a73c6);color:#fff">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.9;margin-bottom:4px">SiteMind AI</div>
      <div style="font-size:18px;font-weight:700">${escapeHtml(title)}</div>
    </td></tr>
    <tr><td style="padding:24px">${innerBody}</td></tr>
    <tr><td style="padding:16px 24px;background:#f8fafc;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0">
      ${foot}
    </td></tr>
  </table>
</body></html>`
}

export function isContactMailConfigured() {
  const u = process.env.CONTACT_GMAIL_USER?.trim()
  const p = process.env.CONTACT_GMAIL_APP_PASSWORD?.trim()
  return !!(u && p)
}

/**
 * Sends two emails:
 * 1) Lead summary → CONTACT_GMAIL_USER (your inbox; same account used to send).
 * 2) Confirmation + copy of fields → email address from the form (visitor).
 */
export async function sendContactDemoEmails(fields) {
  const user = process.env.CONTACT_GMAIL_USER?.trim()
  const passRaw = process.env.CONTACT_GMAIL_APP_PASSWORD?.trim()
  if (!user || !passRaw) {
    const err = new Error('CONTACT_GMAIL_USER and CONTACT_GMAIL_APP_PASSWORD must be set')
    err.code = 'MAIL_NOT_CONFIGURED'
    throw err
  }
  const pass = passRaw.replace(/\s+/g, '')
  const fromName = process.env.CONTACT_MAIL_FROM_NAME?.trim() || 'SiteMind AI'

  const { businessName, yourName, email, phone, websiteUrl, notes } = fields
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })

  const notesPlain = notes && String(notes).trim() ? escapeHtml(notes) : '<span style="color:#64748b">—</span>'
  const tableHtml = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
    ${row('Business name', businessName)}
    ${row('Contact name', yourName)}
    ${row('Email', email)}
    ${row('Phone', phone)}
    ${row('Website URL', websiteUrl)}
    <tr>
      <td style="padding:10px 14px;border-bottom:none;font-weight:600;color:#0f172a;width:160px;vertical-align:top">What we should know</td>
      <td style="padding:10px 14px;border-bottom:none;color:#334155;vertical-align:top">${notesPlain}</td>
    </tr>
  </table>`

  const leadSubject = `New demo request: ${businessName || yourName || email}`
  const leadBody = wrapHtml(
    'New demo request',
    `<p style="margin:0 0 16px;color:#334155">Someone submitted the <strong>Request a demo</strong> form on your site. Reply from this thread or use their email below.</p>
    ${tableHtml}`,
    'Lead notification — SiteMind AI landing page “Request a demo” form.',
  )

  const confirmSubject = 'We received your demo request — SiteMind AI'
  const confirmBody = wrapHtml(
    'Thank you for reaching out',
    `<p style="margin:0 0 12px;color:#334155">Hi ${escapeHtml(yourName || 'there')},</p>
    <p style="margin:0 0 16px;color:#334155">Thanks for your interest in <strong>SiteMind AI</strong>. We’ve received your request and our team will review the details you shared.</p>
    <p style="margin:0 0 20px;color:#334155"><strong>What happens next:</strong> after reviewing your request, we’ll get back to you within <strong>24 hours</strong> with next steps for a tailored demo.</p>
    <p style="margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b">Your submission</p>
    ${tableHtml}
    <p style="margin:20px 0 0;font-size:14px;color:#64748b">If anything looks wrong, reply to this email and we’ll fix it.</p>`,
    'Confirmation from SiteMind AI — reply to this email if you have questions.',
  )

  const from = `"${fromName}" <${user}>`

  await transporter.sendMail({
    from,
    to: user,
    replyTo: email,
    subject: leadSubject,
    html: leadBody,
    text: `New demo request\n\nBusiness: ${businessName}\nName: ${yourName}\nEmail: ${email}\nPhone: ${phone}\nURL: ${websiteUrl}\nNotes: ${notes || '—'}`,
  })

  await transporter.sendMail({
    from,
    to: email,
    subject: confirmSubject,
    html: confirmBody,
    text: `Hi ${yourName || 'there'},\n\nThanks for contacting SiteMind AI. We received your demo request and will respond within 24 hours.\n\nYour details:\nBusiness: ${businessName}\nEmail: ${email}\nPhone: ${phone}\nWebsite: ${websiteUrl}\nNotes: ${notes || '—'}`,
  })
}
