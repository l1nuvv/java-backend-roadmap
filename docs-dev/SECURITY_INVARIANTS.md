# Security invariants

Read before changing Supabase, authentication, cloud transport, CSP, import/export or persistence boundaries.

## Browser credentials

`src/config.js` intentionally contains public Supabase project configuration. A publishable/anon key is not an administrative secret.

Never place any of the following in browser source, repository docs, test fixtures or committed configuration:
- `service_role` key;
- `sb_secret_*` key;
- user password;
- captured access/refresh token;
- other administrative secret.

## Database access model

The current intended invariants are:

1. RLS is enabled on `public.roadmap_progress`.
2. Anonymous users cannot read roadmap progress.
3. Authenticated users may select only their own row through `auth.uid() = user_id` policy semantics.
4. Direct table writes are not granted to normal authenticated clients.
5. Writes go through `public.save_roadmap_progress(expected_revision, new_payload)`.
6. The RPC derives the user from `auth.uid()` rather than accepting an arbitrary user ID.
7. The RPC rejects invalid revision values.
8. The hardened RPC requires a JSON object, maximum payload size and schema version 3.
9. The hardened RPC validates required object/array field families.
10. RPC writes are serialized per user and enforce optimistic revision matching.

Do not weaken these properties to make development easier.

## Optimistic concurrency is a security/data-integrity boundary

The revision check is not cosmetic. It prevents stale clients from overwriting newer progress without re-reading/merging.

Do not replace the RPC with unrestricted client `update` permissions or a naive upsert.

## Client-side validation

`validateImport()` protects local/import/cloud application paths from malformed state and dangerous prototype keys.

Server validation and client validation serve different boundaries. Do not remove one because the other exists.

## Response/payload limits

Current code guards approximately 2 MB state payloads/responses. Preserve bounded parsing/storage behavior when extending the schema.

## Authentication/session behavior

Current client behavior includes:
- email OTP/magic-link style flow with `create_user: false`;
- cached session restore;
- refresh-token flow;
- Web Locks coordination when available;
- cross-tab logout/session propagation;
- removal of auth tokens from the visible URL after callback processing.

Do not log access/refresh tokens or leave them in URLs longer than required for callback processing.

## CSP

`src/index.html` has an explicit Content-Security-Policy limiting script/style/network/form behavior. When adding a new external asset/service, do not simply relax CSP broadly (`*`, arbitrary script origins, `unsafe-eval`) without a justified threat-model decision.

Prefer self-hosted assets and existing dependencies where possible.

## Database migration rule

Treat `supabase/migrations/` as append-only history for deployed changes. Do not rewrite an already-applied migration merely to make the current file look cleaner; add a new migration for a new database change unless the environment is explicitly disposable.

## Verification

A security-sensitive change should identify exactly what was verified:
- static/source review;
- automated unit/browser tests;
- SQL/migration inspection;
- real Supabase test, if actually performed.

Do not claim live RLS/RPC behavior from mocked browser tests alone.
