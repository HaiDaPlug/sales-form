# Current State

## 2026-08-12 — ID fields replaced with Pipedrive-backed dropdowns

Seller, IT technician, pipeline and stage were free-text boxes expecting raw
Pipedrive IDs. All four are now dropdowns fed from the account, so sellers stop
typing database IDs by hand.

### Changes

- `src/lib/pipedrive/types.ts` — `ReferenceOption` (`id`, `name`, optional
  `pipelineId`), the flat shape backing every dropdown.
- `src/lib/pipedrive/service.ts` — `getUsers` / `getPipelines` / `getStages`
  normalize server-side, matching how the search endpoints already work. All
  three filter out inactive records.
- `src/components/sales-wizard/useReferenceData.ts` — fetches the three lists
  once in the wizard and passes them down. Three of the four steps need the same
  data, so per-step fetching would triple the requests.
- `src/components/sales-wizard/fields.tsx` — `ReferenceSelect`, and `StepProps`
  gained a `reference` prop.
- Steps: Meeting (seller, technician), Deal (pipeline, stage, seller), Contract
  (seller). Mediacleaning has no ID fields.

### Behaviour worth knowing

- **Stages filter by the selected pipeline**, and changing pipeline clears the
  stage — stages belong to exactly one pipeline, so keeping the old value would
  send a mismatched pair. With no pipeline chosen the stage field is disabled
  with "Välj pipeline först".
- **Falls back to a text input** when a list cannot be loaded (bad token,
  Pipedrive down, empty list). Losing the dropdown must not block a seller who
  already knows the ID — the old free-text behaviour stays reachable.
- **An ID not present in the list is preserved** as an "Okänt ID" option rather
  than silently disappearing from the select (deactivated user, other pipeline).
- Picking a technician or seller fills the matching name field, which the
  contract prints. "IT-tekniker namn" stays free text because technicians may be
  external contacts rather than Pipedrive users.

### Fixed after seeing live data

- **Duplicate user names.** The account has two active users both called
  "Digital Kontakt" (`info@` and `campaign@`). Identical dropdown entries are
  unusable, so an email is appended when a name is ambiguous.
- **Stage ordering.** `order_nr` restarts per pipeline, so a flat sort
  interleaved the two pipelines. Now grouped by pipeline, then ordered within.
- **Trailing whitespace** in Pipedrive names ("Välkomstbrev utskick ") is
  trimmed centrally in `asString`, which also cleans up the search results.

### Account facts confirmed live

- **Pipelines**: `1` = Google Digital Paket, `2` = Fullmakt & Bestridanden.
  This answers the long-standing "target flow for Google Digital Paket" question
  in the README — it is pipeline 1.
- **Stages** — pipeline 1: Välkomstbrev utskick › Mediacleaning Utskick › Intro
  Möte + Hemsida › Företagsprofil + Rapport › Klar. Pipeline 2: Kvalificerade ›
  Kontakt skapad › Demo bokad › Offert lämnad › Förhandling startad.
- **Users**: 3 active (2 service accounts + Roble).

These are live values, not guesses — but they still belong in `.env.local` as
`PIPEDRIVE_DEFAULT_PIPELINE_ID` / `PIPEDRIVE_DEFAULT_STAGE_ID` if a default is
wanted, rather than hardcoded.

### Verified

`typecheck`, `lint` and `build` pass. All three endpoints were exercised against
the live account through the auth gate: normalized shapes, per-pipeline stage
filtering (5 stages each, correct order), user disambiguation, and 401 for
unauthenticated callers.

## 2026-08-12 — Auth gate configured and verified end-to-end

No code changed. The gate built on 2026-08-04 had never been given credentials:
both `APP_ACCESS_PASSWORD` and `APP_SESSION_SECRET` were present but **empty** in
`.env.local`, so `isAuthConfigured()` returned false and every login attempt got
a 503 (`Inloggning är inte konfigurerad`). Because the proxy is deny-by-default,
that left the whole app unreachable — the fail-closed behaviour working as
designed, but indistinguishable from a broken app.

