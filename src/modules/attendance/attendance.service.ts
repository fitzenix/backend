import type { FilterQuery, Types } from 'mongoose';
import { Attendance, type IAttendance, type AttendanceDocument, type AttendanceSource } from './attendance.model';
import { User } from '../users/user.model';
import { Gym } from '../gyms/gym.model';
import { ApiError } from '../../utils/ApiError';
import { ROLES, ATTENDANCE_STATUS } from '../../config/constants';
import { parseListQuery } from '../../utils/pagination';
import { TTLCache } from '../../utils/cache';
import {
  buildCheckInQrPayload,
  encodeCheckInQr,
  renderCheckInSticker,
} from '../../utils/checkInSticker';
import type { Ctx, Paginated } from '../../types/index';

interface CheckInput {
  memberId?: string;
  source?: AttendanceSource;
}

interface BulkCheckInInput {
  memberIds: string[];
  source?: AttendanceSource;
}

interface ListAttendanceQuery {
  memberId?: string;
  status?: string;
  from?: string | Date;
  to?: string | Date;
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
}

/** Cache the self-checkin flag per gym for 5 min to avoid a read on every check-in. */
const selfCheckinCache = new TTLCache<string, boolean>(1000, 5 * 60_000);

function requireTenant(ctx: Ctx): string {
  if (!ctx.tenantId) throw ApiError.badRequest('A gym context is required');
  return ctx.tenantId;
}

async function resolveMember(ctx: Ctx, memberId?: string): Promise<Types.ObjectId> {
  if (ctx.user.role === ROLES.MEMBER) return ctx.user._id;
  const member = await User.findOne({
    _id: memberId,
    gym: requireTenant(ctx),
    role: ROLES.MEMBER,
    deletedAt: null,
  });
  if (!member) throw ApiError.notFound('Member not found in this gym');
  return member._id;
}

async function loadGymCheckInContext(gymId: string) {
  const gym = await Gym.findById(gymId).lean();
  if (!gym) throw ApiError.notFound('Gym not found');

  const owner =
    (await User.findOne({ _id: gym.owner, role: ROLES.GYM_OWNER }).select('name').lean()) ||
    (await User.findById(gym.owner).select('name').lean());

  const branch =
    [gym.address?.city, gym.address?.line1].filter(Boolean).join(' · ') ||
    gym.branding?.tagline ||
    '';

  return {
    gymId: String(gym._id),
    gymName: gym.name,
    ownerName: owner?.name || 'Gym Owner',
    branchLabel: branch,
    slug: gym.slug,
  };
}

export const attendanceService = {
  async checkIn(ctx: Ctx, { memberId, source }: CheckInput): Promise<AttendanceDocument> {
    const gym = requireTenant(ctx);
    const isSelf = ctx.user.role === ROLES.MEMBER;

    if (isSelf) {
      const allowed = await selfCheckinCache.getOrSet(gym, async () => {
        const g = await Gym.findById(gym).select('settings.allowMemberSelfCheckin').lean();
        return g?.settings?.allowMemberSelfCheckin !== false;
      });
      if (!allowed) throw ApiError.forbidden('Self check-in is disabled for this gym');
    }

    const member = await resolveMember(ctx, memberId);
    const open = await Attendance.exists({ gym, member, status: ATTENDANCE_STATUS.CHECKED_IN });
    if (open) throw ApiError.conflict('An open check-in already exists');

    return Attendance.create({
      gym,
      member,
      checkInAt: new Date(),
      source: source ?? (isSelf ? 'self' : 'staff'),
      recordedBy: ctx.user._id,
    });
  },

  async bulkCheckIn(ctx: Ctx, { memberIds, source }: BulkCheckInInput) {
    if (ctx.user.role === ROLES.MEMBER) {
      throw ApiError.forbidden('Members cannot bulk check-in');
    }
    const gym = requireTenant(ctx);
    const uniqueIds = [...new Set(memberIds.filter(Boolean))];
    if (!uniqueIds.length) throw ApiError.badRequest('Select at least one member');

    const results: {
      memberId: string;
      ok: boolean;
      error?: string;
      record?: AttendanceDocument;
    }[] = [];

    for (const id of uniqueIds) {
      try {
        const record = await attendanceService.checkIn(ctx, {
          memberId: id,
          source: source ?? 'staff',
        });
        results.push({ memberId: id, ok: true, record });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed';
        results.push({ memberId: id, ok: false, error: message });
      }
    }

    const checkedIn = results.filter(r => r.ok).length;
    const failed = results.length - checkedIn;
    return { gymId: gym, checkedIn, failed, results };
  },

  async checkOut(ctx: Ctx, { memberId }: CheckInput): Promise<AttendanceDocument> {
    const gym = requireTenant(ctx);
    const member = await resolveMember(ctx, memberId);
    const open = await Attendance.findOne({ gym, member, status: ATTENDANCE_STATUS.CHECKED_IN }).sort({
      checkInAt: -1,
    });
    if (!open) throw ApiError.badRequest('No open check-in found');

    open.checkOutAt = new Date();
    open.status = ATTENDANCE_STATUS.CHECKED_OUT;
    open.durationMinutes = Math.round((open.checkOutAt.getTime() - open.checkInAt.getTime()) / 60_000);
    await open.save();
    return open;
  },

  async list(ctx: Ctx): Promise<Paginated<AttendanceDocument>> {
    const gym = requireTenant(ctx);
    const q = (ctx.validatedQuery ?? {}) as ListAttendanceQuery;
    const { page, limit, skip, sort } = parseListQuery(q, { defaultSort: 'checkInAt' });
    const filter: FilterQuery<IAttendance> = { gym };
    if (ctx.user.role === ROLES.MEMBER) filter.member = ctx.user._id;
    else if (q.memberId) filter.member = q.memberId;
    if (q.status) filter.status = q.status as IAttendance['status'];
    if (q.from || q.to) {
      const range: Record<string, Date> = {};
      if (q.from) range.$gte = new Date(q.from);
      if (q.to) range.$lte = new Date(q.to);
      filter.checkInAt = range;
    }
    const [items, total] = await Promise.all([
      Attendance.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('member', 'name email phone avatar status'),
      Attendance.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async checkInQrInfo(ctx: Ctx) {
    const gymId = requireTenant(ctx);
    const info = await loadGymCheckInContext(gymId);
    const payload = buildCheckInQrPayload(gymId);
    return {
      ...info,
      payload,
      qrValue: encodeCheckInQr(gymId),
    };
  },

  async checkInStickerPng(ctx: Ctx): Promise<Buffer> {
    const gymId = requireTenant(ctx);
    const info = await loadGymCheckInContext(gymId);
    return renderCheckInSticker(info);
  },
};

export default attendanceService;
