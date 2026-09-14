/**
 * One-off ZeptoMail SMTP smoke test (nodemailer → smtp.zeptomail.in).
 *
 * Usage:
 *   1. Set SMTP_PASS in Backend/.env (ZeptoMail send token)
 *   2. npx tsx src/scripts/send-zeptomail-test.ts fitzenixofficial@gmail.com
 */
import { mailService } from '../services/mail/mail.service';
import { env } from '../config/env';

const to = process.argv[2] ?? 'fitzenixofficial@gmail.com';

async function main() {
  console.log('MAIL_DRIVER=', env.mail.driver);
  console.log('SMTP_HOST=', env.smtp.host);
  console.log('SMTP_PORT=', env.smtp.port);
  console.log('SMTP_USER=', env.smtp.user);
  console.log('FROM=', env.mail.fromEmail);
  console.log('TO=', to);
  console.log('SMTP_PASS set=', Boolean(env.smtp.pass));

  if (env.mail.driver !== 'zeptomail') {
    throw new Error('Set MAIL_DRIVER=zeptomail in Backend/.env');
  }
  if (!env.smtp.pass) {
    throw new Error('Set SMTP_PASS in Backend/.env (ZeptoMail send mail token / password)');
  }

  await mailService.send(to, {
    subject: 'FITZENIX ZeptoMail SMTP test',
    html: '<div><b>Test email sent successfully via Zoho ZeptoMail SMTP.</b></div>',
    text: 'Test email sent successfully via Zoho ZeptoMail SMTP.',
  });

  console.log('Done — check inbox (and spam) for', to);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
