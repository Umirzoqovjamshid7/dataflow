# Remaining issues / release blockers

Status: partial implementation of phases 1–2, with deployment safety fixes needed to keep the changed configuration runnable. The ten-phase request is not complete. No customer production rollout is approved by these tests.

## CRITICAL / HIGH

- Phase 1: validate migrations and isolation against a running PostgreSQL instance, including concurrent operations and populated legacy data. Docker daemon was unavailable; SQLite tests cannot certify PostgreSQL behavior.
- Phase 1: encrypt existing integration configurations safely; add key rotation and prevent secret output/logging. Do not place real tokens in the inherited plaintext config field.
- Phase 2: finish subscription plans/limits, complete admin metrics and client table, integration health, support impersonation with actor audit trail, complete audit coverage, password-reset/invite lifecycle and forced initial-password change. Last-admin protection is implemented and unit-tested; its PostgreSQL concurrency behavior still requires verification.
- Phase 2 security: refresh-family replay detection, concurrent logout/refresh behavior, immediate access revocation policy, account-level abuse controls, session/limiter cleanup and audit retention. Nonexistent users now execute password verification against a dummy Argon2 hash; legacy bcrypt users still have different hash timing.
- Phase 3: replace legacy campaign counter analytics with date-grained spend and attributed sales. Date presets/comparison, reach, qualified/meeting metrics, hierarchy/drilldown, funnel and accurate revenue/ROAS are not implemented. Existing reports must not be presented as verified sales attribution.
- Phase 4: Meta OAuth/state/permissions/business/account/page discovery, encrypted token lifecycle and paginated insights synchronization remain unimplemented.
- Phase 5: signed Meta Lead Ads webhooks, durable fast acknowledgement, duplicate event/lead handling, public landing keys, anti-bot protection, UTM/campaign/adset/ad/fbclid attribution and consent policy remain unimplemented. Public capture currently only adds bounded validation and shared throttling.
- Phase 6: common CRMProvider, Bitrix24 and amoCRM adapters, safe outbound URL validation, tenant status maps, mappings and authenticated inbound webhooks are not complete. Existing Bitrix helper is an inherited prototype.
- Phase 7: tenant Telegram configuration, event preferences, topic IDs, failure isolation and delivery reports are not complete. Existing helper is not wired into a durable notification pipeline.
- Phase 8: transactional outbox, Redis/Celery or equivalent worker, retry/backoff/dead-letter/reconciliation, daily reports and worker monitoring are not implemented.
- Phase 9: aggregate-only AI analytics and explicitly labelled recommendations are not implemented.
- Phase 10: end-to-end provider sandbox tests, PostgreSQL concurrency tests, dependency vulnerability audit, UI/browser QA, Docker runtime checks, HTTPS deployment, backup restore drill and load tests remain outstanding.

## MEDIUM / LOW

- Add explicit response DTOs and pagination to all lists; admin summary currently reports legacy campaign totals, lacks integration/error totals and currency normalization.
- Add server-side role-change UI, user invitations, complete requested sidebar/screens, accessible labels throughout, retry controls, skeletons and cancellation of stale frontend requests.
- Add structured sanitized application/integration logging, request correlation, audit read UI and retention/export permissions.
- Frontend Recharts 2 is deprecated and the production bundle exceeds Vite's 500 kB warning threshold; evaluate an independently tested upgrade and split chart loading.
- Python dependencies emit a Starlette/AnyIO deprecation warning; review dependency versions and security advisories before release. Newly added direct packages are pinned, but Python transitive dependencies are not fully locked.
- Database money precision currently assumes two decimal places; decide supported currencies and conversion rules before cross-client financial totals.
- Configure trusted ingress proxy IPs; the secure default shares throttles across requests arriving from the same proxy address.

## Evidence

See `PHASES.md` for test outcomes and touched files. A successful build or unit test does not establish provider readiness or complete tenant isolation across future endpoints.
