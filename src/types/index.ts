import type { Request } from 'express';
import type { Role } from '../config/constants';
import type { UserDocument } from '../modules/users/user.model';

/** Decoded JWT access-token payload. */
export interface AuthTokenPayload {
  sub: string;
  role: Role;
  gym: string | null;
  iat?: number;
  exp?: number;
}

/** Handshake/request context passed into the service layer (decoupled from Express). */
export interface Ctx {
  user: UserDocument;
  tenantId: string | null;
  validatedQuery?: unknown;
}

/** Express request after `authenticate` (+ optionally `resolveTenant`) have run. */
export type AuthedRequest = Request & {
  user: UserDocument;
  auth: AuthTokenPayload;
  tenantId: string | null;
  validatedQuery: unknown;
};

/** A stored file reference (avatar, logo, post image, …). */
export interface StorageObject {
  key: string;
  url: string;
}

/** Standard paginated service result. */
export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
