import { Resend } from 'resend';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { MailTemplate } from './templates';

let resendClient: Resend | null = null;
let zohoTransport: Transporter | null = null;

function fromAddress(): string {
  const raw = env.mail.fromEmail;
  if (raw.includes('<')) return raw;
  return `"${env.mail.fromName}" <${raw}>`;
}

function getResend(): Resend | null {
  if (!env.mail.resendApiKey) return null;
  if (!resendClient) resendClient = new Resend(env.mail.resendApiKey);
  return resendClient;
}

function getZoho(): Transporter | null {
  if (!env.smtp.user || !env.smtp.pass) return null;
  if (!zohoTransport) {
    zohoTransport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return zohoTransport;
}

export const mailService = {
  enabled(): boolean {
    if (env.mail.driver === 'log') return true;
    if (env.mail.driver === 'zoho') return Boolean(env.smtp.user && env.smtp.pass);
    return Boolean(env.mail.resendApiKey);
  },

  async send(to: string, template: MailTemplate): Promise<void> {
    if (env.mail.driver === 'log') {
      logger.info(
        {
          to,
          subject: template.subject,
          text: template.text,
        },
        '📧 [DEV LOG] Email (not sent — MAIL_DRIVER=log)',
      );
      return;
    }

    if (!this.enabled()) {
      logger.info({ to, subject: template.subject, driver: env.mail.driver }, 'Mail not configured — logged only');
      if (!env.isProd) logger.debug({ text: template.text }, 'Email preview');
      return;
    }

    try {
      if (env.mail.driver === 'zoho') {
        const transport = getZoho();
        if (!transport) throw new Error('Zoho SMTP is not configured');
        await transport.sendMail({
          from: fromAddress(),
          replyTo: env.mail.replyTo || undefined,
          to,
          subject: template.subject,
          text: template.text,
          html: template.html,
        });
      } else {
        const resend = getResend();
        if (!resend) throw new Error('RESEND_API_KEY is missing');
        const { error } = await resend.emails.send({
          from: fromAddress(),
          to: [to],
          replyTo: env.mail.replyTo || undefined,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
        if (error) throw new Error(error.message);
      }
      logger.info({ to, subject: template.subject, driver: env.mail.driver }, 'Email sent');
    } catch (err) {
      logger.error({ err, to, subject: template.subject, driver: env.mail.driver }, 'Email send failed');
      if (env.isProd) throw err;
    }
  },
};

export default mailService;
