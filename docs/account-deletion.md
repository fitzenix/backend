# Account deletion

## Public workflow

The public, no-login website is `https://fitzenix.app/delete-account` (also published in the sitemap and privacy policy). The in-app entry points are Member Settings, Gym Owner More, and Trainer Profile. Both flows submit a request to the same API and require a one-time email code. A phone number may be used to locate the account, but verification is sent to its registered email. Responses do not confirm whether the identity matched an account.

### Request and status endpoints

All paths below are relative to `/api/v1`.

`POST /account/deletion/request`

```json
{
  "identity": "member@example.com",
  "role": "member",
  "reason": "Optional",
  "gymName": "Only needed for gym-owner requests"
}
```

`role` is `gym_owner`, `trainer_staff`, or `member`. The response is HTTP 202 and has the usual API envelope:

```json
{
  "success": true,
  "message": "If the account details match, a verification code will be sent to the registered email.",
  "data": {
    "requestId": "65f000000000000000000001",
    "trackingToken": "opaque-single-request-secret",
    "status": "pending_verification"
  }
}
```

An unrecognized account receives the same response shape, with a decoy request that cannot be verified. An open request is reused rather than creating a second request.

`POST /account/deletion/verify`

```json
{ "requestId": "65f000000000000000000001", "code": "123456" }
```

```json
{
  "success": true,
  "message": "Deletion request verified",
  "data": { "requestId": "65f000000000000000000001", "status": "completed" }
}
```

The code is time-limited, capped at five attempts, and consumed with an atomic database compare-and-set. Gym-owner verification returns `awaiting_support_review`; it does not transfer ownership or delete the gym.

`POST /account/deletion/status`

```json
{
  "requestId": "65f000000000000000000001",
  "trackingToken": "the-opaque-token-returned-by-request"
}
```

```json
{ "success": true, "message": "Deletion request status", "data": { "status": "awaiting_support_review" } }
```

Keep the tracking token private. It is returned only once and is not an account credential.

### Gym-owner support endpoints

These endpoints require an authenticated `super_admin` bearer token.

- `GET /account/deletion/support/requests?page=1&limit=25` lists verified owner requests.
- `POST /account/deletion/support/requests/:id/resolve` accepts either `{"resolution":"closed"}` or `{"resolution":"transferred","newOwnerId":"<active trainer/staff id in the same gym>"}`.

The support decision, reviewer ID, timestamp, and outcome are retained as minimal request audit data. No owner is deleted until support chooses a valid transfer or closure. The API does not cascade-delete staff, members, or gym data.

## Role-specific handling

- **Gym owner:** Request is held for support. Support must transfer the gym to an active trainer/staff account in that gym or close the gym. Closure suspends the gym and deletes only the requesting owner's personal account data; it does not delete other users or gym business records. Transfer keeps the gym active and changes the designated owner before deleting the requester.
- **Trainer/staff:** Personal profile, avatar, authored social content, messages, notification data, tokens, and direct personal fields are removed. Gym attendance, invoices, plans, progress records, and expenses are kept as appropriate business history; user attribution is nulled and member trainer assignments are cleared.
- **Member:** Personal profile, avatar, attendance, progress/workout/diet records, authored posts/messages, notifications, and trainer assignments are removed. Memberships are canceled and `autoRenew` disabled. Financial/invoice records are retained with free-form notes/raw payloads scrubbed where implemented; the required user reference points to an anonymized tombstone record.

The tombstone contains a generated invalid email, a random password hash, the deletion marker, inactive status, and no profile, contact details, gym association, or authentication tokens. It exists only to preserve required database references in financial records. The request audit record clears the requester and gym references and the free-form reason after completion.

## Database rollout

The new Mongoose collection is `accountdeletionrequests`. Ensure the model indexes exist before serving deletion traffic. Mongoose creates these indexes when automatic index creation is enabled:

- Unique partial index `{ user: 1 }` where `{ isOpen: true }`, preventing multiple open requests per account.
- TTL index `{ expiresAt: 1 }` with `expireAfterSeconds: 0`, removing expired verification/decoy requests.
- Review queue index `{ status: 1, createdAt: 1 }`.

For production deployments with `autoIndex` disabled, create/verify the collection indexes through the normal database migration/change process. Check existing data for duplicate open requests before building the unique index. There are no document backfills required for existing user records. Schema changes in fitness attribution and expense attribution permit nullable trainer/recorder references so gym history can survive deletion.

## Configuration and deployment