Both values are now set locally. They are **not** in the repo: `.env.local` is
gitignored, and each deployment needs its own pair.

### How login works, for whoever configures the next environment

- One **shared password** for the whole team, not per-user accounts.
  `verifyCredentials` checks the password only — the name field is never
  validated.
- The name is a **label**, not an identity. It becomes `session.subject` and is
  what stamps `createdBy` on history entries and generated documents. Anyone can
  type anyone's name; the history is an audit convenience, not an audit trail.
  Worth knowing before it is relied on for accountability.
- `APP_SESSION_SECRET` must be ≥16 chars (enforced in `env.ts`). Generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
  Rotating it invalidates every live session — the cookie is HMAC-signed, not
  stored server-side.

### Verified live

Against a clean dev server: `/` with no cookie → 307 to `/login`; wrong password
→ 401; correct password → 200 setting `dk_session` (HttpOnly, 12h); the cookie
then passes the proxy to `/` and `/historik`, which renders the typed name. The
authenticated reference-data and history calls (`/api/pipedrive/{users,pipelines,
stages}`, `/api/history`) all return 200 through the gate in a real browser.

### Reference-data gap is closed (supersedes the 2026-08-08 note)

`src/components/sales-wizard/useReferenceData.ts` now loads users, pipelines and
stages once in the wizard and passes them down. The 2026-08-08 entry lists
`getUsers` / `getPipelines` / `getStages` as "built and unused" — that is no
longer true. Seller/pipeline/stage are dropdowns, not free-text ID fields.

### Environment gotcha worth remembering

Debugging the above was confused by **three `next dev` instances running against
the same `.next` directory**, which corrupted the Turbopack cache
(`TurbopackInternalError: Failed to open SST file`). Symptoms were misleading:
one port served plain-text 500s, another rejected the correct password from a
stale bundle, and the dev server silently hopped ports (3000 → 3007 → 3008) so
`localhost:3000` was a different app than the one being edited. If behaviour
stops matching the source, check for orphaned dev servers and delete `.next`
before debugging the code.

### Still open

- A **React hydration mismatch warning** appears in the dev log on a client
  component. Dev-only, predates this work, not yet traced.
- Deal creation remains blocked by the API token's missing deal-write permission
  and the seven missing custom fields (see 2026-08-08).

## 2026-08-08 — Deals are linked to a person and organization

Closed the highest-value gap: every deal is now attached to a real contact and
company. Previously `person_id` and `org_id` were always `undefined`, because
nothing in the UI ever created or selected a person — every deal was orphaned.

Verified against the live Pipedrive account (token now configured).

### Search results are selectable

- `src/lib/pipedrive/types.ts` — added `SearchHit`, a flat UI-ready result, and
  `PipedriveSearchEnvelope`.
- `src/lib/pipedrive/service.ts` — the three search functions normalize
  Pipedrive's envelope server-side. **`/v1/*/search` returns
  `{ data: { items: [{ result_score, item }] } }`, not the flat array the code
  assumed** — confirmed against the live API. That mismatch is why the old
  LookupBox could only render a JSON blob.
- Persons return `emails`/`phones` as plain string arrays, not objects.
- Searches are capped at `MAX_SEARCH_RESULTS` (10); Pipedrive defaults to 100,
  and the UI now says when the list is capped instead of silently showing an
  arbitrary subset.
- Terms shorter than 2 characters are rejected locally with a readable message
  — Pipedrive returns a raw 400 for those.
- `src/components/sales-wizard/LookupBox.tsx` — clickable result rows (name plus
  supporting detail) replacing `<pre>{JSON.stringify(...)}</pre>`. Selecting a
  record shows a confirmation with a "Koppla loss" escape hatch.

### Deals attach to real records

- `resolveDealParties()` in `service.ts` — reuses selected IDs, creates whatever
  is missing, and links the person to the organization. Organization is created
  first so the person is created already carrying `org_id`.
- `buildDealPayload(data, parties)` now takes the resolved IDs as an argument,
  so the payload **cannot** be built with the undefined form IDs that caused the
  original bug.
