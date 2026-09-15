# LeadFlow repository audit

Audit date: 2026-09-12. Scope: every supplied backend/frontend source file, Dockerfiles, Compose and environment examples. This directory has no Git metadata, tests or migrations. Findings below describe the original state, before implementation.

| Severity | Problem and risk | Evidence / file | Required correction |
|---|---|---|---|
| CRITICAL | Unauthenticated bootstrap creates publicly documented administrator credentials; complete takeover on a new installation. | `backend/app/api/auth.py`, `README.md`, `frontend/src/main.jsx` | Remove HTTP bootstrap and demo credentials; provision administrator through an operator CLI. |
| CRITICAL | Known fallback JWT secret permits forged tokens. | `backend/app/core/config.py`, `docker-compose.yml` | Require strong deployment secrets and fail startup on invalid configuration. |
| HIGH | Disabled tenants retain API access; role checks only protect admin routes. Analyst can read personal lead data. | `backend/app/api/deps.py`, `leads.py`, `admin.py` | Reload tenant/user status for each request and enforce explicit role permissions. |
| HIGH | Tenant filters are manually repeated; no detail-route isolation regression tests; ordinary users may have null tenants. | `backend/app/api/deps.py`, `models/models.py` | Central tenant scope, role/tenant database constraints, adversarial API tests. Existing list filters do scope normal users; a demonstrated cross-tenant exploit was not found in these lists. |
| HIGH | Public lead capture has no throttling, deduplication, attribution or payload size constraints. | `backend/app/api/leads.py`, `schemas/schemas.py` | Distributed rate limits, idempotency keys, bounded validated inputs, attribution fields. |
| HIGH | Tokens/config can be stored as plaintext; Meta is a placeholder, amoCRM is absent. | `models/models.py`, `services/*` | Encrypted secret storage, official OAuth, verified webhooks and provider adapters. |
| HIGH | Import-time create_all replaces migration management. No upgrade path or rollback procedure. | `backend/app/main.py`, `core/db.py` | Alembic revision history; run migrations as a deployment step. |
| HIGH | No refresh/revocation, audit trail, signature verification or background delivery. | `api/auth.py`, `core/security.py`, `services/*` | Rotating sessions, security audit logs, durable jobs and authenticated webhooks. |
| HIGH | Aggregation mixes provider lead counters with captured leads, lacks date boundaries and sale attribution. | `backend/app/api/admin.py` | Explicit fact grain, Decimal money, date-filtered aggregates and attributed sales. |
| HIGH | Production-like Compose has hardcoded database/JWT secrets and Vite development server. | `docker-compose.yml`, `frontend/Dockerfile` | Required environment secrets, static production build, internal database networking, health checks and TLS ingress. |
| MEDIUM | Float money, naive UTC, missing tenant/external uniqueness and status/date indexes. | `backend/app/models/models.py` | Numeric amounts, timezone-aware timestamps, explicit indexes and constraints. |
| MEDIUM | EmailStr dependency is missing; no reproducible frontend lockfile. | `backend/requirements.txt`, `frontend/package.json` | Add email-validator, lock dependency resolution and test clean installation. |
| MEDIUM | Network errors can escape without classification; Telegram ignores HTTP/provider failure. | `backend/app/services/bitrix.py`, `telegram.py` | Sanitized structured errors, retries, integration health and outbox delivery. |
| MEDIUM | Frontend stores bearer credentials persistently and uses local role for menus; rejected API promises have no user error state. | `frontend/src/api.js`, `main.jsx`, `pages/*` | Session handling, backend-authoritative permissions, loading/error states. |
| MEDIUM | No users management, subscription enforcement, hierarchy, funnel, AI or integration settings implementation. | `backend/app/models/models.py`, `frontend/src/pages/*` | Implement in requested phase order with real persistence and verification. |
| LOW | Mobile sidebar disappears including logout; missing accessibility labels and empty states. | `frontend/src/styles.css`, `pages/*`, `main.jsx` | Responsive navigation and accessible controls. |

## Verification constraints

Initial environment: Node is installed; `python` is not on PATH. Docker client exists but daemon availability must be checked. No real integration credentials were supplied. External integration behavior cannot be certified without sandbox accounts.

## Phase ledger

Implementation and test outcomes are recorded in `PHASES.md`. A phase is not complete merely because an interface or document exists. Unverified deployment and provider behavior remain release blockers.

## Production security audit — 2026-09-15

### Issues found and fixed

| Severity | Finding | Change |
|---|---|---|
| Critical | Vite development mode automatically created a demo user and bypassed login. | Demo mode now requires explicit `VITE_DEMO_MODE=true`; the default is false. |
| High | Login throttling used only source IP. | Added separate per-IP and per-normalized-email login buckets, plus origin validation. |
| High | FastAPI schema endpoints were exposed in production. | `/docs`, `/redoc`, and `/openapi.json` are disabled in production. |
| Medium | CORS allowed every method and header. | Restricted CORS to the application’s required methods and headers. |
| Medium | Telegram credentials were written to browser localStorage. | Removed client persistence; values remain memory-only until encrypted server storage exists. |
| Low | Application responses lacked HSTS and Permissions-Policy. | Added both headers; HSTS is production-only. |

### Secret exposure result

No provider API keys, JWTs, private keys, or real credentials were found in application source, frontend source/bundles, Compose, or environment examples. Only theme/language preferences are persisted in localStorage; access and refresh tokens are not persisted client-side.

### Remaining release blockers

The SQL rate limiter has no cleanup job and is not a distributed Redis limiter. Account lockout/step-up authentication, breached-password screening, refresh-family replay detection, immediate access-token revocation, password reset/invite lifecycle, encrypted integration storage, signed webhooks and provider sandbox tests remain outstanding. Backend tests could not be rerun because Python was not installed/discoverable in this environment. Disabled tenants now receive the same generic login error as invalid credentials, preventing account-state enumeration.
