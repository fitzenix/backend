/** FITZENIX transactional email design tokens (2026 premium dark glass). */
const RED = '#FF1B27';
const BG = '#05070B';
const CARD = '#0F141C';
const GLASS = 'rgba(22, 28, 38, 0.72)';
const GLASS_DARK = 'rgba(15, 20, 28, 0.75)';
const WHITE = '#FFFFFF';
const TEXT_SEC = '#A1A1AA';
const TEXT_MUTED = '#71717A';
const BORDER = 'rgba(255,255,255,0.12)';
const BORDER_SOFT = 'rgba(255,255,255,0.08)';
const BORDER_STRONG = 'rgba(255,255,255,0.16)';
const FONT = 'Inter, Arial, Helvetica, sans-serif';

/** Hosted assets (Cloudinary) — required for email clients; local paths won't load in inbox. */
const LOGO_F = 'https://res.cloudinary.com/ukbxgzsu/image/upload/v1787402618/flogo_1_wwjjzu.png';
const LOGO_WORDMARK = 'https://res.cloudinary.com/ukbxgzsu/image/upload/v1787402606/Fitzenix_1_r7w1ia.png';

/**
 * PNG icons via img tags — Gmail/Outlook strip inline SVG, so hosted images are required.
 * Icons8 outline style tinted to FITZENIX red / success green.
 */
const ICON = {
  shield: 'https://img.icons8.com/ios-glyphs/16/22C55E/shield.png',
  clock: 'https://img.icons8.com/ios-glyphs/16/FF1B27/clock.png',
  mail: 'https://img.icons8.com/ios-glyphs/16/FF1B27/new-post.png',
  users: 'https://img.icons8.com/ios-glyphs/48/FF4D5A/conference-call.png',
  calendar: 'https://img.icons8.com/ios-glyphs/48/FF4D5A/calendar.png',
  dumbbell: 'https://img.icons8.com/ios-glyphs/48/FF4D5A/dumbbell.png',
  card: 'https://img.icons8.com/ios-glyphs/48/FF4D5A/bank-cards.png',
  chart: 'https://img.icons8.com/ios-glyphs/48/FF4D5A/combo-chart.png',
};

const SUPPORT = process.env.SUPPORT_EMAIL ?? 'support@fitzenix.com';

