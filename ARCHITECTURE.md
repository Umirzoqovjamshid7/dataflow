# LeadFlow architecture

## Implemented foundation

The existing React/Vite frontend and FastAPI/SQLAlchemy backend remain in place. PostgreSQL is mandatory in production; SQLite is used only for local regression tests. Alembic owns schema changes. Application import never creates tables.

Browser -> Nginx static frontend and API proxy -> FastAPI -> PostgreSQL.

Access tokens live in browser memory. A random refresh token is held in an HttpOnly, SameSite=Strict cookie (Secure in production); only its SHA-256 digest is persisted. Refresh atomically consumes the old session and issues a new one. JWTs expire after 15 minutes and validate issuer, audience and token type. User role, activation and company activation are loaded from the database for every authenticated request.

Tenant business access uses `tenant_query` for leads and explicit tenant predicates for existing campaign analytics. User management scopes both the company and user identifier. A database check forbids tenant-less ordinary users and tenant-bound super admins. Roles retain existing lowercase wire values: `super_admin`, `tenant_admin`, `marketer`, `sales_manager`, `analyst`.

| Role | Analytics | Leads / personal data | Team | Global companies |
|---|---|---|---|---|
| super_admin | all | all | all tenants | manage |
| tenant_admin | own | own | own | denied |
| marketer | own | own, read only | denied | denied |
| sales_manager | own | own | denied | denied |
| analyst | own, read only | own, read only | denied | denied |

Shared rate-limit counters use atomic database upserts. Login is limited to 10 requests/minute/IP, public lead capture to 30, refresh to 30. These are infrastructure counters, not tenant business objects. Audit events are persisted in the same transaction as company/user mutations.

## Existing domain limitations

Campaign rows still contain legacy aggregate metrics; there is no daily ad insight fact table or ad hierarchy yet. Bitrix24 incoming-webhook credentials, OnlinePBX API credentials and external database credentials are encrypted at rest. Bitrix deals are manually synchronized into tenant-scoped leads; OnlinePBX call history is queried live for the selected period. Plan/Fakt stores monthly and project-level targets and supports validated XLSX imports. PostgreSQL and MS SQL perform a real encrypted connection test; business table/column mapping is not implemented yet. Provider polling workers, inbound event webhooks, automatic retries and key rotation are not implemented yet.

## Required next architecture

Add tenant-scoped ad accounts/campaigns/ad sets/ads, dated insight facts, attributed leads, CRM mappings/events, sales, integration credentials, landing pages, subscriptions and usage. Enforce tenant-consistent composite foreign keys. Add a transactional outbox for durable delivery before exposing provider webhooks. Workers must use provider idempotency/reconciliation and exponential backoff; a local unique constraint alone cannot guarantee exactly-once external CRM creation after an uncertain timeout.

Meta and amoCRM need official OAuth with single-use tenant-bound state. Webhooks must verify signatures before durable acceptance. AI receives only explicitly constructed aggregates, never a database handle or raw lead personal information. All of these are planned, not implemented.
