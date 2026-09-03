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
- Deal creation is blocked unless the three Pipedrive fields the account
  currently supports are mapped: Faktura Start, Fakturagrupp and Viktigast för
  kunden. A missing key would otherwise silently drop those values.
- Meeting invitations use Pipedrive Scheduler. Configure a public booking link
  with `PIPEDRIVE_SCHEDULER_URL`; a Scheduler booking creates the Pipedrive
  activity itself. The form's activity submission remains for an already
  agreed date/time and must not be used as a duplicate after Scheduler booking.
- Mediacleaning document generation must still work as a local/downloadable output even if no Pipedrive deal or organization target exists.
- Mediacleaning combines one cancellation page per supplier and its optional
  agreement summary in one PDF. Contract generation creates its own PDF unless
  the seller explicitly selects the combined contract + Mediacleaning package.
- Existing CRM people and organizations are read-only. The application exposes
  no update or delete method and refuses to reassign an existing contact to a
  different organization.
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

The four workflows validate, gate access, record history and preserve the rule
that only the explicit deal step may create a deal. The current implementation:

- creates missing deal people and organizations, reuses matching records and
  resolves the first stage in the selected pipeline when no stage is chosen;
- validates the documented mandatory contact, organization, invoicing, seller
  and customer-priority fields before deal creation;
- creates real, parseable PDF drafts for Mediacleaning and contract generation;
- creates one cancellation page per supplier and can include the Mediacleaning
  agreement summary in the same PDF;
- can explicitly append a completed Mediacleaning document set to the contract
  PDF, while keeping the two workflows separate by default;
- exposes the configured Pipedrive Scheduler link in the meeting step;
- uploads document PDFs to the selected deal first, otherwise the organization,
  and creates the corresponding Pipedrive note;
- still returns the local PDF when no CRM target exists or attachment fails.

The app is not yet production-ready. The Pipedrive Scheduler link must be
configured, the Mediacleaning wording still needs confirmation against the
client's templates, and live deal-create permission must be confirmed in the
Pipedrive account.

## Form values and Pipedrive mappings

Sellers enter contract length, contract start, monthly cost, start fee, total
deal value, binding period and cancellation period directly in the app. These
values are form data, not environment variables.

Environment variables under `PIPEDRIVE_FIELD_*` contain only account-specific
Pipedrive API field keys. The current account exposes writable fields for
Faktura Start, Fakturagrupp, Viktigast för kunden and Affärens säljare, so those
four values are written to the deal. The other commercial values remain
available to the contract workflow and generated contract, but are not invented
as Pipedrive custom fields. If the account later adds those fields, mappings can
be added without moving seller-entered values into environment configuration.

Organizations have two custom fields of their own: `Org. Nummer`, which holds
organisationsnummer or personnummer, and `Webbplats`. Both are written whenever
this app creates an organization, from any workflow. They differ from the deal
keys in one way that matters: a missing deal key fails the request, because the
value would otherwise be dropped from a deal the seller believes is complete,
while a missing organization key only skips that field so meetings and deals
keep working in an account that has not mapped them.

## Choosing records instead of typing IDs

Seller, IT technician, pipeline, and stage are dropdowns loaded from the
Pipedrive account. Stages are filtered by the selected pipeline, and changing
pipeline clears the stage so the two cannot disagree. If a list cannot be loaded
the field falls back to a plain text input, so a known ID can still be entered.

Sellers are the exception to "loaded from the account's users": they have no
Pipedrive login, and exist as options on the custom deal field `Affärens
säljare`. The dropdown reads those options live from `GET /dealFields`, so
editing them in Pipedrive changes the form without a redeploy. Because an option
id is not a user id, it is written to that custom field and never to `user_id` —
sending it as an owner made Pipedrive reject the record as an unknown user.
Activities have no equivalent custom field in this account, so a booked meeting
is owned by the API token's user and names its seller on the first line of the
activity note instead.

## Duplicate and double-booking protection

Submitting the meeting step checks Pipedrive for activities whose time overlaps
the booking, and stops on a hit: a dialog lists what it clashes with and offers
"avbryt och ändra tid" or "boka ändå". Nothing is created until the seller
chooses, because an overlap is usually a re-submitted booking — the account
already contains identical activity pairs made that way. The choice is not
remembered; editing the time re-runs the check.

The check spans every user's activities, not just the API token's own, and it
compares in UTC — the form activities are stored in — converting the seller's
Swedish time first. Touching edges are allowed, so back-to-back bookings do not
warn, and undated to-dos are ignored since they have no time span. If the check
itself fails the booking proceeds: a warning is an aid, and losing it is not a
reason to block a seller.

Lookups search Pipedrive and let the seller reuse existing records. Organization
search covers custom fields, so a customer can be found by organisationsnummer
or personnummer and not only by name or address. The deal step creates any
missing person or organization and links both to the deal. A created
organization carries its identity number, website and address including the
city; existing records are never edited. If an existing person already belongs to a
different organization, the submission is stopped and the seller must correct
the selection or create a new contact. If
deal creation fails after those records were created, their IDs are returned
and reused on retry. Mediacleaning can use an existing deal or organization,
explicitly create an organization without a deal, or continue with local PDF
download only. Document steps never create a deal.

## Still Needed From Client/Pipedrive

- The four custom deal field API keys listed in `.env.example`. Deal creation
  is blocked until those mappings are configured.
- ~~Where organisationsnummer/personnummer is stored~~ — resolved. It is the
  custom organization field `Org. Nummer`; website is a custom field too, since
  the account uses it rather than Pipedrive's native `website`. Both keys are
  optional (`PIPEDRIVE_FIELD_ORG_NUMBER`, `PIPEDRIVE_FIELD_ORG_WEBSITE`): an
  unset key skips that field instead of failing the request, but the identity
  number must be mapped for duplicate detection to work.
- ~~Pipeline and stage IDs~~ — resolved. Read live from the account; Google
  Digital Paket is pipeline `1`. Set `PIPEDRIVE_DEFAULT_PIPELINE_ID` /
  `PIPEDRIVE_DEFAULT_STAGE_ID` only if a pre-selected default is wanted.
- ~~Seller/user IDs~~ — resolved, read live from the account. Still open:
  whether IT technicians are Pipedrive users or external contacts. Both work
  today (dropdown for users, free-text name for externals).
- A public general-availability or specific-times link copied from Pipedrive
  Scheduler into `PIPEDRIVE_SCHEDULER_URL`.
- Confirmation of the client's Mediacleaning templates and final Swedish
  cancellation wording. Until then PDFs carry a prominent `UTKAST` marker.
- Final legal payment and termination wording for the contract before it is
  used for signing.
- Confirmation that the explicit contract + Mediacleaning checkbox matches the
  client's preferred combined-document workflow.

## Mediacleaning template seam

The draft wording is isolated in
`src/lib/pdf/templates/mediacleaning.ts`. An approved client version can be
added as a new `MediacleaningTemplate` without changing PDF pagination,
Pipedrive upload logic or the sales form. Until approval, generated documents
remain visibly marked `UTKAST`.

## Useful Checks

```bash
npm run typecheck
npm test
npm run lint
npm run build
```
