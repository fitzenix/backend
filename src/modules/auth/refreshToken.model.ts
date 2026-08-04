import { Schema, model, Types, type Model } from 'mongoose';

export interface IRefreshToken {
  user: Types.ObjectId;
  tokenHash: string;
  userAgent?: string;
  ip?: string;
  revokedAt: Date | null;
  replacedByHash: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type RefreshTokenModel = Model<IRefreshToken>;

/**
 * Stores hashed refresh tokens to support rotation and revocation.
 * TTL index auto-expires documents at `expiresAt`.
 */
const refreshTokenSchema = new Schema<IRefreshToken, RefreshTokenModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    userAgent: { type: String },
    ip: { type: String },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken, RefreshTokenModel>('RefreshToken', refreshTokenSchema);
export default RefreshToken;
