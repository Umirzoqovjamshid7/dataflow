# Implementation ledger

## Phase 1 — foundation implemented, PostgreSQL/security gate still open

Preserved FastAPI/SQLAlchemy/React architecture and existing endpoint paths except the unsafe public bootstrap endpoint (deliberately removed).

Created: `AUDIT.md`, `.gitignore`, `backend/app/cli.py`, `backend/alembic.ini`, `backend/migrations/env.py`, migrations `0001` and `0002`, `backend/tests/conftest.py`, `test_security.py`, `test_migrations.py`.

Modified: config, security, dependency guards, application startup, existing models, schemas, auth/leads/admin APIs, requirements and login form.

Changes: required deployment secret/database configuration; Argon2 password hashing with legacy bcrypt verification; 15-minute JWT with issuer/audience/type verification; removal of public bootstrap; disabled company/user checks; centralized tenant query and explicit role guards; lead detail isolation; bounded input validation; schema migration baseline and upgrade; exact money; aware timestamps and indexes; security headers.

Verification: initial phase checks passed (9 tests), including tenant A attempting tenant B lead ID/query access and migration preservation of legacy rows. Python compilation passed. PostgreSQL execution and integration encryption remain open, so the full phase is not marked complete.

## Phase 2 — partial implementation

Created: `backend/app/core/audit.py`, `backend/app/core/rate_limit.py`, migration `0003_sessions_audit.py`, `backend/tests/test_sessions_admin.py`, `frontend/src/pages/Team.jsx`, `frontend/package-lock.json`.

Modified: auth API, admin API, models, main application, frontend API client, app shell, Dashboard, Admin and CSS. Added shared throttles, rotating refresh cookies, selected security audit events, current-user endpoint, company activation controls, company/user-scoped team APIs, role/activation updates, last-admin protection, legacy admin summary, and tenant team UI. Tokens moved from localStorage into memory; refresh uses HttpOnly cookies. Existing dashboard requests now respect role permissions and show errors/loading states.

Found and fixed during testing: SQLite returned naive refresh timestamps, causing SQLAlchemy's in-memory bulk-update evaluator to fail. The atomic database update now disables in-memory synchronization and keeps the expiry comparison in SQL.

## Necessary deployment/documentation corrections

Created: root `.env.example`, `ARCHITECTURE.md`, `SECURITY.md`, `DEPLOYMENT.md`, `REMAINING_ISSUES.md`, backend/frontend `.dockerignore`, `frontend/nginx.conf`.

Modified: README, Compose, both Dockerfiles, backend environment example. Removed embedded credentials, preserved the original database service/volume, required environment configuration, added readiness checks, included Alembic in the image, used a non-root backend process and switched frontend deployment to static Nginx. These supporting fixes do not complete phase 10.

## Final verification of this increment — 2026-09-12

- `cd backend; ..\\.venv\\Scripts\\python.exe -m pytest -q`: **13 passed**, one upstream Starlette/AnyIO deprecation warning.
- `python -m compileall -q backend`: passed.
- `cd frontend; npm run build`: passed; 618 kB JavaScript bundle warning remains.
- `docker compose config --quiet` with non-secret validation environment: passed; Docker emitted an existing inaccessible user-config warning.
- PostgreSQL/container runtime/provider sandbox/browser visual checks: not run. Docker daemon is not available.
- Repository search: removed public bootstrap/default login credentials, frontend token persistence and application `create_all` calls. Test-only schema creation remains intentional.

## Phases 3–9 and remaining phase 10

Not implemented. Full outstanding scope is tracked in `REMAINING_ISSUES.md`. No placeholder integration is labelled production-ready, and the full ten-phase request remains unfinished.

## Server deployment preference
Removed development startup instructions and the frontend dev script. Environment examples now target production PostgreSQL and an HTTPS domain. API defaults to /api-proxy. Compose fixes production mode and uses a server-internal ingress port 8080. Added deploy/nginx.conf for host TLS termination. Historical test evidence above is retained; it is not a local deployment requirement.
