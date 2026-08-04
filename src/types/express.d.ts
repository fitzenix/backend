import type { UserDocument } from '../modules/users/user.model';
import type { AuthTokenPayload } from './index';

/**
 * Augment Express' Request with the fields our middleware attaches. They are
 * optional here (the compiler cannot know which middleware ran); handlers that
 * run behind `authenticate` are typed via `AuthedRequest` for non-null access.
 */
declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
      auth?: AuthTokenPayload;
      tenantId?: string | null;
      validatedQuery?: unknown;
      rawBody?: Buffer;
    }
  }
}

export {};
