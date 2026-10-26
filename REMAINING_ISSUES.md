# Remaining issues / release blockers

Status: partial implementation of phases 1–2, with deployment safety fixes needed to keep the changed configuration runnable. The ten-phase request is not complete. No customer production rollout is approved by these tests.

## CRITICAL / HIGH

- Phase 1: validate concurrent operations and populated legacy upgrades under production-sized PostgreSQL data. Migration `0006` and runtime health are verified on the deployed PostgreSQL instance.
- Phase 1: Bitrix and OnlinePBX secrets are encrypted and never returned by status APIs; key rotation remains to be implemented.
- Phase 2: finish subscription plans/limits, complete admin metrics and client table, integration health, support impersonation with actor audit trail, complete audit coverage, password-reset/invite lifecycle and forced initial-password change. Last-admin protection is implemented and unit-tested; its PostgreSQL concurrency behavior still requires verification.
- Settings UI: Bitrix, OnlinePBX and PostgreSQL/MS SQL connection testing are functional. Meta and amoCRM are visible but clearly report that their server integrations are not connected. Telegram remains session-only.
- Phase 2 security: refresh-family replay detection, concurrent logout/refresh behavior, immediate access revocation policy, account-level abuse controls, session/limiter cleanup and audit retention. Nonexistent users now execute password verification against a dummy Argon2 hash; legacy bcrypt users still have different hash timing.
- Phase 3: replace legacy campaign counter analytics with date-grained spend and attributed sales. Date presets/comparison, reach, qualified/meeting metrics, hierarchy/drilldown, funnel and accurate revenue/ROAS are not implemented. Existing reports must not be presented as verified sales attribution.
- Phase 4: Meta OAuth/state/permissions/business/account/page discovery, encrypted token lifecycle and paginated insights synchronization remain unimplemented.
- Phase 5: signed Meta Lead Ads webhooks, durable fast acknowledgement, duplicate event/lead handling, public landing keys, anti-bot protection, UTM/campaign/adset/ad/fbclid attribution and consent policy remain unimplemented. Public capture currently only adds bounded validation and shared throttling.
- Phase 6: Bitrix connection testing, encrypted tenant configuration, funnel discovery and manual deal synchronization are implemented. Automatic polling/events, configurable status mapping, contact phone enrichment and amoCRM remain incomplete.
- Phase 7: tenant Telegram configuration, event preferences, topic IDs, failure isolation and delivery reports are not complete. Existing helper is not wired into a durable notification pipeline.
- Phase 8: transactional outbox, Redis/Celery or equivalent worker, retry/backoff/dead-letter/reconciliation, daily reports and worker monitoring are not implemented.
- Phase 9: aggregate-only, rule-based recommendations are implemented and explicitly labelled; an external AI provider is not connected.
- Phase 10: end-to-end provider sandbox tests, PostgreSQL concurrency tests, full UI/browser QA, HTTPS deployment, backup restore drill and load tests remain outstanding. Local dependency audits and an isolated Docker/PostgreSQL runtime smoke test passed on 2026-10-24; these checks do not replace provider or production validation.

## MEDIUM / LOW

- Add explicit response DTOs and pagination to all lists; admin summary currently reports legacy campaign totals, lacks integration/error totals and currency normalization.
- Add server-side role-change UI, user invitations, complete requested sidebar/screens, accessible labels throughout, retry controls, skeletons and cancellation of stale frontend requests.
- Add structured sanitized application/integration logging, request correlation, audit read UI and retention/export permissions.
- Frontend Recharts 2 is deprecated and the production bundle exceeds Vite's 500 kB warning threshold; evaluate an independently tested upgrade and split chart loading.
- The test environment still emits deprecation warnings from Starlette/AnyIO and legacy Passlib `crypt` loading. Direct Python packages are pinned and `pip-audit` reported no known vulnerabilities on 2026-10-24, but transitive dependencies are not fully locked and must be audited again for each release.
- Database money precision currently assumes two decimal places; decide supported currencies and conversion rules before cross-client financial totals.
- Configure trusted ingress proxy IPs; the secure default shares throttles across requests arriving from the same proxy address.

## Latest verification (2026-10-24)

- Backend: 26 tests passed after the dependency/security changes.
- Database: all migrations applied from an empty PostgreSQL 16 database to `0008`; `alembic check` found no model/schema drift.
- Runtime: separately built backend and frontend images returned HTTP 200 through the frontend nginx proxy, and backend readiness reported `{"status":"ok"}`.
- Dependencies: `pip-audit` and `npm audit` reported no known vulnerabilities after updates.
- Frontend: Vite production build completed successfully with lazy page chunks.

These checks do not establish provider readiness, browser compatibility, production performance, or complete tenant isolation across future endpoints.
