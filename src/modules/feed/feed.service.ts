import { Post, type PostDocument } from './post.model';
import { ApiError } from '../../utils/ApiError';
import { ROLES, type Role } from '../../config/constants';
import { parseListQuery } from '../../utils/pagination';
import { storageService } from '../../services/storage.service';
import type { Ctx, Paginated, StorageObject } from '../../types/index';

type UploadedFile = { buffer: Buffer; originalname: string; mimetype: string };

const STAFF_ROLES = new Set<Role>([ROLES.SUPER_ADMIN, ROLES.GYM_OWNER, ROLES.TRAINER]);

interface CreatePostInput {
  content?: string;
  isAnnouncement?: boolean;
}
interface FeedListQuery {
  announcementsOnly?: boolean;
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
}

function requireTenant(ctx: Ctx): string {
  if (!ctx.tenantId) throw ApiError.badRequest('A gym context is required');
  return ctx.tenantId;
}

export const feedService = {
  async list(ctx: Ctx): Promise<Paginated<PostDocument>> {
    const gym = requireTenant(ctx);
    const q = (ctx.validatedQuery ?? {}) as FeedListQuery;
    const { page, limit, skip, sort } = parseListQuery(q);
    const filter: Record<string, unknown> = { gym, deletedAt: null };
    if (q.announcementsOnly) filter.isAnnouncement = true;
    const [items, total] = await Promise.all([
      Post.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('author', 'name avatar role')
        .populate('comments.author', 'name avatar'),
      Post.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async get(ctx: Ctx, id: string): Promise<PostDocument> {
    const post = await Post.findOne({ _id: id, gym: requireTenant(ctx), deletedAt: null })
      .populate('author', 'name avatar role')
      .populate('comments.author', 'name avatar');
    if (!post) throw ApiError.notFound('Post not found');
    return post;
  },

  async create(ctx: Ctx, { content, isAnnouncement }: CreatePostInput, files: UploadedFile[] = []): Promise<PostDocument> {
    const gym = requireTenant(ctx);
    const images: StorageObject[] = [];
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      images.push(
        await storageService.upload({
          buffer: file.buffer,
          originalName: file.originalname,
          mimeType: file.mimetype,
          folder: `gyms/${gym}/posts`,
        }),
      );
    }
    const canAnnounce = STAFF_ROLES.has(ctx.user.role);
    return Post.create({
      gym,
      author: ctx.user._id,
      content: content ?? '',
      images,
      isAnnouncement: canAnnounce ? Boolean(isAnnouncement) : false,
    });
  },

  async remove(ctx: Ctx, id: string): Promise<{ deleted: true }> {
    const post = await Post.findOne({ _id: id, gym: requireTenant(ctx), deletedAt: null });
    if (!post) throw ApiError.notFound('Post not found');
    const isStaff = STAFF_ROLES.has(ctx.user.role);
    if (String(post.author) !== String(ctx.user._id) && !isStaff) {
      throw ApiError.forbidden('You cannot delete this post');
    }
    post.deletedAt = new Date();
    await post.save();
    return { deleted: true };
  },

  async toggleLike(ctx: Ctx, id: string): Promise<{ liked: boolean; likeCount: number }> {
    const post = await Post.findOne({ _id: id, gym: requireTenant(ctx), deletedAt: null });
    if (!post) throw ApiError.notFound('Post not found');
    const uid = String(ctx.user._id);
    const idx = post.likes.findIndex((l) => String(l) === uid);
    if (idx >= 0) post.likes.splice(idx, 1);
    else post.likes.push(ctx.user._id);
    await post.save();
    return { liked: idx < 0, likeCount: post.likes.length };
  },

  async addComment(ctx: Ctx, id: string, text: string) {
    const post = await Post.findOne({ _id: id, gym: requireTenant(ctx), deletedAt: null });
    if (!post) throw ApiError.notFound('Post not found');
    post.comments.push({ author: ctx.user._id, text } as (typeof post.comments)[number]);
    await post.save();
    return post.comments[post.comments.length - 1];
  },

  async removeComment(ctx: Ctx, id: string, commentId: string): Promise<{ deleted: true }> {
    const post = await Post.findOne({ _id: id, gym: requireTenant(ctx), deletedAt: null });
    if (!post) throw ApiError.notFound('Post not found');
    const comment = post.comments.id(commentId);
    if (!comment) throw ApiError.notFound('Comment not found');
    const isStaff = STAFF_ROLES.has(ctx.user.role);
    if (String(comment.author) !== String(ctx.user._id) && !isStaff) {
      throw ApiError.forbidden('You cannot delete this comment');
    }
    comment.deleteOne();
    await post.save();
    return { deleted: true };
  },
};

export default feedService;
