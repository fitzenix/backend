import type { FilterQuery, Types } from 'mongoose';
import { MembershipPlan, type IMembershipPlan, type MembershipPlanDocument } from './membershipPlan.model';
import { Subscription, type ISubscription, type SubscriptionDocument } from './subscription.model';
import { User } from '../users/user.model';
import { Payment } from '../payments/payment.model';
import { Invoice } from '../payments/invoice.model';
import { ApiError } from '../../utils/ApiError';
import { ROLES, SUBSCRIPTION_STATUS, PAYMENT_STATUS, INVOICE_STATUS, CURRENCY } from '../../config/constants';
import { parseListQuery, buildSearchFilter } from '../../utils/pagination';
import { notificationService } from '../notifications/notification.service';
import { numericId } from '../../utils/ids';
import type { Ctx, Paginated } from '../../types/index';
import type { ListQuery, CreatePlanInput, UpdatePlanInput, CreateSubscriptionInput } from './membership.validators';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function requireTenant(ctx: Ctx): string {
  if (!ctx.tenantId) throw ApiError.badRequest('A gym context is required');
  return ctx.tenantId;
}

export const membershipService = {
  // ── Plans ────────────────────────────────────────────
  async listPlans(ctx: Ctx): Promise<Paginated<MembershipPlanDocument>> {
    const gym = requireTenant(ctx);
    const q = (ctx.validatedQuery ?? {}) as ListQuery;
    const { page, limit, skip, sort, search } = parseListQuery(q);
    const filter: FilterQuery<IMembershipPlan> = {
      gym,
      deletedAt: null,
      ...buildSearchFilter(search, ['name']),
    };
    if (q.isActive !== undefined) filter.isActive = q.isActive;
    const [items, total] = await Promise.all([
      MembershipPlan.find(filter).sort(sort).skip(skip).limit(limit),
      MembershipPlan.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async createPlan(ctx: Ctx, data: CreatePlanInput): Promise<MembershipPlanDocument> {
    return MembershipPlan.create({ ...data, gym: requireTenant(ctx) });
  },

  async getPlan(ctx: Ctx, id: string): Promise<MembershipPlanDocument> {
    const plan = await MembershipPlan.findOne({ _id: id, gym: requireTenant(ctx), deletedAt: null });
    if (!plan) throw ApiError.notFound('Plan not found');
    return plan;
  },

  async updatePlan(ctx: Ctx, id: string, data: UpdatePlanInput): Promise<MembershipPlanDocument> {
    const plan = await this.getPlan(ctx, id);
    Object.assign(plan, data);
    await plan.save();
    return plan;
  },

  async removePlan(ctx: Ctx, id: string): Promise<{ deleted: true }> {
    const plan = await this.getPlan(ctx, id);
    plan.deletedAt = new Date();
    plan.isActive = false;
    await plan.save();
    return { deleted: true };
  },

  // ── Subscriptions ────────────────────────────────────
  async listSubscriptions(ctx: Ctx): Promise<Paginated<SubscriptionDocument>> {
    const gym = requireTenant(ctx);
    const q = (ctx.validatedQuery ?? {}) as ListQuery;
    const { page, limit, skip, sort } = parseListQuery(q);
    const filter: FilterQuery<ISubscription> = { gym };
    if (q.status) filter.status = q.status;
    if (ctx.user.role === ROLES.MEMBER) filter.member = ctx.user._id;
    else if (q.memberId) filter.member = q.memberId;

    const [items, total] = await Promise.all([
      Subscription.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('member', 'name email')
        .populate('plan', 'name durationDays pricePaise'),
      Subscription.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async createSubscription(ctx: Ctx, input: CreateSubscriptionInput): Promise<SubscriptionDocument> {
    const gym = requireTenant(ctx);
    const member = await User.findOne({ _id: input.memberId, gym, role: ROLES.MEMBER, deletedAt: null });
    if (!member) throw ApiError.notFound('Member not found in this gym');

    const plan = await this.getPlan(ctx, input.planId);
    const start = input.startDate ? new Date(input.startDate) : new Date();
    const end = addDays(start, plan.durationDays);

    const sub = await Subscription.create({
      gym,
      member: member._id,
      plan: plan._id,
      planSnapshot: {
        name: plan.name,
        durationDays: plan.durationDays,
        pricePaise: plan.pricePaise,
        features: plan.features ?? [],
      },
      startDate: start,
      endDate: end,
      autoRenew: Boolean(input.autoRenew),
      status: input.markPaid ? SUBSCRIPTION_STATUS.ACTIVE : SUBSCRIPTION_STATUS.PENDING,
    });

    if (input.markPaid) {
      // Manual (cash/offline) collection — record it so it counts toward gym revenue & finance reports.
      const payment = await Payment.create({
        gym,
        member: member._id,
        subscription: sub._id,
        provider: 'manual',
        amountPaise: plan.pricePaise,
        currency: CURRENCY,
        status: PAYMENT_STATUS.PAID,
        purpose: 'subscription',
        paidAt: new Date(),
        notes: { markedPaidBy: String(ctx.user._id), manual: true },
      });
      sub.payment = payment._id;
      await sub.save();

      await Invoice.create({
        gym,
        member: member._id,
        payment: payment._id,
        number: `INV-${new Date().getFullYear()}-${numericId(8)}`,
        items: [
          {
            description: `Membership: ${plan.name}`,
            quantity: 1,
            unitPricePaise: plan.pricePaise,
            amountPaise: plan.pricePaise,
          },
        ],
        subtotalPaise: plan.pricePaise,
        taxPaise: 0,
        totalPaise: plan.pricePaise,
        currency: CURRENCY,
        status: INVOICE_STATUS.PAID,
        paidAt: new Date(),
      });

      await notificationService.notify({
        gym,
        user: member._id,
        type: 'membership',
        title: 'Membership activated',
        body: `Your ${plan.name} membership is active until ${end.toDateString()}.`,
      });
    }
    return sub;
  },

  /** Activate a subscription once its payment is captured. */
  async activateSubscription(subscriptionId: Types.ObjectId | string, paymentId?: Types.ObjectId | string): Promise<SubscriptionDocument> {
    const sub = await Subscription.findById(subscriptionId);
    if (!sub) throw ApiError.notFound('Subscription not found');
    sub.status = SUBSCRIPTION_STATUS.ACTIVE;
    if (paymentId) sub.payment = paymentId as Types.ObjectId;
    await sub.save();
    await notificationService.notify({
      gym: sub.gym,
      user: sub.member,
      type: 'membership',
      title: 'Membership activated',
      body: `Your ${sub.planSnapshot?.name ?? 'membership'} is now active.`,
    });
    return sub;
  },

  async cancelSubscription(ctx: Ctx, id: string): Promise<SubscriptionDocument> {
    const filter: FilterQuery<ISubscription> = { _id: id, gym: requireTenant(ctx) };
    if (ctx.user.role === ROLES.MEMBER) filter.member = ctx.user._id;
    const sub = await Subscription.findOne(filter);
    if (!sub) throw ApiError.notFound('Subscription not found');
    sub.status = SUBSCRIPTION_STATUS.CANCELLED;
    sub.cancelledAt = new Date();
    sub.autoRenew = false;
    await sub.save();
    return sub;
  },

  async currentForMember(ctx: Ctx, memberId: Types.ObjectId | string): Promise<SubscriptionDocument | null> {
    return Subscription.findOne({
      gym: requireTenant(ctx),
      member: memberId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      endDate: { $gte: new Date() },
    })
      .sort({ endDate: -1 })
      .populate('plan', 'name description durationDays pricePaise features trainerIncluded');
  },

  /**
   * Member "My Plan" screen payload — plan name, validity, and feature list.
   * Falls back to planSnapshot.features if the live plan doc is missing features.
   */
  async myPlan(ctx: Ctx): Promise<{
    hasPlan: boolean;
    subscriptionId: string | null;
    status: string | null;
    planName: string | null;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
    daysRemaining: number | null;
    pricePaise: number | null;
    durationDays: number | null;
    trainerIncluded: boolean;
    autoRenew: boolean;
    features: string[];
  }> {
    const sub = await this.currentForMember(ctx, ctx.user._id);
    if (!sub) {
      return {
        hasPlan: false,
        subscriptionId: null,
        status: null,
        planName: null,
        description: null,
        startDate: null,
        endDate: null,
        daysRemaining: null,
        pricePaise: null,
        durationDays: null,
        trainerIncluded: false,
        autoRenew: false,
        features: [],
      };
    }

    const plan =
      sub.plan && typeof sub.plan === 'object' && 'name' in (sub.plan as object)
        ? (sub.plan as unknown as {
            name?: string;
            description?: string;
            durationDays?: number;
            pricePaise?: number;
            features?: string[];
            trainerIncluded?: boolean;
          })
        : null;

    const features =
      (plan?.features && plan.features.length > 0
        ? plan.features
        : sub.planSnapshot?.features) ?? [];

    const end = new Date(sub.endDate);
    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));

    return {
      hasPlan: true,
      subscriptionId: String(sub._id),
      status: sub.status,
      planName: plan?.name ?? sub.planSnapshot?.name ?? 'Membership',
      description: plan?.description ?? null,
      startDate: sub.startDate.toISOString(),
      endDate: end.toISOString(),
      daysRemaining,
      pricePaise: plan?.pricePaise ?? sub.planSnapshot?.pricePaise ?? null,
      durationDays: plan?.durationDays ?? sub.planSnapshot?.durationDays ?? null,
      trainerIncluded: Boolean(plan?.trainerIncluded),
      autoRenew: Boolean(sub.autoRenew),
      features: features.filter(Boolean),
    };
  },

  /** Batch: expire subscriptions past endDate. Used by the scheduler. */
  async expireDue(): Promise<{ expired: number }> {
    const res = await Subscription.updateMany(
      { status: SUBSCRIPTION_STATUS.ACTIVE, endDate: { $lt: new Date() } },
      { $set: { status: SUBSCRIPTION_STATUS.EXPIRED } },
    );
    return { expired: res.modifiedCount };
  },
};

export default membershipService;