- The custom-field guard runs **before** any record is created — a config
  failure would otherwise leave orphaned person/organization rows. Verified: a
  blocked deal creates zero records.

### Partial-failure handling (found during live testing)

A deal can fail at `createDeal` *after* its person and organization exist. Rollback
is not viable — the API token may lack delete permission, and silently removing
real CRM records is worse than keeping them.

Instead the error response carries the created IDs, the wizard writes them into
state, and a retry reuses them. **Verified live**: two submissions of the same
deal against a 403 produced exactly one person and one organization, with
`createdPerson: false` on the retry. Failed runs also record those IDs in the
history so the records stay traceable.

### Account findings worth acting on

- **The API token is create-capable but not delete-capable for persons, and
  cannot create deals at all** (403 from `createDeal`). Deal creation cannot be
  verified end-to-end until the token's permission set is widened.
- **Only 5 custom deal fields exist in the account**: Viktigast för kunden,
  Faktura Start, Fakturagrupp, Faktura status, Affärens säljare. Seven of the ten
  the app requires (`avtalslangd`, `avtalsStartdatum`, `manadskostnad`,
  `startavgift`, `bindningstid`, `uppsagningstid`, `totaltAffarsvarde`) **do not
  exist yet** and must be created in Pipedrive before deal creation can work.

### Not verified

Deal creation itself — blocked by the token's missing deal-write permission.
Everything up to and including party resolution and linking is confirmed against
live data; the final `createDeal` call is not.

## 2026-08-04 — Auth gate, run history, security and correctness fixes

Closed the blockers found in the codebase investigation. Scope stayed the four
workflows — no CRM platform features were added.

### Auth (new)

- `src/proxy.ts` — deny-by-default gate over every route. Only `/login` and
  `/api/auth/login` are public; unauthenticated pages redirect, unauthenticated
  API calls get 401. Named `proxy` because Next 16 deprecates `middleware`.
- `src/lib/auth/session.ts` — shared-password session in a signed HttpOnly
  cookie (HMAC-SHA256 via WebCrypto, since the proxy runs on the Edge runtime;
  12h expiry, SameSite=lax). **`verifyCredentials` and `getSessionSubject` are
  the only two functions that decide who gets in and what they are called** —
  swapping in SSO/OAuth means replacing those two plus the login form.
- `src/lib/auth/server.ts` — `requireSession()` for route handlers.
- `src/app/login/page.tsx`, `src/components/auth/LoginForm.tsx` — login form.
  The name entered is what attributes runs in the history.
- `src/app/api/auth/{login,logout}/route.ts`.
- Fails closed: with `APP_ACCESS_PASSWORD` unset the app is locked, not open.

### History (new)

Sellers now own and track their work instead of submitting into a void.

- `src/lib/history/{types,store}.ts` — file-backed run log at `.data/history.jsonl`.
  **Append-only (JSON Lines) is load-bearing**: Next serves route handlers from
  separate module instances, so an in-process write queue cannot serialize them
  and a read-modify-write of one JSON array loses entries under concurrency.
  A single `appendFile` is serialized by the OS. Verified with 30 concurrent
  cross-route writes — 30/30 persisted, no torn lines.
- `src/app/api/history/route.ts`, `src/app/historik/page.tsx` — full list with
  per-workflow filters. `HistoryPanel` shows recent runs beside the wizard.
- Records who ran what, when, for which customer, the resulting Pipedrive IDs,
  and failures with their reason. `createdBy` comes from the session, never the
  client.
- No database was added — out of scope. The store's exported surface is two
  functions, so swapping in a real DB later means rewriting one file.

### Security and correctness

- `src/lib/config/env.ts` (new) — boot-time env validation. Empty values in a
  `.env` file (`FOO=`) are treated as absent; otherwise an unset Pipedrive key
  failed validation for unrelated features like login.
- **Pipedrive token moved from the query string to the `x-api-token` header**,
  so it can no longer leak into proxy logs or Referer headers.
- **Custom-field keys are now enforced.** Previously a missing key silently
  dropped commercial terms (monthly cost, fees, binding period) from the deal.
  Deal creation now fails with a 503 naming the missing keys instead.
