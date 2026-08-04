import type { FilterQuery } from 'mongoose';
import { Gym, type IGym, type GymDocument } from './gym.model';
import { User } from '../users/user.model';
import { ApiError } from '../../utils/ApiError';
import { ROLES, USER_STATUS, type GymStatus } from '../../config/constants';
import { parseListQuery, buildSearchFilter } from '../../utils/pagination';
import { storageService } from '../../services/storage.service';
import type { Ctx, Paginated } from '../../types/index';
import type { ListGymsQuery, UpdateGymInput, BrandingInput, SettingsInput } from './gym.validators';

type UploadedFile = { buffer: Buffer; originalname: string; mimetype: string };

/** Ensure the requester may operate on the given gym. */
function assertGymAccess(ctx: Ctx, gym: GymDocument): void {
  if (ctx.user.role === ROLES.SUPER_ADMIN) return;
  if (String(gym._id) !== String(ctx.user.gym)) throw ApiError.forbidden('Not your gym');
}

export const gymService = {
  async list(ctx: Ctx): Promise<Paginated<GymDocument>> {
    const q = (ctx.validatedQuery ?? {}) as ListGymsQuery;
    const { page, limit, skip, sort, search } = parseListQuery(q);
    const filter: FilterQuery<IGym> = { deletedAt: null, ...buildSearchFilter(search, ['name', 'email', 'slug']) };
    if (q.status) filter.status = q.status;
    const [items, total] = await Promise.all([
      Gym.find(filter).sort(sort).skip(skip).limit(limit).populate('owner', 'name email'),
      Gym.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async getById(id: string): Promise<GymDocument> {
    const gym = await Gym.findOne({ _id: id, deletedAt: null }).populate('owner', 'name email');
    if (!gym) throw ApiError.notFound('Gym not found');
    return gym;
  },

  async getMine(ctx: Ctx): Promise<GymDocument> {
    if (!ctx.user.gym) throw ApiError.notFound('You are not linked to a gym');
    return this.getById(String(ctx.user.gym));
  },

  async update(ctx: Ctx, id: string, data: UpdateGymInput): Promise<GymDocument> {
    const gym = await this.getById(id);
    assertGymAccess(ctx, gym);
    Object.assign(gym, data);
    await gym.save();
    return gym;
  },

  async updateBranding(ctx: Ctx, id: string, data: BrandingInput): Promise<GymDocument> {
    const gym = await this.getById(id);
    assertGymAccess(ctx, gym);
    gym.branding = { ...gym.branding, ...data };
    await gym.save();
    return gym;
  },

  async updateSettings(ctx: Ctx, id: string, data: SettingsInput): Promise<GymDocument> {
    const gym = await this.getById(id);
    assertGymAccess(ctx, gym);
    gym.settings = { ...gym.settings, ...data } as typeof gym.settings;
    await gym.save();
    return gym;
  },

  async uploadBrandingImage(ctx: Ctx, id: string, kind: 'logo' | 'cover', file: UploadedFile | undefined): Promise<GymDocument> {
    if (!file) throw ApiError.badRequest('No image uploaded');
    const gym = await this.getById(id);
    assertGymAccess(ctx, gym);
    if (gym.branding?.[kind]?.key) await storageService.delete(gym.branding[kind]!.key);
    gym.branding[kind] = await storageService.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: `gyms/${gym._id}/branding`,
    });
    gym.markModified('branding');
    await gym.save();
    return gym;
  },

  // super_admin only
  async setStatus(id: string, status: GymStatus): Promise<GymDocument> {
    const gym = await this.getById(id);
    gym.status = status;
    await gym.save();
    return gym;
  },

  async remove(id: string): Promise<{ deleted: true }> {
    const gym = await this.getById(id);
    gym.deletedAt = new Date();
    await gym.save();
    await User.updateMany({ gym: id }, { $set: { status: USER_STATUS.INACTIVE } });
    return { deleted: true };
  },
};

export default gymService;
