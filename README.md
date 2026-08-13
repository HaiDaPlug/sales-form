# Digital Kontakt Sales Portal

Internal sales workflow portal for Digital Kontakt. The app guides sellers through four separate workflows while using Pipedrive as the CRM record system:

1. Meeting booking with IT technician
2. Create deal in Pipedrive
3. Mediacleaning cancellation documents
4. Contract generation

Every run is recorded in a shared history so sellers can track and own their
work rather than submitting into a void.

## Hard Business Rules

- Meeting booking must not create a deal.
- Mediacleaning must not create a deal.
- Contract generation must not create a deal.
- Only the explicit Create Deal step may create a Pipedrive deal.
- Deal creation is blocked unless every custom field key is configured — a
  missing key would silently drop contract values from the deal.
- Calendar invitations are business-required, but the integration method is still TBD.
- Mediacleaning document generation must still work as a local/downloadable output even if no Pipedrive deal or organization target exists.
- Avtalssammanstallning may appear both inside Mediacleaning and inside Contract generation; approved scope should decide whether those PDFs are separate or combined.
- Pipedrive credentials must stay server-side.
- Pipedrive custom fields, pipeline IDs, stage IDs, seller IDs, and technician IDs are account-specific and must not be guessed.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

`APP_ACCESS_PASSWORD` and `APP_SESSION_SECRET` are required to log in — without
them the app stays locked. Fill in the real Pipedrive API token and custom field
keys before creating deals. Do not commit real secrets.

## Access

The portal is behind a shared-password gate (`src/proxy.ts`). Everything is
private by default; only the login page and login endpoint are public.

The name entered at login labels that person's runs in the history. To move to
SSO or per-user accounts later, replace `verifyCredentials` and
`getSessionSubject` in `src/lib/auth/session.ts` plus the login form — the gate,
cookie handling, and every route stay unchanged.

## History

Every workflow run is appended to `.data/history.jsonl` (gitignored) and shown
at `/historik`: who ran it, when, for which customer, the resulting Pipedrive
IDs, and any failure reason. Set `HISTORY_FILE_PATH` to relocate it.

There is no database. The store exposes two functions (`listHistory`,
`recordHistory`), so moving to a real database means rewriting
`src/lib/history/store.ts` alone.

## Status

The four workflows validate, gate access, record history, return documents, and
attach deals to a real contact and company. Not yet production-ready — see
`current_state.md` for the full picture. The largest remaining gaps:

- **Deal creation is blocked by the Pipedrive account, not the code.** The API
  token cannot create deals (403), and seven of the ten required custom deal
  fields do not exist in the account yet. Both must be fixed on the Pipedrive
  side before the deal workflow can run end to end.
- **Documents are drafts, not PDFs.** `src/lib/pdf/service.ts` emits plain text
  pending a PDF library and approved legal copy.
- **Calendar invitations are unbuilt** pending the provider decision below.

## Choosing records instead of typing IDs

Seller, IT technician, pipeline, and stage are dropdowns loaded from the
Pipedrive account. Stages are filtered by the selected pipeline, and changing
pipeline clears the stage so the two cannot disagree. If a list cannot be loaded
the field falls back to a plain text input, so a known ID can still be entered.

Each step's lookup searches Pipedrive and lets you pick an existing person,
organization, or deal. Picking one reuses its ID; leaving it blank creates a new
record and links it. If a deal fails after its contact and company were created,
the IDs come back with the error and are reused on retry, so retrying never
duplicates records.

## Still Needed From Client/Pipedrive

- Custom field API keys (all `PIPEDRIVE_FIELD_*` in `.env.example`). **Deal
  creation is blocked until these are set** — by design, so contract values
  cannot be silently lost.
- ~~Pipeline and stage IDs~~ — resolved. Read live from the account; Google
  Digital Paket is pipeline `1`. Set `PIPEDRIVE_DEFAULT_PIPELINE_ID` /
  `PIPEDRIVE_DEFAULT_STAGE_ID` only if a pre-selected default is wanted.
- ~~Seller/user IDs~~ — resolved, read live from the account. Still open:
  whether IT technicians are Pipedrive users or external contacts. Both work
  today (dropdown for users, free-text name for externals).
- Calendar invitation decision: Pipedrive activity plus Pipedrive scheduler, Google Calendar, Microsoft 365, or another calendar provider.
- Approved Swedish legal text for cancellation letters and contract summaries.
- Whether Mediacleaning agreement summary and Contract generation should produce separate PDFs or a combined export in some cases.
- Final attachment fallback order: deal, organization, person/activity, or local download only.

## Useful Checks

```bash
npm run typecheck
npm run build
```