- `totalDealValue` was collected in the UI and never sent to Pipedrive; it is
  now mapped to `PIPEDRIVE_FIELD_TOTALT_AFFARSVARDE`.
- The five unvalidated passthrough routes (`persons`, `organizations`,
  `activities`, `notes`, and person/org updates) now have zod schemas. They were
  an open write proxy into the CRM.
- `POST /api/pipedrive/files` was **removed**: it accepted JSON and passed it to
  a function expecting a `Blob`, so it could never work. Needs a
  `multipart/form-data` route, which belongs with the real PDF work.
- Error statuses are honest: 401 auth, 422 validation, 503 configuration, 502
  upstream unreachable, 500 unexpected. Previously everything was 400, and raw
  config errors were echoed to the client.
- Validation tightened: organisation number must match `NNNNNN-NNNN`, dates and
  times must be real (`"banana"` was previously a valid meeting date), and a
  deal now requires a contact email.
- `src/lib/crm/types.ts` is now derived from the zod schemas via `z.input` /
  `z.output` instead of being hand-mirrored. The two had already drifted
  (`emailType` existed in the type but not the schema, so it was silently
  stripped at parse time).

### Wizard

- **Double-submit protection.** A completed step is locked and shows "Kör steget
  igen" instead; previously two clicks created two Pipedrive deals.
- **Created record IDs are captured and reused.** Creating a deal now fills the
  deal ID into the Mediacleaning and Contract steps automatically — the app knew
  the ID and was asking the seller to retype it by hand.
- Steps 3 and 4 **produce a file for the first time**. Both routes generated a
  document, discarded it, and returned only a filename, so the seller received
  nothing.

### Documents are still drafts, not PDFs

`src/lib/pdf/service.ts` emitted plain text labelled `application/pdf` — a file
no reader can open. It now emits honest `.txt` with `text/plain`. Real PDF
rendering needs a PDF library and the approved legal copy (see below).

### Still needed from client/Pipedrive — nothing here can be guessed

1. **Custom field API keys** — all of `PIPEDRIVE_FIELD_*` in `.env.example`.
   Until these are set, **deal creation is blocked by design** rather than
   silently losing contract values.
2. **Pipeline and stage IDs**, including the target flow for Google Digital Paket.
3. **Seller/user IDs**, and whether IT technicians are Pipedrive users or
   external contacts.
4. **Calendar invitation decision** — Pipedrive activity + scheduler, Google
   Calendar, Microsoft 365, or another provider. Business-required, still unbuilt.
5. **Approved Swedish legal text** for cancellation letters and contract
   summaries. Blocks real document generation.
6. **Separate vs combined PDFs** for Avtalssammanställning across Mediacleaning
   and Contract.
7. **Attachment fallback order** — deal, organization, person/activity, or local
   download only.

### Known gaps, deliberately not addressed

- Lookup results still render as raw JSON and are not selectable. Deals are
  therefore still created without a linked person or organization —
  `createPerson` / `createOrganization` / `linkPersonToOrganization` exist and
  are routed but nothing in the UI calls them. **This is the highest-value
  remaining work.**
- Seller/technician/pipeline/stage are still free-text ID fields.
  `getUsers` / `getPipelines` / `getStages` are built and unused.
- History is per-run, not resumable — a run can be inspected but not reopened
  and continued.
- Mobile layout at the 980px/560px breakpoints still has not been visually QA'd.

### Verification

`npm run typecheck`, `npm run lint`, and `npm run build` all pass. The auth gate,
session forgery/expiry rejection, validation, error statuses, document download,
history recording, and concurrent writes were exercised against a live dev server.
Not verified against a real Pipedrive account — no API token is configured.

## 2026-07-04 — Upgraded Next.js 14 → 16

Upgraded the app from Next.js 14.2.4 to 16.2.10 (React 18 → 19). Build, typecheck, lint, dev server, and the API routes were all verified working after the upgrade.

### Changes

