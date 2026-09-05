import crypto from 'node:crypto';
import { Gym, type GymDocument } from '../gyms/gym.model';
import { Payment, type PaymentDocument } from '../payments/payment.model';
import { User } from '../users/user.model';
import { Expense } from '../finance/expense.model';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';
import {
  CURRENCY,
  GYM_STATUS,
  PAYMENT_STATUS,
  PAYMENT_PURPOSE,
  EXPENSE_CATEGORIES,
  ROLES,
  type GymPlanId,
} from '../../config/constants';
import { getPaymentGateway } from '../../services/payments/index';
import { MockGateway } from '../../services/payments/MockGateway';
import { logger } from '../../config/logger';
import { notificationService } from '../notifications/notification.service';
import type { Ctx } from '../../types/index';
import { PLATFORM_PLAN_LIST, getPlatformPlan } from './billing.plans';
import { computeGymAccess, type GymAccessState } from './billing.access';
import type { BillingCheckoutInput, BillingVerifyInput, BillingUpiCollectInput } from './billing.validators';
import {
  getRazorpayClient,
  mapRazorpayError,
  waitForRazorpayPayment,
} from '../../services/payments/razorpayUpi';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Razorpay UPI pre-select needs a valid 10-digit Indian mobile in prefill.contact. */
function normalizeIndianPhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length >= 6 ? digits : undefined;
}

async function loadGym(ctx: Ctx): Promise<GymDocument> {
  if (!ctx.user.gym) throw ApiError.badRequest('A gym context is required');
  const gym = await Gym.findOne({ _id: ctx.user.gym, deletedAt: null });
  if (!gym) throw ApiError.notFound('Gym not found');
  return gym;
}

