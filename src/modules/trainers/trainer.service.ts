import type { FilterQuery, Types } from 'mongoose';
import { User, type IUser, type UserDocument } from '../users/user.model';
import { ApiError } from '../../utils/ApiError';
import { ROLES } from '../../config/constants';
import { parseListQuery, buildSearchFilter } from '../../utils/pagination';
import { notificationService } from '../notifications/notification.service';
import type { Ctx, Paginated } from '../../types/index';

interface AssignInput {
  memberId: string;
  trainerId?: string | null;
}

function requireTenant(ctx: Ctx): string {
  if (!ctx.tenantId) throw ApiError.badRequest('A gym context is required');
  return ctx.tenantId;
}

export const trainerService = {
  async listTrainers(ctx: Ctx): Promise<Paginated<UserDocument>> {
    const gym = requireTenant(ctx);
    const q = (ctx.validatedQuery ?? {}) as { status?: IUser['status'] };
    const { page, limit, skip, sort, search } = parseListQuery(ctx.validatedQuery ?? {});
    const filter: FilterQuery<IUser> = {
      gym,
      role: ROLES.TRAINER,
      deletedAt: null,
      ...buildSearchFilter(search, ['name', 'email']),
    };
    if (q.status) filter.status = q.status;
    const [items, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async assign(ctx: Ctx, { memberId, trainerId }: AssignInput): Promise<UserDocument> {
    const gym = requireTenant(ctx);
    const member = await User.findOne({ _id: memberId, gym, role: ROLES.MEMBER, deletedAt: null });
    if (!member) throw ApiError.notFound('Member not found in this gym');

    let trainer: UserDocument | null = null;
    if (trainerId) {
      trainer = await User.findOne({ _id: trainerId, gym, role: ROLES.TRAINER, deletedAt: null });
      if (!trainer) throw ApiError.notFound('Trainer not found in this gym');
    }

    member.memberProfile = {
      ...(member.memberProfile ?? { gender: 'unspecified', goals: [] }),
      assignedTrainer: trainer ? trainer._id : null,
    } as typeof member.memberProfile;
    await member.save();

    if (trainer) {
      await notificationService.notify({
        gym,
        user: trainer._id,
        type: 'system',
        event: 'trainer.client_checkin',
        title: 'New member assigned',
        body: `${member.name} has been assigned to you.`,
        data: { memberId: String(member._id), deepLink: 'Members' },
      });
      await notificationService.notify({
        gym,
        user: member._id,
        type: 'system',
        event: 'owner.trainer_assigned',
        title: 'Trainer assigned',
        body: `${trainer.name} is now your trainer.`,
        data: { trainerId: String(trainer._id), deepLink: 'Profile' },
      });
    }
    return member;
  },

  async myMembers(ctx: Ctx, trainerId: Types.ObjectId | string): Promise<Paginated<UserDocument>> {
    const gym = requireTenant(ctx);
    const q = (ctx.validatedQuery ?? {}) as { status?: IUser['status'] };
    const { page, limit, skip, sort, search } = parseListQuery(ctx.validatedQuery ?? {});
    const filter: FilterQuery<IUser> = {
      gym,
      role: ROLES.MEMBER,
      deletedAt: null,
      'memberProfile.assignedTrainer': trainerId,
      ...buildSearchFilter(search, ['name', 'email']),
    };
    if (q.status) filter.status = q.status;
    const [items, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async myTrainer(ctx: Ctx): Promise<unknown> {
    const member = await User.findById(ctx.user._id).populate(
      'memberProfile.assignedTrainer',
      'name email avatar trainerProfile',
    );
    return member?.memberProfile?.assignedTrainer ?? null;
  },
};

export default trainerService;
