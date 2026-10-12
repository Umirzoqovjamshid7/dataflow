# DataFlow — MFactor visual integration

## GitHub push holati va ignore qoidalari

`nothing to commit, working tree clean` — kuzatiladigan fayllarda yangi o'zgarish yo'q. `Everything up-to-date` — lokal branchdagi commitlar GitHubga allaqachon yuborilgan. Bu xabarlar push xatosi emas.

MFactor dizayn integratsiyasi `7e36351` commitida DataFlow `frontend/src/` tuzilmasiga joylangan va GitHub `main` branchiga yuborilgan. `AppLayout.jsx`, `AppLayout.module.css`, `AnalyticsUI.jsx`, `navigation.js`, yangilangan sahifalar va testlar Git tomonidan kuzatiladi. Dizaynni yuklash uchun asl `MFactor/` papkasini qayta qo'shish kerak emas.

`.gitignore` dagi `/MFactor/` qoidasi asl alohida loyihani DataFlow repository'siga takroran qo'shmaslik uchun saqlangan. `node_modules/`, `dist/`, `frontend/test-results/` va `frontend/playwright-report/` dependency, build va test artefaktlarini chiqarib tashlaydi. `.env` va `.env.*` maxfiy sozlamalarni chiqarib tashlaydi; faqat `.env.example` konfiguratsiya namunalari kuzatiladi. Maxfiy kalitlar bu namunalarga yozilmasligi kerak.

Keyingi haqiqiy frontend o'zgarishlari `frontend/src/` ichida qilinadi, diff ko'rib chiqiladi va oddiy commit/push orqali yuboriladi. Ignore qilingan fayllarni `git add -f` bilan qo'shish yoki `--force` push qilish talab etilmaydi.

Scope: frontend only. MFactor is a visual reference; DataFlow remains the only application. Backend, database, credentials, authentication API and provider integrations were not modified. No production deployment was performed.

## Audit and duplicate cleanup

The frontend did not contain a second MFactor router, iframe or application mount. The duplicate was the unused `references/mfactor/dashboard/` copy alongside the original local `MFactor/dashboard/`. All ten copied files were byte-identical to their originals and had no frontend imports or routes.

Removed the following tracked copies with Git, recoverable from commit `c1aacaa`:

- `references/mfactor/dashboard/pages/mfactor_bitrix.html`
- `references/mfactor/dashboard/pages/mfactor_facebook.html`
- `references/mfactor/dashboard/pages/mfactor_kampaniyalar.html`
- `references/mfactor/dashboard/pages/mfactor_pbx.html`
- `references/mfactor/dashboard/pages/mfactor_plan_fact.html`
- `references/mfactor/dashboard/pages/mfactor_umumiy.html`
- `references/mfactor/dashboard/pages/mfactor_xodimlar.html`
- `references/mfactor/dashboard/assets/mfactor_filters.js`
- `references/mfactor/dashboard/assets/mfactor_live.css`
- `references/mfactor/dashboard/assets/mfactor_live.js`

The original local MFactor repository is preserved and ignored by the DataFlow repository. Its deployment and production code were not changed.

## Layout and style conflicts resolved

- Replaced overlapping historical global theme/layout overrides with a scoped CSS module. Global CSS now contains base tokens, resets and login styles only.
- One `AppLayout`, `Sidebar`, `Header` and `PageContainer` serve existing pages. Removed page-specific mastheads and duplicate main headings.
- Reused the existing KPI component and shared `GrowthIndicator`, `ChartCard`, `DataTable` and `FilterBar`. Navy backgrounds, gold accents, violet/blue charts, table hover states, responsive spacing and reduced-motion support are unified.
- Mobile drawer supports Escape, focus trapping/restoration and inactive navigation isolation. Tables scroll inside their own containers.
- Removed superadmin navigation entry; preserved `/admin` and its existing permission checks. No backend permission was removed.
- Centralized existing route metadata. Campaign hash navigation works both from another page and from the dashboard itself.
- Missing KPI and funnel values show `Ma'lumot yo'q`; missing/zero funnel values do not display a fabricated positive bar. Real API zero values remain zero. No demo data was added to the application.

Preserved routes: `/dashboard`, `/dashboard#campaigns`, `/crm`, `/employees`, `/calls`, `/plans`, `/ai-advisor`, `/settings`, `/team`, `/admin`. Meta remains in the existing dashboard platform filter and integration settings; no separate MFactor or new Meta page was introduced.

## Changed files

New shared frontend files:

- `frontend/src/navigation.js`
- `frontend/src/components/AppLayout.jsx`
- `frontend/src/components/AppLayout.module.css`
- `frontend/src/components/AnalyticsUI.jsx`

Updated existing frontend files:

- `frontend/src/main.jsx`, `frontend/src/styles.css`, `frontend/src/components/Kpi.jsx`
- `frontend/src/pages/Dashboard.jsx`, `Business.jsx`, `Admin.jsx`, `Team.jsx`, `AIAdvisor.jsx`, `Settings.jsx`
- `frontend/src/analytics.test.js`

Test tooling: `frontend/playwright.config.js`, `frontend/tests/layout.spec.js`, `frontend/package.json`, `frontend/package-lock.json`. Repository/documentation: `.gitignore`, `MIGRATION_V5.md`, this report, plus the ten removed reference files listed above.

## Validation

- `npm run build`: passed; production assets generated in `frontend/dist/`.
- `npm test`: 6/6 passed, including existing analytics/pagination coverage and role-specific navigation metadata.
- `npm run test:e2e`: 9/9 passed in headless Microsoft Edge against the production preview.
- Existing navigation and one header/sidebar/main heading verified at 1440, 768, 390 and 320 px; no document horizontal overflow.
- Direct superadmin route, mobile Escape/focus restoration, browser back and same-page campaign hash navigation passed.
- Settings credential POST payload, cleared secret input, light theme and AI POST payload/response passed.
- Populated charts, campaign search, platform filter query and CSV download passed. Empty KPI display also verified. Visual screenshots inspected for dark desktop/mobile, populated charts/table and light settings.
- `git diff --check` passed. Diff against HEAD is empty for `backend/` and `frontend/src/api.js`.

Browser tests intercept all application API requests with isolated fixtures; they do not exercise real provider accounts or production services. Screenshots are local test artifacts under `frontend/test-results/` and are excluded from Git. No backend regression suite was run for this frontend-only change. The historical V5 backend validation and staging limitations remain in `MIGRATION_V5.md`.
