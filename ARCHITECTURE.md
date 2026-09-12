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
| marketer | own | denied | denied | denied |
| sales_manager | denied | own | denied | denied |
| analyst | own, read only | denied | denied | denied |

Shared rate-limit counters use atomic database upserts. Login is limited to 10 requests/minute/IP, public lead capture to 30, refresh to 30. These are infrastructure counters, not tenant business objects. Audit events are persisted in the same transaction as company/user mutations.

## Existing domain limitations

Campaign rows still contain legacy aggregate metrics; there is no daily insight fact table, ad hierarchy or sale attribution yet. Existing analytics endpoints are retained but are not certified financial reporting. Integration service files are inherited prototypes and are not connected production workflows.

## Required next architecture

Add tenant-scoped ad accounts/campaigns/ad sets/ads, dated insight facts, attributed leads, CRM mappings/events, sales, integration credentials, landing pages, subscriptions and usage. Enforce tenant-consistent composite foreign keys. Add a transactional outbox for durable delivery before exposing provider webhooks. Workers must use provider idempotency/reconciliation and exponential backoff; a local unique constraint alone cannot guarantee exactly-once external CRM creation after an uncertain timeout.

Meta and amoCRM need official OAuth with single-use tenant-bound state. Webhooks must verify signatures before durable acceptance. AI receives only explicitly constructed aggregates, never a database handle or raw lead personal information. All of these are planned, not implemented.