- `package.json`
  - `next` `^14.2.4` → `^16.2.10`
  - `react` / `react-dom` `^18.3.1` → `^19.2.7`
  - `@types/react` / `@types/react-dom` → 19.x
  - `eslint` `^8.57.0` → `^9.39.4` (Next 16's `eslint-config-next` requires ESLint 9)
  - `eslint-config-next` `^14.2.4` → `^16.2.10`
  - `lint` script: `next lint` → `eslint .` (Next 16 removed the `next lint` command)
- `eslint.config.mjs` (new) — ESLint 9 requires flat config; this repo had no prior `.eslintrc`, so a minimal flat config wrapping `eslint-config-next`'s native export was added.
- `src/app/api/pipedrive/[...operation]/route.ts` — dynamic route `params` became a `Promise` in Next 15+. Updated the `RouteContext` type and both `GET`/`POST` handlers to `await context.params` before reading `operation`. This was the only source code change required by the upgrade.
- `tsconfig.json` — auto-updated by `next build` for Turbopack: `jsx` set to `"react-jsx"`, `.next/dev/types/**/*.ts` added to `include`.
- `next-env.d.ts`, `package-lock.json` — regenerated by the toolchain.

### Notes

- Next.js 16 builds with Turbopack by default; no config changes were needed to opt in.
- No other breaking-change surface existed in this codebase (no `pages/` router, no middleware, no `cookies()`/`headers()` calls, no `next/image` usage) — the async `params` fix was the only required code change.
- Verified via `npm run typecheck`, `npm run lint`, `npm run build`, and a live `npm run dev` smoke test (homepage 200, `/api/pipedrive/custom-field-mappings` returns valid JSON).

## Sales wizard split into step components

`SalesWizard.tsx` was a single monolithic file; the per-step markup has been extracted so the wizard file now holds state, navigation, and submission only (−368 lines).

### Changes

- `src/components/sales-wizard/steps/` (new) — `MeetingStep`, `DealStep`, `MediacleaningStep`, `ContractStep`, each taking a `data` / `onChange` pair from `SalesWizard`.
- `src/components/sales-wizard/fields.tsx` (new) — shared field primitives used across the steps.
- `src/components/sales-wizard/LookupBox.tsx` (new) — Pipedrive lookup/search input.
- `src/components/sales-wizard/SupplierEditor.tsx` (new) — supplier sub-form.
- `src/components/sales-wizard/utils.ts` (new) — shared wizard helpers.

## Pipedrive field-metadata endpoints

Added read-only endpoints exposing Pipedrive's field definitions, backing the lookup UI.

### Changes

- `src/lib/pipedrive/service.ts` — added `getDealFields()`, `getPersonFields()`, `getOrganizationFields()`, each a `pipedriveRequest` against the matching `/…Fields` resource.
- `src/app/api/pipedrive/[...operation]/route.ts` — routed `deal-fields`, `person-fields`, and `organization-fields` on GET.

## Sticky full-height sidebar + mobile step strip

### Changes

- `src/app/globals.css`
  - `.sidebar` — `position: sticky; top: 0; height: 100vh; overflow-y: auto`, so the nav stays pinned and the panel spans the viewport instead of ending under the last step button.
  - `.step-button` — added `:hover` and `:focus-visible` states; there was previously no focus ring at any breakpoint, in a keyboard-navigable wizard.
  - `@media (max-width: 980px)` — sidebar becomes a ~44px sticky top strip (flex row, compact brand, steps as horizontal pills) rather than a ~250px vertical stack. Overflow scrolls horizontally with the scrollbar hidden.
  - `@media (max-width: 560px)` (new) — step labels hide, leaving numbered pills, so all four stay reachable without horizontal scrolling. The `<h1>` in `.toolbar` already names the active step, so the strip stays deliberately secondary.
- `src/components/sales-wizard/SalesWizard.tsx` — `.step-button` gained `aria-label={"Steg N: <name>"}` and `aria-current="step"`; the label is visually hidden at ≤560px, so the accessible name has to come from the attribute.

### Notes

- Verified on laptop widths and via `npm run build` / `tsc --noEmit`. **The mobile layout has not been QA'd visually yet** — the 980px and 560px breakpoints and the pill sizing were reasoned, not eyeballed.
