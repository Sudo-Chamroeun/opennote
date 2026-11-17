import nodemailer from 'nodemailer';

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<{ delivered: boolean; error?: string }> {
  if (!isSmtpConfigured()) {
    return {
      delivered: false,
      error: 'Email SMTP is not configured in .env (set SMTP_USER and SMTP_PASS).',
    };
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  const from = process.env.SMTP_FROM || `opennote <${user}>`;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const subject = 'Reset your opennote password';
  const text = [
    `Hi ${params.name || 'there'},`,
    '',
    'We received a request to reset your opennote account password.',
    'Open the link below within 30 minutes to choose a new password:',
    '',
    params.resetUrl,
    '',
    'If you did not request a password reset, you can safely ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h2 style="margin: 0 0 12px; font-size: 18px;">Reset your opennote password</h2>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #334155;">
        Hi ${params.name || 'there'}, click the button below within 30 minutes to set a new password for your opennote account.
      </p>
      <p style="margin: 0 0 20px;">
        <a href="${params.resetUrl}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Reset Password
        </a>
      </p>
      <p style="margin: 0; font-size: 12px; color: #64748b; word-break: break-all;">
        Or copy this link: ${params.resetUrl}
      </p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to: params.to,
    subject,
    text,
    html,
  });

  return { delivered: true };
}
