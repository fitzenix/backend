import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { Expense, type IExpense, type ExpenseDocument } from './expense.model';
import { Payment } from '../payments/payment.model';
import { Invoice, type InvoiceDocument } from '../payments/invoice.model';
import { Subscription } from '../memberships/subscription.model';
import { User } from '../users/user.model';
import { ApiError } from '../../utils/ApiError';
import { ROLES, PAYMENT_STATUS, INVOICE_STATUS, SUBSCRIPTION_STATUS, CURRENCY } from '../../config/constants';
import { parseListQuery, buildSearchFilter } from '../../utils/pagination';
import { numericId } from '../../utils/ids';
import { notificationService } from '../notifications/notification.service';
import type { Ctx, Paginated } from '../../types/index';
import type {
  ExpenseListQuery,
  CreateExpenseInput,
  UpdateExpenseInput,
  CreateInvoiceInput,
  InvoiceListQuery,
  InvoiceNoteInput,
  DashboardQuery,
} from './finance.validators';

interface PopulatedName {
  name?: string;
}

interface TotalCountAgg {
  total: number;
  count: number;
}

interface CategoryAgg {
  _id: string;
  total: number;
}

interface MonthAgg {
  _id: { y: number; m: number };
  total: number;
}

function requireTenant(ctx: Ctx): string {
  if (!ctx.tenantId) throw ApiError.badRequest('A gym context is required');
  return ctx.tenantId;
}

