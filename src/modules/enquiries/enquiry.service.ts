import type { FilterQuery } from 'mongoose';
import { Enquiry, type IEnquiry, type EnquiryDocument } from './enquiry.model';
import { ApiError } from '../../utils/ApiError';
import { ENQUIRY_STATUS } from '../../config/constants';
import { parseListQuery, buildSearchFilter } from '../../utils/pagination';
import type { Ctx, Paginated } from '../../types/index';
import type { EnquiryListQuery, CreateEnquiryInput, UpdateEnquiryInput } from './enquiry.validators';

function requireTenant(ctx: Ctx): string {
  if (!ctx.tenantId) throw ApiError.badRequest('A gym context is required');
  return ctx.tenantId;
}

export const enquiryService = {
  async list(ctx: Ctx): Promise<Paginated<EnquiryDocument>> {
    const gym = requireTenant(ctx);
    const q = (ctx.validatedQuery ?? {}) as EnquiryListQuery;
    const { page, limit, skip, sort, search } = parseListQuery(q, { defaultSort: 'createdAt' });
    const filter: FilterQuery<IEnquiry> = {
      gym,
      ...buildSearchFilter(search, ['name', 'phone', 'email', 'note']),
    };
    if (q.status) filter.status = q.status;

    const [items, total] = await Promise.all([
      Enquiry.find(filter).sort(sort).skip(skip).limit(limit),
      Enquiry.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async get(ctx: Ctx, id: string): Promise<EnquiryDocument> {
    const enquiry = await Enquiry.findOne({ _id: id, gym: requireTenant(ctx) });
    if (!enquiry) throw ApiError.notFound('Enquiry not found');
    return enquiry;
  },

  async create(ctx: Ctx, input: CreateEnquiryInput): Promise<EnquiryDocument> {
    return Enquiry.create({
      ...input,
      gym: requireTenant(ctx),
      status: input.status ?? ENQUIRY_STATUS.NEW,
      createdBy: ctx.user._id,
    });
  },

  async update(ctx: Ctx, id: string, input: UpdateEnquiryInput): Promise<EnquiryDocument> {
    const enquiry = await this.get(ctx, id);
    const { convertedMemberId, ...rest } = input;
    Object.assign(enquiry, rest);
    if (convertedMemberId) {
      enquiry.convertedMember = convertedMemberId as unknown as typeof enquiry.convertedMember;
      enquiry.status = ENQUIRY_STATUS.CONVERTED;
    }
    await enquiry.save();
    return enquiry;
  },

  async remove(ctx: Ctx, id: string): Promise<{ deleted: true }> {
    const enquiry = await this.get(ctx, id);
    await enquiry.deleteOne();
    return { deleted: true };
  },
};

export default enquiryService;
