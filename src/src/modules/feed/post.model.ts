import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import type { StorageObject } from '../../types/index';

export interface PostComment {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  text: string;
  createdAt: Date;
}

export interface IPost {
  gym: Types.ObjectId;
  author: Types.ObjectId;
  content: string;
  images: StorageObject[];
  isAnnouncement: boolean;
  likes: Types.ObjectId[];
  comments: Types.DocumentArray<PostComment>;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PostModel = Model<IPost>;
export type PostDocument = HydratedDocument<IPost>;

const commentSchema = new Schema<PostComment>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const postSchema = new Schema<IPost, PostModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, default: '', maxlength: 5000 },
    images: [{ key: String, url: String }],
    isAnnouncement: { type: Boolean, default: false },
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    comments: { type: [commentSchema], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

postSchema.index({ gym: 1, createdAt: -1 });

postSchema.virtual('likeCount').get(function likeCount(this: IPost) {
  return this.likes?.length ?? 0;
});
postSchema.virtual('commentCount').get(function commentCount(this: IPost) {
  return this.comments?.length ?? 0;
});

export const Post = model<IPost, PostModel>('Post', postSchema);
export default Post;