export const billingService = {
  listPlans() {
    return {
      trialDays: 14,
      noSetupFee: true,
      cancelAnytime: true,
      currency: CURRENCY,
      plans: PLATFORM_PLAN_LIST,
    };
  },

  async status(ctx: Ctx): Promise<{ gymId: string; gymName: string; access: GymAccessState }> {
    const gym = await this.ensureFresh(await loadGym(ctx));
    await this.syncSaasExpenses(gym);
    return { gymId: String(gym._id), gymName: gym.name, access: computeGymAccess(gym) };
  },

  /**
   * Persist expiry if trial/period has lapsed. Called from the scheduler and
   * lazily on every access check so a missed cron tick cannot leave a gym open.
   */
  async ensureFresh(gym: GymDocument): Promise<GymDocument> {
    const access = computeGymAccess(gym);
    if (access.allowed) return gym;
    if (gym.status !== GYM_STATUS.SUSPENDED) {
      gym.status = GYM_STATUS.SUSPENDED;
      await gym.save();
      logger.info({ gymId: String(gym._id), reason: access.reason }, 'Gym access expired');
    }
    return gym;
  },

  async expireDue(): Promise<{ expired: number }> {
    const now = new Date();
    const due = await Gym.find({
      deletedAt: null,
      status: { $in: [GYM_STATUS.TRIAL, GYM_STATUS.ACTIVE] },
      $or: [
        { status: GYM_STATUS.TRIAL, trialEndsAt: { $lte: now }, $or: [{ planPeriodEnd: null }, { planPeriodEnd: { $exists: false } }, { planPeriodEnd: { $lte: now } }] },
        { planPeriodEnd: { $lte: now } },
      ],
    });

    let expired = 0;
    for (const gym of due) {
      const access = computeGymAccess(gym);
      if (access.allowed) continue;
      gym.status = GYM_STATUS.SUSPENDED;
      // eslint-disable-next-line no-await-in-loop
      await gym.save();
      expired += 1;
    }
    return { expired };
  },

  async checkout(ctx: Ctx, { plan }: BillingCheckoutInput) {
    if (ctx.user.role !== ROLES.GYM_OWNER && ctx.user.role !== ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Only the gym owner can purchase a Fitzenix plan');
    }
    const gym = await loadGym(ctx);
    const catalog = getPlatformPlan(plan);
    if (!catalog) throw ApiError.badRequest('Unknown plan');

    const gateway = getPaymentGateway();
    const order = await gateway.createOrder({
      amountPaise: catalog.pricePaise,
      currency: CURRENCY,
      receipt: `g${String(gym._id).slice(-8)}${plan}${Date.now()}`.slice(0, 40),
      notes: { purpose: 'platform', gymId: String(gym._id), plan },
    });

    const payment = await Payment.create({
      gym: gym._id,
      member: gym.owner,
      subscription: null,
      provider: env.payments.gateway,
      orderId: order.id,
      amountPaise: catalog.pricePaise,
      currency: CURRENCY,
      status: PAYMENT_STATUS.CREATED,
      purpose: PAYMENT_PURPOSE.PLATFORM,
      notes: { purpose: 'platform', plan, gymId: String(gym._id) },
      raw: order.raw as Record<string, unknown>,
    });

    const mock = env.payments.gateway === 'mock';
    const mockPaymentId = mock ? `pay_mock_${crypto.randomBytes(8).toString('hex')}` : undefined;
    const mockSignature =
      mock && mockPaymentId ? MockGateway.sign(`${order.id}|${mockPaymentId}`) : undefined;

    return {
      paymentId: String(payment._id),
      plan: catalog,
      order: { id: order.id, amount: order.amount, currency: order.currency },
      keyId: env.payments.razorpay.keyId,
      name: 'FITZENIX',
      description: `${catalog.name} plan · ${catalog.periodDays} days`,
      prefill: {
        name: ctx.user.name,
        email: ctx.user.email,
        contact: normalizeIndianPhone(ctx.user.phone),
      },
      checkoutPath: `/api/v1/billing/checkout-html?orderId=${encodeURIComponent(order.id)}`,
      mock,
      mockPaymentId,
      mockSignature,
    };
  },

  /** UPI Collect via Razorpay API (used when owner pays with UPI). */
  async upiCollect(ctx: Ctx, { plan, vpa }: BillingUpiCollectInput) {
    if (ctx.user.role !== ROLES.GYM_OWNER && ctx.user.role !== ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Only the gym owner can purchase a Fitzenix plan');
    }
    if (env.payments.gateway !== 'razorpay') {
      throw ApiError.badRequest('UPI collect is only available with Razorpay.');
    }
    const gym = await loadGym(ctx);
    const catalog = getPlatformPlan(plan);
    if (!catalog) throw ApiError.badRequest('Unknown plan');

    const contact = normalizeIndianPhone(ctx.user.phone);
    if (!ctx.user.email || !contact) {
      throw ApiError.badRequest('Add your email and 10-digit phone in Profile before paying with UPI.');
    }

    const rzp = await getRazorpayClient();

    let vpaValid = false;
    try {
      const check = await rzp.payments.validateVpa({ vpa: vpa.toLowerCase() });
      vpaValid = check.success;
    } catch (err) {
      throw mapRazorpayError(err);
    }
    if (!vpaValid) throw ApiError.badRequest('Invalid UPI ID. Check and try again.');

    const gateway = getPaymentGateway();
    const order = await gateway.createOrder({
      amountPaise: catalog.pricePaise,
      currency: CURRENCY,
      method: 'upi',
      receipt: `g${String(gym._id).slice(-8)}${plan}u${Date.now()}`.slice(0, 40),
      notes: { purpose: 'platform', gymId: String(gym._id), plan },
    });

    const payment = await Payment.create({
      gym: gym._id,
      member: gym.owner,
      subscription: null,
      provider: env.payments.gateway,
      orderId: order.id,
      amountPaise: catalog.pricePaise,
      currency: CURRENCY,
      status: PAYMENT_STATUS.CREATED,
      purpose: PAYMENT_PURPOSE.PLATFORM,
      notes: { purpose: 'platform', plan, gymId: String(gym._id), vpa },
      raw: order.raw as Record<string, unknown>,
    });

    let upiPaymentId: string;
    try {
      const created = await rzp.payments.createUpi({
        amount: catalog.pricePaise,
        currency: CURRENCY,
        order_id: order.id,
        email: ctx.user.email,
        contact,
        method: 'upi',
        ip: '127.0.0.1',
        referer: 'https://fitzenix.app/billing',
        user_agent: 'FitzenixApp/1.0 Android',
        description: `Fitzenix ${catalog.name} plan`,
        notes: { purpose: 'platform', plan, gymId: String(gym._id) },
        upi: { flow: 'collect', vpa: vpa.toLowerCase(), expiry_time: 10 },
      });
      upiPaymentId = created.razorpay_payment_id;
    } catch (err) {
      payment.status = PAYMENT_STATUS.FAILED;
      await payment.save();
      throw mapRazorpayError(err);
    }

    payment.paymentId = upiPaymentId;
    await payment.save();

    const final = await waitForRazorpayPayment(upiPaymentId);
    if (final.status === 'failed') {
      payment.status = PAYMENT_STATUS.FAILED;
      await payment.save();
      throw ApiError.badRequest('UPI payment failed. Try another UPI ID or use card payment.');
    }

    await this.activateFromPayment(payment, upiPaymentId);
    const fresh = await Gym.findById(gym._id);
    return { paymentId: upiPaymentId, orderId: order.id, access: computeGymAccess(fresh!) };
  },

  async verify(ctx: Ctx, input: BillingVerifyInput): Promise<{ payment: PaymentDocument; access: GymAccessState }> {
    const gym = await loadGym(ctx);
    const payment = await this.settleBySignature(input.orderId, input.paymentId, input.signature);
    if (String(payment.gym) !== String(gym._id)) throw ApiError.forbidden('Payment does not belong to this gym');
    const fresh = await Gym.findById(gym._id);
    return { payment, access: computeGymAccess(fresh!) };
  },

  /** Used by the hosted checkout page (signature is the auth). */
  async settleBySignature(orderId: string, paymentId: string, signature: string): Promise<PaymentDocument> {
    const gateway = getPaymentGateway();
    if (!gateway.verifyPaymentSignature({ orderId, paymentId, signature })) {
      throw ApiError.badRequest('Invalid payment signature');
    }
    const payment = await Payment.findOne({ orderId, purpose: PAYMENT_PURPOSE.PLATFORM });
    if (!payment) throw ApiError.notFound('Payment not found');
    if (payment.status === PAYMENT_STATUS.PAID) return payment;
    await this.activateFromPayment(payment, paymentId);
    return payment;
  },

  async activateFromPayment(payment: PaymentDocument, providerPaymentId: string): Promise<GymDocument> {
    payment.status = PAYMENT_STATUS.PAID;
    payment.paymentId = providerPaymentId;
    payment.paidAt = new Date();
    await payment.save();

    const planId = String(payment.notes?.plan ?? '') as GymPlanId;
    const catalog = getPlatformPlan(planId);
    if (!catalog) throw ApiError.badRequest('Payment is missing a valid plan');

    const gym = await Gym.findById(payment.gym);
    if (!gym) throw ApiError.notFound('Gym not found');

    const from = gym.planPeriodEnd && gym.planPeriodEnd.getTime() > Date.now() ? gym.planPeriodEnd : new Date();
    gym.status = GYM_STATUS.ACTIVE;
    gym.plan = catalog.id;
    gym.planPaidAt = new Date();
    gym.planPeriodEnd = addDays(from, catalog.periodDays);
    gym.lastPaymentId = payment._id;
    await gym.save();

    await this.recordSaasExpense(payment, catalog.name, gym.owner);

    const owner = await User.findById(gym.owner);
    if (owner) {
      await notificationService.notify({
        gym: gym._id,
        user: owner._id,
        type: 'payment',
        event: 'owner.payment_received',
        title: 'Fitzenix plan activated',
        body: `${catalog.name} is active until ${gym.planPeriodEnd.toLocaleDateString('en-IN')}.`,
        data: { plan: catalog.id, deepLink: 'Billing' },
      });
    }

    logger.info({ gymId: String(gym._id), plan: catalog.id }, 'Gym SaaS plan activated');
    return gym;
  },

  async recordSaasExpense(payment: PaymentDocument, planName: string, ownerId: GymDocument['owner']) {
    const note = `saas:${String(payment._id)}`;
    const existing = await Expense.findOne({ gym: payment.gym, note });
    if (existing) return existing;
    return Expense.create({
      gym: payment.gym,
      category: EXPENSE_CATEGORIES.MAINTENANCE,
      title: `Fitzenix ${planName} plan`,
      amountPaise: payment.amountPaise,
      note,
      date: payment.paidAt ?? new Date(),
      recordedBy: ownerId,
    });
  },

  /** Turn already-paid SaaS charges into gym expenses (idempotent). */
  async syncSaasExpenses(gym: GymDocument) {
    const paid = await Payment.find({
      gym: gym._id,
      status: PAYMENT_STATUS.PAID,
      $or: [{ purpose: PAYMENT_PURPOSE.PLATFORM }, { 'notes.purpose': PAYMENT_PURPOSE.PLATFORM }],
    });
    for (const payment of paid) {
      const planId = String(payment.notes?.plan ?? '');
      const catalog = getPlatformPlan(planId);
      // eslint-disable-next-line no-await-in-loop
      await this.recordSaasExpense(payment, catalog?.name ?? 'plan', gym.owner);
    }
  },

  async checkoutPage(orderId: string): Promise<{ html: string } | { alreadyPaid: true }> {
    const payment = await Payment.findOne({ orderId, purpose: PAYMENT_PURPOSE.PLATFORM });
    if (!payment) throw ApiError.notFound('Order not found');
    if (payment.status === PAYMENT_STATUS.PAID) return { alreadyPaid: true };

    const gym = await Gym.findById(payment.gym);
    const owner = gym ? await User.findById(gym.owner) : null;
    const planId = String(payment.notes?.plan ?? '');
    const catalog = getPlatformPlan(planId);
    const keyId = env.payments.razorpay.keyId || '';

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FITZENIX · Pay</title>
  <style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,sans-serif; background:#000; color:#fff;
      display:flex; min-height:100vh; align-items:center; justify-content:center; }
    .card { width:min(420px,92vw); background:#111; border:1px solid #2a2a2a; border-radius:16px; padding:28px; text-align:center; }
    .brand { color:#D90429; letter-spacing:4px; font-weight:800; font-size:13px; }
    h1 { margin:12px 0 6px; font-size:22px; }
    p { color:#9ca3af; font-size:14px; }
    button { margin-top:18px; width:100%; height:52px; border:0; border-radius:12px; background:#D90429; color:#fff;
      font-weight:700; font-size:16px; }
    .ok { color:#22c55e; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">FITZENIX</div>
    <h1>${catalog?.name ?? 'Plan'} · ₹${(payment.amountPaise / 100).toLocaleString('en-IN')}</h1>
    <p id="msg">Complete payment with Razorpay to activate your gym.</p>
    <button id="pay">Pay securely</button>
  </div>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    const payload = ${JSON.stringify({
      key: keyId,
      amount: payment.amountPaise,
      currency: payment.currency,
      order_id: payment.orderId,
      name: 'FITZENIX',
      description: catalog ? `${catalog.name} plan` : 'Fitzenix plan',
      prefill: {
        name: owner?.name,
        email: owner?.email,
        contact: normalizeIndianPhone(owner?.phone),
      },
      theme: { color: '#D90429', backdrop_color: '#000000' },
    })};
    const btn = document.getElementById('pay');
    const msg = document.getElementById('msg');
    function openPay() {
      const rzp = new Razorpay({
        ...payload,
        handler: async function (res) {
          msg.textContent = 'Verifying payment…';
          btn.disabled = true;
          try {
            const r = await fetch('/api/v1/billing/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: res.razorpay_order_id,
                paymentId: res.razorpay_payment_id,
                signature: res.razorpay_signature,
              }),
            });
            const json = await r.json();
            if (!json.success) throw new Error(json.error?.message || 'Verify failed');
            msg.className = 'ok';
            msg.textContent = 'Payment successful. Return to the Fitzenix app.';
            btn.style.display = 'none';
          } catch (e) {
            msg.textContent = e.message || 'Could not verify payment';
            btn.disabled = false;
          }
        },
        modal: { ondismiss: function () { msg.textContent = 'Payment cancelled. You can try again.'; } },
      });
      rzp.open();
    }
    btn.addEventListener('click', openPay);
    openPay();
  </script>
</body>
</html>`;
    return { html };
  },
};
