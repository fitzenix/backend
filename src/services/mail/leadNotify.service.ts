import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { Gym } from '../../modules/gyms/gym.model';
import type { UserDocument } from '../../modules/users/user.model';
import { mailService } from './mail.service';
import { leadAlertEmail, type LeadAlertKind } from './templates';

export type LeadNotifyInput = {
  kind: LeadAlertKind;
  user: Pick<UserDocument, 'name' | 'email' | 'phone' | 'gym'>;
  gymName?: string | null;
  plan?: string | null;
  amountPaise?: number | null;
  source?: string | null;
};

function formatInr(paise?: number | null): string | null {
  if (paise == null || !Number.isFinite(paise)) return null;
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

async function resolveGymName(
  user: LeadNotifyInput['user'],
  override?: string | null,
): Promise<string | null> {
  if (override?.trim()) return override.trim();
  if (!user.gym) return null;
  const gym = await Gym.findById(user.gym).select('name').lean();
  return gym?.name ?? null;
}

/**
 * Fire-and-forget ZeptoMail alert to the internal leads inbox.
 * Never throws to callers — lead mail must not break auth/checkout.
 */
export async function notifyLead(input: LeadNotifyInput): Promise<void> {
  const to = env.app.leadsEmail;
  if (!to) {
    logger.warn({ kind: input.kind }, 'LEADS_EMAIL not set — skipping lead alert');
    return;
  }
  if (!mailService.enabled()) {
    logger.warn({ kind: input.kind }, 'Mail disabled — skipping lead alert');
    return;
  }

  try {
    const gymName = await resolveGymName(input.user, input.gymName);
    await mailService.send(
      to,
      leadAlertEmail({
        kind: input.kind,
        name: input.user.name,
        email: input.user.email,
        phone: input.user.phone,
        gymName,
        plan: input.plan ?? null,
        amountLabel: formatInr(input.amountPaise),
        source: input.source ?? 'web',
      }),
    );
    logger.info({ kind: input.kind, to, email: input.user.email }, 'Lead alert emailed');
  } catch (err) {
    logger.error({ err, kind: input.kind }, 'Lead alert email failed');
  }
}

export const leadNotify = { notify: notifyLead };

export default leadNotify;