export type MailTemplate = { subject: string; html: string; text: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function otpDigits(code: string): string[] {
  return code.replace(/\s/g, '').slice(0, 6).padEnd(6, '0').split('');
}

/** Email-safe inline image (Gmail/Outlook compatible). */
function inlineIcon(src: string, size: number, alt = ''): string {
  return `<img src="${src}" width="${size}" height="${size}" alt="${escapeHtml(alt)}" style="display:inline-block;vertical-align:middle;border:0;outline:none;width:${size}px;height:${size}px;margin-right:6px;" />`;
}

function emailStyles(): string {
  return `<style type="text/css">
    @media only screen and (max-width: 600px) {
      .outer-pad { padding: 12px !important; }
      .card-pad { padding: 24px 20px !important; }
      .header-pad { padding: 24px 20px 0 !important; }
      .heading-main { font-size: 28px !important; }
      .desc-text { font-size: 14px !important; }
      .otp-box { width: 44px !important; height: 58px !important; font-size: 24px !important; }
      .otp-gap { padding: 0 3px !important; }
      .otp-wrap { width: 100% !important; max-width: 100% !important; }
      .badge-cell { display: block !important; width: 100% !important; text-align: left !important; padding-top: 14px !important; }
      .brand-cell { display: block !important; width: 100% !important; }
      .feature-col { width: 50% !important; padding-bottom: 18px !important; }
      .feature-icon-cell { width: 48px !important; height: 48px !important; }
      .feature-icon-img { width: 22px !important; height: 22px !important; }
    }
  </style>`;
}

function headerRow(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td valign="top" class="brand-cell" style="vertical-align:top;width:60%;">
        <table role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td valign="top" style="vertical-align:top;padding-right:12px;width:42px;">
              <img src="${LOGO_F}" width="42" height="42" alt="Fitzenix" style="display:block;border:0;outline:none;width:42px;height:42px;" />
            </td>
            <td valign="top" style="vertical-align:top;">
              <img src="${LOGO_WORDMARK}" width="140" height="24" alt="FITZENIX" style="display:block;border:0;outline:none;width:140px;max-width:140px;height:auto;" />
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding-top:6px;">
              <p style="margin:0;padding-left:54px;font-family:${FONT};font-size:13px;font-weight:500;color:${TEXT_SEC};line-height:1.35;">Manage. Grow. Succeed.</p>
            </td>
          </tr>
        </table>
      </td>
      <td valign="top" align="right" class="badge-cell" style="vertical-align:top;text-align:right;width:40%;">
        <table role="presentation" cellspacing="0" cellpadding="0" align="right" style="margin-left:auto;">
          <tr>
            <td align="center" style="font-family:${FONT};font-size:13px;font-weight:600;color:${WHITE};background-color:#141C26;background:rgba(20,28,38,0.75);border:1px solid rgba(255,27,39,0.45);border-radius:999px;padding:10px 16px;white-space:nowrap;">
              ${inlineIcon(ICON.shield, 16, 'Secure')}&nbsp;Secure Verification
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function otpDigitBoxes(code: string): string {
  const digits = otpDigits(code);
  const cells = digits
    .map(
      (d, i) => `<td class="otp-gap" style="padding:0 ${i === 0 || i === digits.length - 1 ? '0' : '6'}px;">
        <div class="otp-box" style="width:64px;height:80px;background:${GLASS_DARK};border:1px solid ${BORDER_STRONG};border-radius:14px;font-family:${FONT};font-size:32px;font-weight:700;color:${WHITE};text-align:center;line-height:80px;mso-line-height-rule:exactly;">${escapeHtml(d)}</div>
      </td>`,
    )
    .join('');

  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center" class="otp-wrap" style="margin:0 auto;max-width:480px;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" style="background:${GLASS};border:1px solid ${BORDER_STRONG};border-radius:22px;padding:20px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.05);">
        <tr>${cells}</tr>
      </table>
    </td></tr>
  </table>`;
}

function otpExpiry(minutes: number): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;">
    <tr>
      <td align="center" style="font-family:${FONT};font-size:15px;font-weight:400;color:${TEXT_SEC};text-align:center;line-height:1.5;">
        ${inlineIcon(ICON.clock, 16, 'Expires')}&nbsp;This OTP will expire in <span style="color:${RED};font-weight:600;">${minutes} minutes.</span>
      </td>
    </tr>
  </table>`;
}

function divider(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;"><tr><td style="height:1px;background:${BORDER_SOFT};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

function welcomeSection(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
    <tr>
      <td valign="middle" width="4" style="width:4px;padding-right:12px;vertical-align:middle;">
        <table role="presentation" cellspacing="0" cellpadding="0">
          <tr><td width="4" height="32" style="width:4px;height:32px;background-color:${RED};border-radius:999px;font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
      </td>
      <td valign="middle" style="vertical-align:middle;">
        <p style="margin:0;font-family:${FONT};font-size:18px;font-weight:700;color:${WHITE};line-height:1.3;">Welcome to FITZENIX!</p>
        <p style="margin:6px 0 0;font-family:${FONT};font-size:14px;font-weight:400;color:${TEXT_SEC};line-height:1.45;">Your all-in-one gym management solution.</p>
      </td>
    </tr>
  </table>`;
}

function featureIcon(iconSrc: string, label: string): string {
  return `<td align="center" valign="top" class="feature-col" width="20%" style="width:20%;padding:0 4px;vertical-align:top;text-align:center;">
    <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 10px;">
      <tr>
        <td align="center" valign="middle" class="feature-icon-cell" width="56" height="56" style="width:56px;height:56px;background-color:#141A24;background:rgba(20,26,36,0.8);border:1px solid rgba(255,27,39,0.30);border-radius:50%;text-align:center;vertical-align:middle;">
          <img src="${iconSrc}" class="feature-icon-img" width="26" height="26" alt="" style="display:block;margin:0 auto;border:0;outline:none;width:26px;height:26px;max-width:26px;" />
        </td>
      </tr>
    </table>
    <p style="margin:0 auto;font-family:${FONT};font-size:12px;font-weight:600;color:${WHITE};line-height:1.35;text-align:center;max-width:96px;">${label}</p>
  </td>`;
}

function featuresRow(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;table-layout:fixed;">
    <tr>
      ${featureIcon(ICON.users, 'Manage<br/>Members')}
      ${featureIcon(ICON.calendar, 'Track<br/>Attendance')}
      ${featureIcon(ICON.dumbbell, 'Workout<br/>Plans')}
      ${featureIcon(ICON.card, 'Easy<br/>Billing')}
      ${featureIcon(ICON.chart, 'Smart<br/>Reports')}
    </tr>
  </table>`;
}

function footer(): string {
  const year = new Date().getFullYear();
  return `${divider()}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;">
    <tr>
      <td align="center" style="text-align:center;">
        <p style="margin:0;font-family:${FONT};font-size:14px;font-weight:400;color:${TEXT_SEC};line-height:1.55;text-align:center;">
          ${inlineIcon(ICON.mail, 16, 'Mail')}&nbsp;Need help? Contact us at <a href="mailto:${escapeHtml(SUPPORT)}" style="color:${RED};font-weight:600;text-decoration:none;">${escapeHtml(SUPPORT)}</a>
        </p>
        <p style="margin:14px 0 0;font-family:${FONT};font-size:12px;font-weight:400;color:${TEXT_MUTED};line-height:1.4;">&copy; ${year} FITZENIX. All rights reserved.</p>
      </td>
    </tr>
  </table>`;
}

function layout(opts: {
  preheader: string;
  titleHtml: string;
  introHtml: string;
  bodyHtml: string;
  showWelcome?: boolean;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>FITZENIX</title>
  ${emailStyles()}
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:${FONT};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BG};background-image:radial-gradient(circle at 15% 10%, rgba(255,59,75,0.12) 0%, transparent 32%), radial-gradient(circle at 85% 15%, rgba(45,180,255,0.08) 0%, transparent 30%);">
    <tr>
      <td align="center" class="outer-pad" style="padding:24px 12px;">
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px;width:100%;background-color:${CARD};background:${CARD};border:1px solid ${BORDER};border-radius:28px;box-shadow:0 24px 70px rgba(0,0,0,0.45), 0 0 35px rgba(255,27,39,0.10), 0 0 35px rgba(55,190,255,0.08);">
          <tr>
            <td class="header-pad" style="padding:32px 32px 0;">
              ${headerRow()}
            </td>
          </tr>
          <tr>
            <td class="card-pad" style="padding:24px 32px 28px;">
              <h1 class="heading-main" style="margin:24px 0 0;font-family:${FONT};font-size:36px;font-weight:700;line-height:1.15;color:${WHITE};text-align:center;">${opts.titleHtml}</h1>
              <p class="desc-text" style="margin:12px auto 28px;max-width:480px;font-family:${FONT};font-size:16px;font-weight:400;line-height:1.55;color:${TEXT_SEC};text-align:center;">${opts.introHtml}</p>
              ${opts.bodyHtml}
              ${
                opts.showWelcome
                  ? `${divider()}${welcomeSection()}${featuresRow()}`
                  : ''
              }
              ${footer()}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function otpTitle(): string {
  return `Your <span style="color:${RED};">OTP</span> Code`;
}

function otpBoxSection(code: string, minutes: number): string {
  return `${otpDigitBoxes(code)}${otpExpiry(minutes)}`;
}

export function welcomeEmail(input: { name: string; gymName?: string; tempPassword?: string }): MailTemplate {
  const gym = input.gymName || 'Fitzenix';
  const first = escapeHtml(input.name.split(' ')[0] || 'there');
  const subject = `Welcome to ${gym} on FITZENIX`;
  const html = layout({
    preheader: `Your ${gym} workspace is ready on FITZENIX.`,
    titleHtml: `Welcome to <span style="color:${RED};">FITZENIX</span>`,
    introHtml: `Hi ${first}, your account at <strong style="color:${WHITE};font-weight:600;">${escapeHtml(gym)}</strong> is live. Verify your email with the OTP we sent, then sign in.`,
    bodyHtml: input.tempPassword
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 auto 8px;max-width:480px;"><tr><td style="padding:16px 18px;border-radius:14px;background:${GLASS};border:1px solid ${BORDER_STRONG};font-family:${FONT};font-size:14px;color:${WHITE};text-align:center;">Temporary password: <strong>${escapeHtml(input.tempPassword)}</strong></td></tr></table>`
      : '',
    showWelcome: true,
  });
  return { subject, html, text: `Welcome to ${gym}. Verify your email with the OTP, then sign in.` };
}

export function otpEmail(input: { name: string; code: string; purpose: string; minutes: number }): MailTemplate {
  const subjects: Record<string, string> = {
    verify_email: 'Your FITZENIX verification code',
    login: 'Your FITZENIX login code',
    reset: 'Reset your FITZENIX password',
    gym_transfer: 'Confirm your FITZENIX gym transfer',
  };
  const preheaders: Record<string, string> = {
    verify_email: 'Use your secure FITZENIX OTP to verify your email.',
    login: 'Use your secure FITZENIX OTP to finish signing in.',
    reset: 'Use your secure FITZENIX OTP to reset your password.',
    gym_transfer: 'Use your secure FITZENIX OTP to confirm your gym transfer.',
  };
  const intros: Record<string, string> = {
    verify_email: `Use the OTP below to verify your email and continue with <span style="color:${RED};font-weight:600;">FITZENIX</span>.`,
    login: `Use the OTP below to finish signing in to <span style="color:${RED};font-weight:600;">FITZENIX</span>.`,
    reset: `Use the OTP below to reset your <span style="color:${RED};font-weight:600;">FITZENIX</span> password.`,
    gym_transfer: `Use the OTP below to confirm moving your account on <span style="color:${RED};font-weight:600;">FITZENIX</span>.`,
  };
  const html = layout({
    preheader: preheaders[input.purpose] ?? preheaders.verify_email,
    titleHtml: otpTitle(),
    introHtml: intros[input.purpose] ?? intros.verify_email,
    bodyHtml: otpBoxSection(input.code, input.minutes),
    showWelcome: true,
  });
  return {
    subject: subjects[input.purpose] ?? subjects.verify_email,
    html,
    text: `Your FITZENIX OTP is ${input.code}. It expires in ${input.minutes} minutes.`,
  };
}

export function passwordResetEmail(input: { name: string; token: string; minutes: number }): MailTemplate {
  const first = escapeHtml(input.name.split(' ')[0] || 'there');
  const html = layout({
    preheader: 'Reset your FITZENIX password securely.',
    titleHtml: `Reset your <span style="color:${RED};">password</span>`,
    introHtml: `Hi ${first}, use this reset token in the app. It expires in <span style="color:${RED};font-weight:600;">${input.minutes} minutes.</span>`,
    bodyHtml: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 auto;max-width:480px;"><tr><td style="padding:18px 20px;border-radius:14px;background:${GLASS};border:1px solid ${BORDER_STRONG};font-family:${FONT};font-size:13px;color:${WHITE};word-break:break-all;text-align:center;">${escapeHtml(input.token)}</td></tr></table>`,
    showWelcome: false,
  });
  return { subject: 'Reset your FITZENIX password', html, text: `Reset token: ${input.token}` };
}

export function paymentReminderEmail(input: {
  name: string;
  gymName: string;
  planName: string;
  when: string;
  lapsed?: boolean;
}): MailTemplate {
  const first = escapeHtml(input.name.split(' ')[0] || 'there');
  const subject = input.lapsed
    ? `Renew your ${input.planName} at ${input.gymName}`
    : `Your ${input.planName} expires ${input.when}`;
  const html = layout({
    preheader: subject,
    titleHtml: input.lapsed ? `Membership <span style="color:${RED};">expired</span>` : `Renew before <span style="color:${RED};">access stops</span>`,
    introHtml: `Hi ${first}, your <strong style="color:${WHITE};font-weight:600;">${escapeHtml(input.planName)}</strong> at <strong style="color:${WHITE};font-weight:600;">${escapeHtml(input.gymName)}</strong> ${input.lapsed ? `expired ${escapeHtml(input.when)}.` : `expires ${escapeHtml(input.when)}.`} Renew in the FITZENIX app.`,
    bodyHtml: '',
    showWelcome: true,
  });
  return { subject, html, text: subject };
}

export function gymTransferRequestEmail(input: {
  name: string;
  fromGym: string;
  toGym: string;
  code: string;
  minutes: number;
}): MailTemplate {
  const first = escapeHtml(input.name.split(' ')[0] || 'there');
  const subject = `${input.toGym} wants you to join on FITZENIX`;
  const html = layout({
    preheader: `Confirm your move from ${input.fromGym} to ${input.toGym}.`,
    titleHtml: otpTitle(),
    introHtml: `Hi ${first}, <strong style="color:${WHITE};font-weight:600;">${escapeHtml(input.toGym)}</strong> asked to add you. Your history at <strong style="color:${WHITE};font-weight:600;">${escapeHtml(input.fromGym)}</strong> is kept. Confirm with the OTP below.`,
    bodyHtml: otpBoxSection(input.code, input.minutes),
    showWelcome: true,
  });
  return {
    subject,
    html,
    text: `${input.toGym} requested a transfer. OTP: ${input.code}.`,
  };
}

export function gymTransferCompleteEmail(input: { name: string; fromGym: string; toGym: string }): MailTemplate {
  const first = escapeHtml(input.name.split(' ')[0] || 'there');
  const subject = `You're now a member of ${input.toGym}`;
  const html = layout({
    preheader: subject,
    titleHtml: `Transfer <span style="color:${RED};">complete</span>`,
    introHtml: `Hi ${first}, your FITZENIX login now belongs to <strong style="color:${WHITE};font-weight:600;">${escapeHtml(input.toGym)}</strong>. ${escapeHtml(input.fromGym)} still holds your past attendance, payments, and membership records.`,
    bodyHtml: '',
    showWelcome: true,
  });
  return { subject, html, text: subject };
}
