import type { FilterQuery } from 'mongoose';
import { User, type IUser, type UserDocument } from './user.model';
import { ProgressLog } from '../fitness/progressLog.model';
import { ApiError } from '../../utils/ApiError';
import { ROLES, USER_STATUS } from '../../config/constants';
import { parseListQuery, buildSearchFilter } from '../../utils/pagination';
import { storageService } from '../../services/storage.service';
import type { Ctx, Paginated } from '../../types/index';
import type { ListUsersQuery, CreateUserInput, UpdateUserInput, UpdateProfileInput } from './user.validators';

type UploadedFile = { buffer: Buffer; originalname: string; mimetype: string };

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export const userService = {
  async list(ctx: Ctx): Promise<Paginated<UserDocument>> {
    const q = (ctx.validatedQuery ?? {}) as ListUsersQuery;
    const { page, limit, skip, sort, search } = parseListQuery(q);
    const filter: FilterQuery<IUser> = {
      deletedAt: null,
      ...buildSearchFilter(search, ['name', 'email', 'phone']),
    };
    if (ctx.tenantId) filter.gym = ctx.tenantId;
    if (q.status) filter.status = q.status;
    if (q.role) filter.role = q.role;
    // Non super_admin never see other gyms / super_admins.
    if (ctx.user.role !== ROLES.SUPER_ADMIN) {
      filter.role = q.role ?? { $in: [ROLES.TRAINER, ROLES.STAFF, ROLES.MEMBER, ROLES.GYM_OWNER] };
    }

    const [items, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async getById(ctx: Ctx, id: string): Promise<UserDocument> {
    const filter: FilterQuery<IUser> = { _id: id, deletedAt: null };
    if (ctx.tenantId) filter.gym = ctx.tenantId;
    const user = await User.findOne(filter);
    if (!user) throw ApiError.notFound('User not found');
    return user;
  },

  async create(ctx: Ctx, data: CreateUserInput): Promise<UserDocument> {
    const gymId = ctx.user.role === ROLES.SUPER_ADMIN ? data.gymId : ctx.user.gym ? String(ctx.user.gym) : null;
    if (!gymId) throw ApiError.badRequest('gymId is required');

    const dup = await User.findOne({ email: data.email });
    if (dup) throw ApiError.conflict('A user with this email already exists');

    const user = new User({
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      gym: gymId,
      status: USER_STATUS.ACTIVE,
      passwordHash: 'pending',
      ...(data.role === ROLES.TRAINER
        ? { trainerProfile: { specialties: [], certifications: [], ...(data.trainerProfile ?? {}) } }
        : {}),
      ...(data.role === ROLES.STAFF
        ? {
            staffProfile: {
              jobTitle: data.staffProfile?.jobTitle?.trim() || 'Staff',
              department: data.staffProfile?.department,
            },
          }
        : {}),
      ...(data.role === ROLES.MEMBER
        ? { memberProfile: { allowTwoSessions: data.memberProfile?.allowTwoSessions ?? false } }
        : {}),
    });
    await user.setPassword(data.password);
    await user.save();
    return user;
  },

  async update(ctx: Ctx, id: string, data: UpdateUserInput): Promise<UserDocument> {
    const user = await this.getById(ctx, id);
    const { trainerProfile, staffProfile, memberProfile, ...rest } = data;
    Object.assign(user, rest);
    if (trainerProfile && user.role === ROLES.TRAINER) {
      user.trainerProfile = {
        ...(user.trainerProfile ?? { specialties: [], certifications: [] }),
        ...trainerProfile,
      } as typeof user.trainerProfile;
    }
    if (staffProfile && user.role === ROLES.STAFF) {
      user.staffProfile = {
        ...(user.staffProfile ?? { jobTitle: 'Staff' }),
        ...staffProfile,
      } as typeof user.staffProfile;
    }
    if (memberProfile && user.role === ROLES.MEMBER) {
      user.memberProfile = {
        ...(user.memberProfile ?? { gender: 'unspecified', goals: [] }),
        ...memberProfile,
      } as typeof user.memberProfile;
    }
    await user.save();
    return user;
  },

  async updateProfile(user: UserDocument, data: UpdateProfileInput): Promise<UserDocument> {
    const doc = await User.findById(user._id);
    if (!doc) throw ApiError.notFound('User not found');
    if (data.name) doc.name = data.name;
    if (data.phone) doc.phone = data.phone;
    const prevWeight = doc.memberProfile?.weightKg;
    if (data.memberProfile) {
      const prev = (doc.memberProfile ?? {}) as Partial<NonNullable<UserDocument['memberProfile']>>;
      doc.memberProfile = {
        ...prev,
        ...data.memberProfile,
        measurements: data.memberProfile.measurements
          ? { ...(prev.measurements ?? {}), ...data.memberProfile.measurements }
          : prev.measurements,
        preferences: data.memberProfile.preferences
          ? { ...(prev.preferences ?? {}), ...data.memberProfile.preferences }
          : prev.preferences,
        goals: data.memberProfile.goals ?? prev.goals ?? [],
      } as typeof doc.memberProfile;
    }
    if (data.trainerProfile) {
      doc.trainerProfile = { ...(doc.trainerProfile ?? {}), ...data.trainerProfile } as typeof doc.trainerProfile;
    }
    if (data.staffProfile) {
      doc.staffProfile = { ...(doc.staffProfile ?? { jobTitle: 'Staff' }), ...data.staffProfile } as typeof doc.staffProfile;
    }
    await doc.save();

    // Keep progress charts in sync when member weight / measurements update
    const nextWeight = data.memberProfile?.weightKg;
    const nextMeasurements = data.memberProfile?.measurements;
    if (
      doc.role === ROLES.MEMBER &&
      doc.gym &&
      ((typeof nextWeight === 'number' && nextWeight !== prevWeight) || nextMeasurements)
    ) {
      const todayStart = startOfDay(new Date());
      const todayEnd = endOfDay(todayStart);
      const existing = await ProgressLog.findOne({
        gym: doc.gym,
        member: doc._id,
        date: { $gte: todayStart, $lte: todayEnd },
      });
      if (existing) {
        if (typeof nextWeight === 'number') existing.weightKg = nextWeight;
        if (nextMeasurements) {
          existing.measurements = { ...(existing.measurements ?? {}), ...nextMeasurements };
        }
        existing.recordedBy = doc._id;
        await existing.save();
      } else {
        await ProgressLog.create({
          gym: doc.gym,
          member: doc._id,
          recordedBy: doc._id,
          date: new Date(),
          weightKg: typeof nextWeight === 'number' ? nextWeight : doc.memberProfile?.weightKg,
          measurements: nextMeasurements,
          notes: 'Updated from profile',
        });
      }
    }

    return doc;
  },

  async setAvatar(user: UserDocument, file: UploadedFile | undefined): Promise<UserDocument> {
    if (!file) throw ApiError.badRequest('No image uploaded');
    const doc = await User.findById(user._id);
    if (!doc) throw ApiError.notFound('User not found');
    if (doc.avatar?.key) await storageService.delete(doc.avatar.key);
    doc.avatar = await storageService.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: `avatars/${doc._id}`,
    });
    await doc.save();
    return doc;
  },

  /** Owner/staff uploads a member profile photo into Cloudinary "Members Profile/{memberId}". */
  async setMemberAvatar(ctx: Ctx, memberId: string, file: UploadedFile | undefined): Promise<UserDocument> {
    if (!file) throw ApiError.badRequest('No image uploaded');
    const member = await this.getById(ctx, memberId);
    if (member.role !== ROLES.MEMBER) throw ApiError.badRequest('Avatar upload is only for members');

    if (member.avatar?.key) await storageService.delete(member.avatar.key);

    const id = String(member._id);
    member.avatar = await storageService.upload({
      buffer: file.buffer,
      originalName: file.originalname || 'avatar.jpg',
      mimeType: file.mimetype,
      folder: `Members Profile/${id}`,
      publicId: 'avatar',
    });
    await member.save();
    return member;
  },

  async remove(ctx: Ctx, id: string): Promise<{ deleted: true }> {
    const user = await this.getById(ctx, id);
    if (user.role === ROLES.GYM_OWNER) throw ApiError.badRequest('Cannot delete a gym owner directly');
    user.deletedAt = new Date();
    user.status = USER_STATUS.INACTIVE;
    await user.save();
    return { deleted: true };
  },
};

export default userService;
