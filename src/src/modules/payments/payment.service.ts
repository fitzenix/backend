import type { FilterQuery } from 'mongoose';
import { Payment, type IPayment, type PaymentDocument } from './payment.model';
import { Invoice, type InvoiceDocument } from './invoice.model';
import { Subscription } from '../memberships/subscription.model';
import { MembershipPlan } from '../memberships/membershipPlan.model';
import { User, type UserDocument } from '../users/user.model';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';
import { ROLES, PAYMENT_STATUS, PAYMENT_PURPOSE, SUBSCRIPTION_STATUS, INVOICE_STATUS, CURRENCY } from '../../config/constants';
import { parseListQuery } from '../../utils/pagination';
import { numericId } from '../../utils/ids';
import { getPaymentGateway } from '../../services/payments/index';
import { membershipService } from '../memberships/membership.service';
import { notificationService } from '../notifications/notification.service';
import { logger } from '../../config/logger';
import type { Ctx, Paginated } from '../../types/index';
import type { CheckoutInput, VerifyInput, ListQuery } from './payment.validators';

/** Razorpay webhook event shape (only the fields we consume). */
interface RazorpayWebhookEvent {
  event: string;
  payload?: { payment?: { entity?: { id: string; order_id: string } } };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function requireTenant(ctx: Ctx): string {
  if (!ctx.tenantId) throw ApiError.badRequest('A gym context is required');
  return ctx.tenantId;
}

export const paymentService = {
  /** Start a checkout for a membership plan: pending subscription + gateway order. */
  async checkout(ctx: Ctx, { planId, memberId }: CheckoutInput) {
    const gym = requireTenant(ctx);
    const gateway = getPaymentGateway();

    const member: UserDocument | null =
      ctx.user.role === ROLES.MEMBER
        ? ctx.user
        : await User.findOne({ _id: memberId, gym, role: ROLES.MEMBER, deletedAt: null });
    if (!member) throw ApiError.notFound('Member not found in this gym');

    const plan = await MembershipPlan.findOne({ _id: planId, gym, deletedAt: null });
    if (!plan) throw ApiError.notFound('Plan not found');

    const start = new Date();
    const sub = await Subscription.create({
      gym,
      member: member._id,
      plan: plan._id,
      planSnapshot: { name: plan.name, durationDays: plan.durationDays, pricePaise: plan.pricePaise },
      startDate: start,
      endDate: addDays(start, plan.durationDays),
      status: SUBSCRIPTION_STATUS.PENDING,
    });

    const order = await gateway.createOrder({
      amountPaise: plan.pricePaise,
      currency: CURRENCY,
      receipt: `sub_${sub._id}`,
      notes: { gymId: gym, subscriptionId: String(sub._id) },
    });

    const payment = await Payment.create({
      gym,
      member: member._id,
      subscription: sub._id,
      provider: env.payments.gateway,
      orderId: order.id,
      amountPaise: plan.pricePaise,
      currency: CURRENCY,
      status: PAYMENT_STATUS.CREATED,
      purpose: 'subscription',
      raw: order.raw as Record<string, unknown>,
    });

    sub.payment = payment._id;
    await sub.save();

    return {
      payment,
      subscription: sub,
      order: { id: order.id, amount: order.amount, currency: order.currency },
      keyId: env.payments.razorpay.keyId,
    };
  },

  /** Verify a client-confirmed payment signature and settle it. */
  async verify(ctx: Ctx, { orderId, paymentId, signature }: VerifyInput): Promise<PaymentDocument> {
    const gateway = getPaymentGateway();
    if (!gateway.verifyPaymentSignature({ orderId, paymentId, signature })) {
      throw ApiError.badRequest('Invalid payment signature');
    }
    const payment = await Payment.findOne({ orderId, gym: requireTenant(ctx) });
    if (!payment) throw ApiError.notFound('Payment not found');
    if (payment.status === PAYMENT_STATUS.PAID) return payment; // idempotent
    await this.settlePayment(payment, paymentId);
    return payment;
  },

  /** Handle a signature-verified webhook event. */
  async handleWebhookEvent(event: RazorpayWebhookEvent): Promise<{ handled: boolean }> {
    const entity = event?.payload?.payment?.entity;
    if (!entity) return { handled: false };

    const payment = await Payment.findOne({ orderId: entity.order_id });
    if (!payment) {
      logger.warn({ orderId: entity.order_id }, 'Webhook for unknown order');
      return { handled: false };
    }

    if (event.event === 'payment.captured' && payment.status !== PAYMENT_STATUS.PAID) {
      await this.settlePayment(payment, entity.id);
    } else if (event.event === 'payment.failed') {
      payment.status = PAYMENT_STATUS.FAILED;
      payment.paymentId = entity.id;
      await payment.save();
    }
    return { handled: true };
  },

  /** Shared settlement: mark paid, activate subscription, issue invoice, notify. */
  async settlePayment(payment: PaymentDocument, providerPaymentId: string): Promise<PaymentDocument> {
    payment.status = PAYMENT_STATUS.PAID;
    payment.paymentId = providerPaymentId;
    payment.paidAt = new Date();
    await payment.save();

    if (payment.purpose === PAYMENT_PURPOSE.PLATFORM) {
      const { billingService } = await import('../billing/billing.service');
      await billingService.activateFromPayment(payment, providerPaymentId);
      return payment;
    }

    if (payment.subscription) await membershipService.activateSubscription(payment.subscription, payment._id);
    await this.createInvoice(payment);

    await notificationService.notify({
      gym: payment.gym,
      user: payment.member,
      type: 'payment',
      event: 'member.payment_success',
      title: 'Payment received',
      body: `We received your payment of ₹${(payment.amountPaise / 100).toFixed(2)}.`,
      data: { paymentId: String(payment._id), deepLink: 'PaymentHistory', amount: (payment.amountPaise / 100).toFixed(2) },
    });
    return payment;
  },

  async createInvoice(payment: PaymentDocument): Promise<InvoiceDocument> {
    const existing = await Invoice.findOne({ payment: payment._id });
    if (existing) return existing;
    const sub = payment.subscription ? await Subscription.findById(payment.subscription) : null;
    const description = sub?.planSnapshot?.name ? `Membership: ${sub.planSnapshot.name}` : 'Gym payment';
    return Invoice.create({
      gym: payment.gym,
      member: payment.member,
      payment: payment._id,
      number: `INV-${new Date().getFullYear()}-${numericId(8)}`,
      items: [{ description, quantity: 1, unitPricePaise: payment.amountPaise, amountPaise: payment.amountPaise }],
      subtotalPaise: payment.amountPaise,
      taxPaise: 0,
      totalPaise: payment.amountPaise,
      status: INVOICE_STATUS.PAID,
      paidAt: payment.paidAt ?? new Date(),
    });
  },

  async refund(ctx: Ctx, id: string): Promise<PaymentDocument> {
    const payment = await Payment.findOne({ _id: id, gym: requireTenant(ctx) });
    if (!payment) throw ApiError.notFound('Payment not found');
    if (payment.status !== PAYMENT_STATUS.PAID) throw ApiError.badRequest('Only paid payments can be refunded');

    if (payment.provider === 'manual' || !payment.paymentId) {
      // Cash / offline collection — no gateway call needed.
      payment.status = PAYMENT_STATUS.REFUNDED;
      payment.refundId = `manual_${numericId(8)}`;
      await payment.save();
    } else {
      const gateway = getPaymentGateway();
      const refund = await gateway.refund({
        paymentId: payment.paymentId,
        amountPaise: payment.amountPaise,
      });
      payment.status = PAYMENT_STATUS.REFUNDED;
      payment.refundId = refund.id;
      await payment.save();
    }

    if (payment.subscription) {
      await Subscription.updateOne(
        { _id: payment.subscription },
        { $set: { status: SUBSCRIPTION_STATUS.CANCELLED, cancelledAt: new Date() } },
      );
    }
    await Invoice.updateOne({ payment: payment._id }, { $set: { status: INVOICE_STATUS.VOID } });
    return payment;
  },

  async list(ctx: Ctx): Promise<Paginated<PaymentDocument>> {
    const q = (ctx.validatedQuery ?? {}) as ListQuery;
    const { page, limit, skip, sort } = parseListQuery(q);
    const filter: FilterQuery<IPayment> = {
      gym: requireTenant(ctx),
      purpose: { $ne: PAYMENT_PURPOSE.PLATFORM },
      'notes.purpose': { $ne: PAYMENT_PURPOSE.PLATFORM },
    };
    if (ctx.user.role === ROLES.MEMBER) filter.member = ctx.user._id;
    else if (q.memberId) filter.member = q.memberId;
    if (q.status) filter.status = q.status;
    const [items, total] = await Promise.all([
      Payment.find(filter).sort(sort).skip(skip).limit(limit).populate('member', 'name email'),
      Payment.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async listInvoices(ctx: Ctx): Promise<Paginated<InvoiceDocument>> {
    const q = (ctx.validatedQuery ?? {}) as ListQuery;
    const { page, limit, skip, sort } = parseListQuery(q);
    const filter: Record<string, unknown> = {
      gym: requireTenant(ctx),
      number: { $not: /^FX-/ },
    };
    if (ctx.user.role === ROLES.MEMBER) filter.member = ctx.user._id;
    else if (q.memberId) filter.member = q.memberId;
    const [items, total] = await Promise.all([
      Invoice.find(filter).sort(sort).skip(skip).limit(limit).populate('member', 'name email'),
      Invoice.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async getInvoice(ctx: Ctx, id: string): Promise<InvoiceDocument> {
    const filter: Record<string, unknown> = { _id: id, gym: requireTenant(ctx) };
    if (ctx.user.role === ROLES.MEMBER) filter.member = ctx.user._id;
    const invoice = await Invoice.findOne(filter).populate('member', 'name email');
    if (!invoice) throw ApiError.notFound('Invoice not found');
    return invoice;
  },
};

export default paymentService;