No new environment variables are introduced. The existing settings required by the workflow are:

- `MONGO_URI`
- `JWT_REFRESH_SECRET` — must remain stable because request tracking tokens and OTPs are HMAC-hashed with it.
- `OTP_TTL_SECONDS` — existing OTP lifetime setting.
- `MAIL_DRIVER` and the matching existing email provider credentials (`SMTP_USER`/`SMTP_PASS` for ZeptoMail SMTP, or `ZEPTOMAIL_TOKEN` for the HTTP API, or the configured provider credentials).
- `SUPPORT_EMAIL` — inbox receiving verified gym-owner review alerts.
- Existing storage driver credentials (`STORAGE_DRIVER`, S3 or Cloudinary settings as applicable) must permit deletion of stored objects.
- `CORS_ORIGINS` if the deployed website origin is customized. `https://fitzenix.app` and `https://www.fitzenix.app` are now allowed by default.

Deploy the backend and index changes, verify outbound transactional email and storage deletion permissions, then deploy the website and mobile builds. Confirm `/delete-account` returns HTTP 200 without authentication, API CORS allows the deployed origin, and the support inbox is monitored. The scheduler retries interrupted erasure work and failed owner-review/completion notifications; ensure the backend scheduler is enabled in production. For multiple backend replicas, use a shared external scheduler/worker rather than relying on a single in-process scheduler instance.

## Retention and release gates

No numeric legal, tax, invoice, or security retention periods were discoverable in the existing project. The website and privacy policy explicitly disclose this gap rather than invent a duration. **Production release is blocked until Fitzenix legal/business owners approve actual retention periods, the applicable record categories, and provider-specific schedules, and those values are published here and on the public deletion page.**

The current platform purchase flow uses one-time Razorpay orders; no recurring SaaS billing cancellation API was found. Member subscription `autoRenew` is local state and is turned off. Verify the production billing configuration before claiming third-party recurring payments are canceled. Firebase Analytics/Crashlytics, FCM, Razorpay, email, hosting, and media providers may retain data under their own policies; provider-side historical deletion/retention is not automated by this change and requires separate operational/legal confirmation.

The current app has no support-agent UI for the owner review queue; authorized super-admins must use the documented support API until an administrative workflow is built. Requests that fail during object storage deletion remain in `processing` for retry rather than being reported as successfully completed.

## Security validation checklist

- [x] Public request responses use the same status and shape for matched and unmatched identities.
- [x] Request and verification endpoints are rate-limited; invalid codes are capped per request.
- [x] OTPs and tracking tokens are stored as HMAC hashes; verification is atomic and single-use.
- [x] Request reasons are bounded, public status requires the matching tracking secret, and passwords/OTP values are not returned by the API.
- [x] Owner review requires `super_admin`; transfer candidates must be active staff/trainers assigned to the same gym.
- [x] Erasure work is lock-protected and retryable; media deletion failures prevent false completion.
- [x] Refresh tokens/device tokens are revoked, user auth cache is invalidated on the processing instance, and the deleted user record causes authentication middleware to reject future lookups.
- [ ] Confirm deployed rate limiting is shared across replicas or backed by an edge/WAF policy. The current Express limiter uses its default per-process store.
- [ ] Confirm support has independently verified the successor's consent before using the ownership-transfer endpoint. The current API validates role, status, and tenant but has no successor acceptance challenge.
- [ ] Review the short-lived cache window on other backend replicas. Their in-memory auth-user cache can remain stale for up to its configured 12-second TTL; refresh tokens are revoked immediately.
- [ ] Complete production penetration, abuse, provider-deletion, and restore/backup-retention checks.

## Google Play release checklist

- [x] In-app deletion initiation is available from the Member Settings, Gym Owner More, and Trainer Profile screens on Android and iOS.
- [x] A public, no-login website deletion page is published at `/delete-account` and included in the sitemap and privacy policy.
- [x] The workflow verifies account control and processes profile/fitness/social/session data rather than only deactivating the user.
- [x] Financial/business retention and third-party provider retention are disclosed; owner transfer/closure is reviewed before deleting the owner.
- [ ] Replace the explicit retention-schedule gap with business/legal-approved retention periods before production release.
- [ ] Verify Play Console's account-deletion URL points to the production page and confirm the page/API work without app installation or authentication.
- [ ] Confirm the published privacy policy, support contact, Google Play Data safety declarations, backup behavior, and third-party processor notices are consistent with the production deployment.
