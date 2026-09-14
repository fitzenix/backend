import { Resend } from 'resend';
import nodemailer, { type Transporter } from 'nodemailer';
import { SendMailClient } from 'zeptomail';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { MailTemplate } from './templates';

let resendClient: Resend | null = null;
let smtpTransport: Transporter | null = null;
let zeptoApiClient: SendMailClient | null = null;

/** Parse `Name <email@x.com>` or bare email into from fields. */
function parseFrom(): { address: string; name: string } {
  const raw = env.mail.fromEmail.trim();
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/^["']|["']$/g, '').trim() || env.mail.fromName,
      address: match[2].trim(),
    };
  }
  return { name: env.mail.fromName, address: raw };
}

function fromAddress(): string {
  const { name, address } = parseFrom();
  return `"${name}" <${address}>`;
}

function getResend(): Resend | null {
  if (!env.mail.resendApiKey) return null;
  if (!resendClient) resendClient = new Resend(env.mail.resendApiKey);
  return resendClient;
}

/**
 * Nodemailer transport — used for ZeptoMail SMTP (`smtp.zeptomail.in`)
 * and legacy Zoho Mail SMTP.
 */
function getSmtpTransport(): Transporter | null {
  if (!env.smtp.user || !env.smtp.pass) return null;
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      // Port 587 = STARTTLS (secure: false). Port 465 = TLS (secure: true).
      secure: env.smtp.secure,
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass,
      },
    });
  }
  return smtpTransport;
}

function getZeptoApi(): SendMailClient | null {
  if (!env.mail.zeptomail.token) return null;
  if (!zeptoApiClient) {
    zeptoApiClient = new SendMailClient({
      url: env.mail.zeptomail.url,
      token: env.mail.zeptomail.token,
    });
  }
  return zeptoApiClient;
}

async function sendViaSmtp(to: string, template: MailTemplate): Promise<void> {
  const transport = getSmtpTransport();
  if (!transport) throw new Error('SMTP is not configured (SMTP_USER / SMTP_PASS)');

  await transport.sendMail({
    from: fromAddress(),
    replyTo: env.mail.replyTo || undefined,
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

async function sendViaZeptoApi(to: string, template: MailTemplate): Promise<void> {
  const client = getZeptoApi();
  if (!client) throw new Error('ZEPTOMAIL_TOKEN is missing');

  const from = parseFrom();
  const payload: Parameters<SendMailClient['sendMail']>[0] = {
    from: {
      address: from.address,
      name: from.name,
    },
    to: [
      {
        email_address: {
          address: to,
          name: to.split('@')[0] || to,
        },
      },
    ],
    subject: template.subject,
    htmlbody: template.html,
    textbody: template.text,
  };

  if (env.mail.replyTo) {
    payload.reply_to = [{ address: env.mail.replyTo, name: env.mail.fromName }];
  }

  await client.sendMail(payload);
}

export const mailService = {
  enabled(): boolean {
    if (env.mail.driver === 'log') return true;
    // ZeptoMail SMTP (nodemailer) — your smtp.zeptomail.in setup
    if (env.mail.driver === 'zeptomail') return Boolean(env.smtp.user && env.smtp.pass);
    // Optional HTTP API driver
    if (env.mail.driver === 'zeptomail_api') return Boolean(env.mail.zeptomail.token);
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
      if (env.mail.driver === 'zeptomail' || env.mail.driver === 'zoho') {
        await sendViaSmtp(to, template);
      } else if (env.mail.driver === 'zeptomail_api') {
        await sendViaZeptoApi(to, template);
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
      // Never fail the calling business action (e.g. member create) because mail is down.
      logger.error({ err, to, subject: template.subject, driver: env.mail.driver }, 'Email send failed');
    }
  },
};

export default mailService;
