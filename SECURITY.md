# Security status

This is a hardened foundation, **not a production security certification**. See `REMAINING_ISSUES.md` for release blockers.

## Implemented controls

- No public bootstrap endpoint or hardcoded administrator password. Operator provisioning uses `python -m app.cli` and a hidden password prompt.
- Required JWT secret (minimum 32 characters, known placeholder strings rejected); production database must be PostgreSQL.
- Argon2 for new passwords; legacy bcrypt verification retained to avoid breaking existing accounts.
- JWT signature/expiry/issuer/audience/type validation, 15-minute access lifetime, rotating refresh digests and HttpOnly cookies.
- Company/user activation and current database roles checked on every protected request. Explicit endpoint role restrictions and tenant detail/list regression tests.
- Database role/tenant invariant; input bounds and extra-field rejection on write schemas; ORM-bound query parameters.
- Shared database rate limits on login, refresh and public leads. CORS whitelist, strict refresh-cookie policy and origin checks on refresh/logout.
- Audit for successful/failed credential login, company creation/activation/disable, user creation/activation/disable and role changes. Passwords/tokens are not audit payloads.
- Nginx CSP/frame/content-type headers, bounded request bodies and no public database/backend port in Compose.

## Operational requirements

Use HTTPS and `ENVIRONMENT=production`; use one origin for frontend/API. Development mode is not supported; the isolated test suite is the only non-production mode. Store deployment secrets in the deployment secret manager or protected environment. `.env` and local build/test artifacts are excluded from version control and Docker contexts.

Back up and rotate the JWT secret following an incident; this invalidates access tokens but existing refresh sessions must also be revoked. Logout revokes the presented refresh session; an already issued access token remains usable for at most 15 minutes. Immediate access-token revocation and refresh-family compromise detection are not implemented.

The rate limiter trusts the connection address, not arbitrary forwarded headers. Configure a trusted proxy address/network before relying on per-client production limits; otherwise all requests from one proxy share a bucket. Rate-limit rows, expired sessions and audit records need a defined cleanup/retention policy.

Existing `Integration.config_json` is still plaintext. **Do not store real provider secrets yet.** Encryption, key rotation, provider signatures, SSRF defenses and durable delivery are release blockers, not claimed controls.

Reference decisions: [FastAPI password/JWT guidance](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/) and [Alembic migration guidance](https://alembic.sqlalchemy.org/en/latest/tutorial.html). The implementation retains the existing JWT library to limit unnecessary rewrites.