export const financeService = {
  // ── Expenses ─────────────────────────────────────────
  async listExpenses(ctx: Ctx): Promise<Paginated<ExpenseDocument>> {
    const gym = requireTenant(ctx);
    const q = (ctx.validatedQuery ?? {}) as ExpenseListQuery;
    const { page, limit, skip, sort, search } = parseListQuery(q, { defaultSort: 'date' });
    const filter: FilterQuery<IExpense> = { gym, ...buildSearchFilter(search, ['title', 'note']) };
    if (q.category) filter.category = q.category;
    if (q.from || q.to) {
      filter.date = {};
      if (q.from) (filter.date as Record<string, Date>).$gte = new Date(q.from);
      if (q.to) (filter.date as Record<string, Date>).$lte = new Date(q.to);
    }
    const [items, total] = await Promise.all([
      Expense.find(filter).sort(sort).skip(skip).limit(limit).populate('recordedBy', 'name'),
      Expense.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async getExpense(ctx: Ctx, id: string): Promise<ExpenseDocument> {
    const expense = await Expense.findOne({ _id: id, gym: requireTenant(ctx) });
    if (!expense) throw ApiError.notFound('Expense not found');
    return expense;
  },

  async createExpense(ctx: Ctx, input: CreateExpenseInput): Promise<ExpenseDocument> {
    const gym = requireTenant(ctx);
    return Expense.create({
      gym,
      category: input.category,
      title: input.title,
      amountPaise: input.amountPaise,
      note: input.note,
      date: input.date ?? new Date(),
      recordedBy: ctx.user._id,
    });
  },

  async updateExpense(ctx: Ctx, id: string, input: UpdateExpenseInput): Promise<ExpenseDocument> {
    const expense = await this.getExpense(ctx, id);
    Object.assign(expense, input);
    await expense.save();
    return expense;
  },

  async deleteExpense(ctx: Ctx, id: string): Promise<{ deleted: true }> {
    const expense = await this.getExpense(ctx, id);
    await expense.deleteOne();
    return { deleted: true };
  },

  // ── Invoices (manual, owner-issued) ─────────────────────
  async listInvoices(ctx: Ctx): Promise<Paginated<InvoiceDocument>> {
    const gym = requireTenant(ctx);
    const q = (ctx.validatedQuery ?? {}) as InvoiceListQuery;
    const { page, limit, skip, sort, search } = parseListQuery(q, { defaultSort: 'createdAt' });
    const filter: Record<string, unknown> = { gym, ...buildSearchFilter(search, ['number']) };
    if (q.status) filter.status = q.status;
    if (q.memberId) filter.member = q.memberId;
    const [items, total] = await Promise.all([
      Invoice.find(filter).sort(sort).skip(skip).limit(limit).populate('member', 'name email avatar'),
      Invoice.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async getInvoice(ctx: Ctx, id: string): Promise<InvoiceDocument> {
    const invoice = await Invoice.findOne({ _id: id, gym: requireTenant(ctx) }).populate(
      'member',
      'name email avatar',
    );
    if (!invoice) throw ApiError.notFound('Invoice not found');
    return invoice;
  },

  async createInvoice(ctx: Ctx, input: CreateInvoiceInput): Promise<InvoiceDocument> {
    const gym = requireTenant(ctx);
    const member = await User.findOne({ _id: input.memberId, gym, role: ROLES.MEMBER, deletedAt: null });
    if (!member) throw ApiError.notFound('Member not found in this gym');

    const items = input.items.map((i) => {
      const quantity = i.quantity ?? 1;
      return {
        description: i.description,
        quantity,
        unitPricePaise: i.unitPricePaise,
        amountPaise: i.unitPricePaise * quantity,
      };
    });
    const subtotalPaise = items.reduce((sum, i) => sum + i.amountPaise, 0);
    const taxPaise = input.taxPaise ?? 0;
    const totalPaise = subtotalPaise + taxPaise;

    const invoice = await Invoice.create({
      gym,
      member: member._id,
      number: `INV-${new Date().getFullYear()}-${numericId(8)}`,
      items,
      subtotalPaise,
      taxPaise,
      totalPaise,
      currency: CURRENCY,
      status: INVOICE_STATUS.UNPAID,
      note: input.note,
      dueDate: input.dueDate,
      createdBy: ctx.user._id,
    });

    await notificationService
      .notify({
        gym,
        user: member._id,
        type: 'payment',
        title: 'New invoice',
        body: `You have a new invoice of \u20b9${(totalPaise / 100).toFixed(2)} (${invoice.number}).`,
        data: { invoiceId: String(invoice._id) },
      })
      .catch(() => undefined);

    if (input.markPaid) return this.markInvoicePaid(ctx, String(invoice._id), {});
    return invoice;
  },

  async markInvoicePaid(ctx: Ctx, id: string, { note }: InvoiceNoteInput): Promise<InvoiceDocument> {
    const gym = requireTenant(ctx);
    const invoice = await Invoice.findOne({ _id: id, gym });
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (invoice.status === INVOICE_STATUS.VOID) {
      throw ApiError.badRequest('Voided invoices cannot be marked as paid');
    }
    if (invoice.status === INVOICE_STATUS.PAID) return invoice;

    const payment = await Payment.create({
      gym,
      member: invoice.member,
      provider: 'manual',
      amountPaise: invoice.totalPaise,
      currency: invoice.currency,
      status: PAYMENT_STATUS.PAID,
      purpose: 'manual',
      paidAt: new Date(),
      notes: { invoiceId: String(invoice._id), markedPaidBy: String(ctx.user._id), note: note ?? '' },
    });

    invoice.payment = payment._id;
    invoice.status = INVOICE_STATUS.PAID;
    invoice.paidAt = new Date();
    if (note) invoice.note = note;
    await invoice.save();

    await notificationService
      .notify({
        gym,
        user: invoice.member,
        type: 'payment',
        title: 'Payment received',
        body: `Invoice ${invoice.number} has been marked as paid.`,
        data: { invoiceId: String(invoice._id) },
      })
      .catch(() => undefined);

    return invoice;
  },

  async markInvoiceUnpaid(ctx: Ctx, id: string, { note }: InvoiceNoteInput): Promise<InvoiceDocument> {
    const gym = requireTenant(ctx);
    const invoice = await Invoice.findOne({ _id: id, gym });
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (invoice.status === INVOICE_STATUS.VOID) {
      throw ApiError.badRequest('Voided invoices cannot be changed');
    }

    if (invoice.status === INVOICE_STATUS.UNPAID) {
      if (note) {
        invoice.note = note;
        await invoice.save();
      }
      return invoice;
    }

    if (invoice.payment) {
      const payment = await Payment.findById(invoice.payment);
      if (payment && payment.provider !== 'manual') {
        throw ApiError.badRequest(
          'This invoice is linked to a completed gateway payment. Use refund instead of marking it unpaid.',
        );
      }
      if (payment) await payment.deleteOne();
    }

    invoice.status = INVOICE_STATUS.UNPAID;
    invoice.payment = undefined;
    invoice.paidAt = undefined;
    invoice.markModified('payment');
    invoice.markModified('paidAt');
    if (note) invoice.note = note;
    await invoice.save();
    return invoice;
  },

  // ── Dashboard ────────────────────────────────────────
  async dashboard(ctx: Ctx, query: DashboardQuery) {
    const gymId = requireTenant(ctx);
    const gym = new Types.ObjectId(gymId);
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 1);
    const prevPeriodStart = new Date(year, month - 2, 1);
    const prevPeriodEnd = periodStart;
    const trendFrom = new Date(year, month - 6, 1);

    console.log('finance service dashboard');
    const [
      paidRows,
      prevIncomeRow,
      refundRows,
      unpaidInvoices,
      expenseRows,
      trendRows,
      recentPayments,
      recentExpenses,
      activeSubs,
      paidSubPayments,
    ] = await Promise.all([
      Payment.aggregate<{ _id: { purpose: string; hasSub: boolean }; total: number; count: number }>([
        {
          $match: {
            gym,
            status: PAYMENT_STATUS.PAID,
            paidAt: { $gte: periodStart, $lt: periodEnd },
          },
        },
        {
          $group: {
            _id: {
              purpose: '$purpose',
              hasSub: {
                $cond: [{ $and: [{ $ne: ['$subscription', null] }, { $ne: [{ $type: '$subscription' }, 'missing'] }] }, true, false],
              },
            },
            total: { $sum: '$amountPaise' },
            count: { $sum: 1 },
          },
        },
      ]),
      Payment.aggregate<TotalCountAgg>([
        {
          $match: {
            gym,
            status: PAYMENT_STATUS.PAID,
            paidAt: { $gte: prevPeriodStart, $lt: prevPeriodEnd },
          },
        },
        { $group: { _id: null, total: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
      ]),
      Payment.aggregate<TotalCountAgg>([
        {
          $match: {
            gym,
            status: PAYMENT_STATUS.REFUNDED,
            updatedAt: { $gte: periodStart, $lt: periodEnd },
          },
        },
        { $group: { _id: null, total: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
      ]),
      Invoice.find({ gym, status: INVOICE_STATUS.UNPAID }).select('member totalPaise').lean(),
      Expense.aggregate<CategoryAgg>([
        { $match: { gym, date: { $gte: periodStart, $lt: periodEnd } } },
        { $group: { _id: '$category', total: { $sum: '$amountPaise' } } },
        { $sort: { total: -1 } },
      ]),
      Payment.aggregate<MonthAgg>([
        {
          $match: {
            gym,
            status: PAYMENT_STATUS.PAID,
            paidAt: { $gte: trendFrom, $lt: periodEnd },
          },
        },
        {
          $group: {
            _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' } },
            total: { $sum: '$amountPaise' },
          },
        },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
      ]),
      Payment.find({ gym, status: { $in: [PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED] } })
        .sort({ updatedAt: -1 })
        .limit(6)
        .populate('member', 'name')
        .lean(),
      Expense.find({ gym }).sort({ date: -1 }).limit(6).lean(),
      Subscription.find({
        gym,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        endDate: { $gte: now },
      })
        .select('member planSnapshot.pricePaise planSnapshot.durationDays payment')
        .lean(),
      // All paid membership payments — used to exclude prepaid (e.g. yearly) from pending.
      Payment.find({
        gym,
        status: PAYMENT_STATUS.PAID,
        subscription: { $ne: null },
      })
        .select('subscription')
        .lean(),
    ]);
    console.log('paidRows', paidRows);
    console.log('prevIncomeRow', prevIncomeRow);
    console.log('refundRows', refundRows);
    console.log('unpaidInvoices', unpaidInvoices);
    console.log('expenseRows', expenseRows);
    console.log('trendRows', trendRows);
    console.log('recentPayments', recentPayments);
    console.log('recentExpenses', recentExpenses);
    console.log('activeSubs', activeSubs);
    console.log('paidSubPayments', paidSubPayments);
    // Subscriptions = paid this month that are membership (purpose or linked subscription).
    // One-time = everything else paid this month (manual invoices, misc).
    let subsIncome = 0;
    let subsCount = 0;
    let oneTimeIncome = 0;
    let oneTimeCount = 0;
    for (const row of paidRows) {
      const isSub = row._id.purpose === 'subscription' || row._id.hasSub;
      if (isSub) {
        subsIncome += row.total;
        subsCount += row.count;
      } else {
        oneTimeIncome += row.total;
        oneTimeCount += row.count;
      }
    }

    const refundsTotal = refundRows[0]?.total ?? 0;
    const refundsCount = refundRows[0]?.count ?? 0;

    /**
     * Pending this month = money still owed, not "all active members".
     *
     * Include:
     *  - Active subscriptions with NO successful payment for that subscription
     *    (e.g. activated without collecting fee)
     *  - Open unpaid invoices
     *
     * Exclude:
     *  - Prepaid plans (monthly/yearly/etc.) that already have a paid Payment
     *    linked to the subscription — paid once for the full duration, so they
     *    are not "pending this month".
     */
    const paidSubIdSet = new Set(
      paidSubPayments.map((p) => String(p.subscription)).filter(Boolean),
    );

    const unpaidSubs = activeSubs.filter((s) => !paidSubIdSet.has(String(s._id)));
    const membershipDuesPaise = unpaidSubs.reduce(
      (sum, s) => sum + (s.planSnapshot?.pricePaise ?? 0),
      0,
    );

    const unpaidInvoicesTotal = unpaidInvoices.reduce((sum, inv) => sum + (inv.totalPaise ?? 0), 0);
    const unpaidInvoiceMemberIds = unpaidInvoices.map((inv) => String(inv.member));
    const unpaidSubMemberIds = unpaidSubs.map((s) => String(s.member));
    const pendingMemberIds = new Set([...unpaidSubMemberIds, ...unpaidInvoiceMemberIds]);

    const pendingTotal = membershipDuesPaise + unpaidInvoicesTotal;
    const pendingCount = pendingMemberIds.size;

    const totalRevenuePaise = subsIncome + oneTimeIncome;
    const prevTotal = prevIncomeRow[0]?.total ?? 0;
    const revenueDeltaPct =
      prevTotal > 0 ? Math.round(((totalRevenuePaise - prevTotal) / prevTotal) * 1000) / 10 : null;

    const expenseTotalPaise = expenseRows.reduce((sum, r) => sum + r.total, 0);
    const expenseBreakdown = expenseRows.map((r) => ({
      category: r._id,
      amountPaise: r.total,
      pct: expenseTotalPaise > 0 ? Math.round((r.total / expenseTotalPaise) * 1000) / 10 : 0,
    }));

    const trend: number[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(year, month - 1 - i, 1);
      const row = trendRows.find((r) => r._id.y === d.getFullYear() && r._id.m === d.getMonth() + 1);
      trend.push(row?.total ?? 0);
    }

    const transactions = [
      ...recentPayments.map((p) => {
        const isRefund = p.status === PAYMENT_STATUS.REFUNDED;
        const memberName = (p.member as unknown as PopulatedName)?.name ?? 'member';
        return {
          id: String(p._id),
          type: (isRefund ? 'refund' : 'income') as 'refund' | 'income',
          title: isRefund ? `Refund to ${memberName}` : `Payment from ${memberName}`,
          subtitle:
            p.purpose === 'subscription' || p.subscription ? 'Membership' : 'One-time payment',
          amountPaise: isRefund ? -p.amountPaise : p.amountPaise,
          positive: !isRefund,
          status: isRefund ? 'Refunded' : 'Received',
          date: (p.paidAt ?? p.updatedAt).toISOString(),
        };
      }),
      ...recentExpenses.map((e) => ({
        id: String(e._id),
        type: 'expense' as const,
        title: e.title,
        subtitle: e.category,
        amountPaise: -e.amountPaise,
        positive: false,
        status: 'Paid',
        date: e.date.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);

    return {
      month,
      year,
      totalRevenuePaise,
      revenueDeltaPct,
      trend,
      income: [
        { key: 'subscriptions' as const, valuePaise: subsIncome, count: subsCount },
        { key: 'oneTime' as const, valuePaise: oneTimeIncome, count: oneTimeCount },
        { key: 'refunds' as const, valuePaise: refundsTotal, count: refundsCount },
        {
          key: 'pending' as const,
          valuePaise: pendingTotal,
          count: pendingCount,
          meta: {
            unpaidSubscriptionMembers: unpaidSubMemberIds.length,
            unpaidSubscriptionsPaise: membershipDuesPaise,
            unpaidInvoicesPaise: unpaidInvoicesTotal,
            unpaidInvoicesCount: unpaidInvoices.length,
            prepaidActiveExcluded: activeSubs.length - unpaidSubs.length,
          },
        },
      ],
      expenses: { totalPaise: expenseTotalPaise, breakdown: expenseBreakdown },
      transactions,
    };
  },

  /**
   * Members who still owe money: unpaid active subscriptions and/or unpaid invoices.
   * One row per member with aggregated amount and reasons.
   */
  async listPendingMembers(ctx: Ctx) {
    const gym = requireTenant(ctx);
    const now = new Date();

    const [unpaidInvoices, activeSubs, paidSubPayments] = await Promise.all([
      Invoice.find({ gym, status: INVOICE_STATUS.UNPAID })
        .select('member totalPaise number dueDate')
        .lean(),
      Subscription.find({
        gym,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        endDate: { $gte: now },
      })
        .select('member planSnapshot.pricePaise planSnapshot.name payment endDate')
        .lean(),
      Payment.find({
        gym,
        status: PAYMENT_STATUS.PAID,
        subscription: { $ne: null },
      })
        .select('subscription')
        .lean(),
    ]);

    const paidSubIdSet = new Set(
      paidSubPayments.map((p) => String(p.subscription)).filter(Boolean),
    );
    const unpaidSubs = activeSubs.filter((s) => !paidSubIdSet.has(String(s._id)));

    type Acc = {
      memberId: string;
      amountPaise: number;
      unpaidInvoices: number;
      unpaidSubscriptions: number;
      reasons: string[];
      planName?: string;
      dueDate?: Date;
    };

    const byMember = new Map<string, Acc>();

    const bump = (memberId: string, patch: Partial<Acc> & { amountPaise: number; reason: string }) => {
      const cur = byMember.get(memberId) ?? {
        memberId,
        amountPaise: 0,
        unpaidInvoices: 0,
        unpaidSubscriptions: 0,
        reasons: [] as string[],
      };
      cur.amountPaise += patch.amountPaise;
      if (patch.unpaidInvoices) cur.unpaidInvoices += patch.unpaidInvoices;
      if (patch.unpaidSubscriptions) cur.unpaidSubscriptions += patch.unpaidSubscriptions;
      if (patch.planName) cur.planName = patch.planName;
      if (patch.dueDate && (!cur.dueDate || patch.dueDate < cur.dueDate)) cur.dueDate = patch.dueDate;
      if (!cur.reasons.includes(patch.reason)) cur.reasons.push(patch.reason);
      byMember.set(memberId, cur);
    };

    for (const inv of unpaidInvoices) {
      bump(String(inv.member), {
        amountPaise: inv.totalPaise ?? 0,
        unpaidInvoices: 1,
        reason: 'Unpaid invoice',
        dueDate: inv.dueDate,
      });
    }
    for (const s of unpaidSubs) {
      bump(String(s.member), {
        amountPaise: s.planSnapshot?.pricePaise ?? 0,
        unpaidSubscriptions: 1,
        reason: 'Unpaid membership',
        planName: s.planSnapshot?.name,
        dueDate: s.endDate,
      });
    }

    const memberIds = [...byMember.keys()];
    if (!memberIds.length) return [];

    const users = await User.find({
      _id: { $in: memberIds.map((id) => new Types.ObjectId(id)) },
      deletedAt: null,
    })
      .select('name email phone avatar status')
      .lean();

    const userMap = new Map(users.map((u) => [String(u._id), u]));

    return memberIds
      .map((id) => {
        const acc = byMember.get(id)!;
        const u = userMap.get(id);
        return {
          memberId: id,
          name: u?.name ?? 'Member',
          email: u?.email,
          phone: u?.phone,
          avatar: u?.avatar,
          status: u?.status,
          amountPaise: acc.amountPaise,
          unpaidInvoices: acc.unpaidInvoices,
          unpaidSubscriptions: acc.unpaidSubscriptions,
          reasons: acc.reasons,
          planName: acc.planName,
          dueDate: acc.dueDate?.toISOString() ?? null,
        };
      })
      .sort((a, b) => b.amountPaise - a.amountPaise);
  },
};

export default financeService;
