# Current State

## 2026-08-27 — Seller field bound to Pipedrive, booking-overlap warning added; 233 tests pass

Two features, both driven by what the live Pipedrive account actually contains
rather than by what the field names suggested.

### Säljare is a custom deal field, not a Pipedrive user

The dropdown offered the account's *users* — two "Digital Kontakt" service
accounts, a deactivated Johan Stenvall, and Roble — while the four names the
business uses (Filippa, Robin, Adam Westin, Tobias Ek) are **options 72–75 on
the custom deal field "Affärens säljare"** (`e750cc48…`). They have no Pipedrive
login, so `/users` cannot list them and never will.

The selection was also sent as `user_id`. An option id is not a user id, which
is why the salesperson never appeared in Pipedrive.

- `getSellers()` reads the options live from `GET /dealFields`, so editing them
  in Pipedrive changes the form without a redeploy. Served at
  `/api/pipedrive/sellers`; the deal, meeting and contract steps all use it.
- The deal writes the option id to the custom field and no longer sets
  `user_id`. Verified live: a deal created with option 74 reads back as `74`.
- `PIPEDRIVE_FIELD_AFFARENS_SALJARE` joins the required custom-field keys, so an
  unmapped key fails loudly instead of dropping the seller silently.

Meetings have nowhere structured to put this: the account has **zero custom
activity fields**, and an activity's only owner slot is `user_id`. The seller's
name is written as the first line of the activity note instead, following the
pattern already used for external IT technicians.

### Overlapping bookings now warn before anything is created

Submitting the meeting step checks Pipedrive for activities overlapping the
proposed time. On a hit, a blocking dialog lists the clashes and offers "avbryt
och ändra tid" or "boka ändå"; nothing is created until the seller chooses. The
account already contained an identical duplicate pair (`4505`/`4506`) made by
re-submission, which is the case this exists to catch. The choice is not
remembered — editing the time re-runs the check.

Two endpoint behaviours were verified against the live API because either one
would have made the feature silently useless:

- **`end_date` is exclusive.** `start_date=end_date=2026-08-19` returns zero
  activities on a day holding two; `19→20` returns both.
- **It defaults to the token user's own activities** — 3 of the account's
  hundreds. `user_id=0` is required, or a colleague's double-booking is
  invisible.

Touching edges do not warn, so back-to-back bookings are unaffected; undated
to-dos are skipped, since treating a missing time as midnight would warn on
every booking sharing that date. A failed check never blocks the booking.

### Correction recorded

Mid-implementation the timezone conversion from `0277e10` was wrongly judged to
be a bug, on the evidence that Pipedrive's API echoes `due_time` back exactly as
sent. That evidence was insufficient: the API round-trip says nothing about what
Pipedrive **Calendar** renders, which is where the original 16:10 → 19:10 shift
was observed. The overlap check was reverted to compare in UTC via the existing
`stockholmMeetingTimeAsUtc`, matching the payload's convention.
`buildMeetingActivityPayload` was never modified.

### Verification

- `npm test` — **233/233 pass** across fourteen files.
- `npm run typecheck`, `npm run lint`, `npm run build` — all pass.
- `git diff --check` — passes.
- Overlap logic checked against live Pipedrive data: **8/8 scenarios**,
  including catching `4505`/`4506` and correctly not firing on back-to-back
  slots or on days holding only undated to-dos.

### Open items

- **Deal `806`** ("ZZ TEST seller field - safe to delete") was created to prove
  the custom field accepts an option id, and still exists. The API token lacks
  delete permission for deals (403 on both v1 and v2), so it needs removing by
  hand. Activity deletion does work — the timezone probe activity was cleaned up
  through the API.
- A meeting's seller lives in the activity note. Making it structured requires
  an admin to add a "Säljare" enum field on Activities with the same four
  options; writing to it would then be a two-line change.
- The timezone direction is confirmed only by the original Calendar observation.
  A booking made through the form and checked in Pipedrive Calendar would settle
  it definitively.

## 2026-08-27 — Full mobile compatibility pass completed

The sales portal now has a responsive, touch-friendly presentation across the
workflow, login and history routes. The work stayed presentation-only: CRM
payloads, validation, authentication and document generation were not changed.
Most of the implementation lives in `src/app/globals.css`; the history page
adds `data-label` attributes so its semantic table can render as labeled cards
on phones.

### What changed

- The sidebar becomes a two-row sticky header before its contents can crowd or
  overflow. All four workflow steps remain visible as full labels on tablets
  and numbered 44px touch targets on phones.
- Phone layouts respect display safe areas, use dynamic viewport heights and
  keep controls at least 44px tall. Form controls render at 16px on small
  screens so iOS does not zoom the page when a field receives focus.
- Forms, actions, lookup results, selected CRM records, warnings and long
  conflict-choice buttons now shrink and wrap without widening the viewport.
- Date and time popovers fit their form column instead of using a fixed width
  that can escape a narrow panel. Calendar navigation and days have larger
  mobile targets.
- The history filters become a single swipeable row and each history entry
  becomes a labeled card below 680px; the desktop table and its semantics are
  preserved.
- The login card remains usable on narrow and short viewports, including
  devices with safe-area insets.
- The booking-overlap dialog, added concurrently during this pass, received
  dynamic-height, safe-area and stacked-action handling for phones.

### Verification

- Live responsive checks covered 320px, 375px, 768px and 1440px viewports.
- All four wizard steps were inspected at 320px with no horizontal overflow.
- The login screen and date picker were exercised at 320px; the history-card
  layout was checked with deliberately long sample content.
- `npm run typecheck`, `npm run lint` and `npm run build` pass. The production
  build generates all eleven routes.
- The responsive change set passed the then-current suite at **218/218 tests**.
  A meeting-overlap feature added concurrently later expanded the suite. The two
  overlap failures recorded here mid-flight (ordering and winter time) were
  caused by that feature's timezone handling, not by the mobile work, and are
  resolved — the combined tree now passes **233/233**.
- `git diff --check` passes. No dependency manifest or lockfile changed.

## 2026-08-27 — Pipedrive meeting times corrected for Stockholm timezone; 210 tests pass

A live comparison of form-created activities `4505` and `4506` isolated the
meeting-time shift. The form submitted `2026-08-19 16:10`, and Pipedrive's API
stored `due_time: 16:10`, but Pipedrive Calendar displayed each activity as
`18:10–19:10`. Calendar sync was inactive, and both the viewing browser and the
assigned Pipedrive user were configured for `Europe/Stockholm` (`UTC+02:00`).
Pipedrive Calendar was therefore localizing the bare API time as though it were
UTC.

`buildMeetingActivityPayload` now converts the seller's Stockholm wall-clock
date and time to UTC immediately before creating the activity. The conversion
uses `Intl.DateTimeFormat` with `Europe/Stockholm`, so it follows CET/CEST rather
than subtracting a fixed number of hours, and it adjusts `due_date` when an
early-morning meeting crosses into the previous UTC date. A local clock time
skipped by the spring DST transition is rejected instead of silently moved.

Three regression tests cover the observed summer case (`16:10` → `14:10`), the
winter offset (`16:10` → `15:10`), and a midnight rollover (`00:30` on June 2 →
`22:30` on June 1). Verification after the change:

- `npm test` — **210/210 pass** across twelve files for the pushed tree
  (the broader working tree currently has 218 tests across thirteen files).
- `npm run typecheck` — passes.
- `npm run build` — passes.
- ESLint on `service.ts` and `service.test.ts` — passes.
- `git diff --check` — passes.

The full-project lint command was stopped after it stalled without output; the
two files changed for this fix were linted directly. No live post-fix booking
was created because that would add another real Pipedrive activity.

### Open item

The IT-technician selection remains separate from this timezone fix. It is not
currently assigned to the Pipedrive activity and needs its own product decision
about activity ownership or participation.

## 2026-08-19 — Required fields marked, meeting detail unblocked, native date and time pickers replaced; 207 tests pass

Four commits on `feat/organization-identity`, all pushed. The starting point
was a screenshot of the meeting step's error box: a seller had submitted an
empty step and got back a list reading `agenda: Agenda krävs`. Two separate
faults sat behind that one screenshot — the errors were presented as jargon,
and three of the fields they named should never have blocked the step at all.
The fourth commit (cbc2308) is documentation only: it records the open
questions about meeting ownership and customer invitations in
`docs/INTENTIONS.md`.

### Verified baseline

- `npm test` — **207/207 pass** across twelve files (was 181 across ten).
- `npm run typecheck`, `npm run lint`, `npm run build` — all pass. Re-run
  2026-08-21 against the same commits: all four still pass.
- Branch `feat/organization-identity` is level with its remote; CI runs the
  same four checks on every pull request.
- **These four commits sit on PR #3, which is still open and no longer
  matches its title.** It was raised on 08-17 as "Store organization identity
  in Pipedrive and search by it" — one commit. It now carries seven commits,
  29 files and +2144 lines, most of it validation and UI work unrelated to
  organization identity. A reviewer opening it expects the identity change
  and finds a form overhaul. Either split the 08-19 commits onto their own
  branch off `main`, or retitle #3 to describe what it actually contains
  before asking anyone to review it.

### 1. Validation errors are read, not decoded (71712b3)

`formatZodErrors` prefixed every line with the failing field's path, so the
seller read `agenda: Agenda krävs` — the field named twice, once in the
schema's own Swedish and once as a JSON key. Every schema message already
names its field, so the prefix carried nothing. It is gone, and identical
messages are now deduplicated: two fields failing the same way produced two
identical lines, which also collided as React keys.

### 2. A booking is no longer blocked on detail that can follow (5ba927f)

Mötestyp, agenda, technician notes and location were all `requiredText`, yet
nothing downstream depends on any of them. The first three are concatenated
into the activity note, which `buildMeetingActivityPayload` already filters
empties out of; the location maps to an activity field Pipedrive accepts
empty. The step rejected bookings the service layer would have handled.

All four are now `optionalText`. The payload builder was tightened to match:
a blank note and location are omitted rather than written as empty strings,
and a missing meeting type falls back to a plain `Möte` subject instead of
the `Möte: ` it used to stamp on the activity.

One English message was hiding in the same area. `requiredRecordId` is a
`z.union`, and a *missing* value — as opposed to a blank one — fell through
to Zod's own `Invalid input`. With the field path dropped in (1), that line
would have been unattributable. An `errorMap` keeps it on the Swedish
message naming the field.

### 3. Required fields are visible before submitting (795faeb)

Nothing distinguished a blocking field from an optional one until the seller
submitted and read the error list. Every field whose schema rejects a blank
value now carries an asterisk via `FieldLabel`, explained by a legend under
the step description — across all four steps and the supplier editor, whose
`Uppsägningsadress (krävs)` label lost its hand-written suffix to the mark. Required-ness still lives in the schemas; the mark only
mirrors it. Fields that always hold a usable value — a number defaulting to
0, a select with a default — stay unmarked, because an asterisk that never
blocks anything teaches the seller to ignore the ones that do. The asterisk
is `aria-hidden`; `aria-required` on the control carries the meaning without
being read out as punctuation.

### 4. The date and time controls are the product's, not the browser's

`<input type="date">` and `<input type="time">` render in each browser's own
chrome — a different shape, font and date order per browser and OS locale.
Both are now project components in the same commit as (3).

- `calendar.ts` holds the logic: Monday-first month grids, Swedish month and
  weekday names, `ons 19 aug 2026` display, and a lenient time parser. It is
  string-based and local-time throughout. `Date.toISOString()` is deliberately
  never used — in Swedish summer time it turns midnight on the 19th into the
  18th, which would silently move a booking a day.
- `DateField.tsx` renders a trigger built to the text inputs' exact metrics,
  so a picker beside a text field in the same row lines up to the pixel. The
  popover keeps six rows in every month so the form below does not jump. Arrow
  keys move by day, PageUp/PageDown by month (clamped to the shorter month's
  last day), Enter picks, Escape closes and returns focus to the trigger.
- `TimeField.tsx` keeps typing as the fast path: `9`, `930`, `9.30` and `9:5`
  all normalise to `HH:MM` on blur, never mid-keystroke. The clock button
  opens a quarter-hour list scrolled to the chosen time, or to now.
- `usePopover.ts` closes either popover on an outside click or Escape and
  returns focus to the control that opened it.

Stored values are unchanged — `YYYY-MM-DD` and `HH:MM` — so the schemas and
Pipedrive payloads were untouched by this. 19 new tests cover the grid edges,
month wrapping, impossible dates like `2026-02-30`, the time parser, and the
closed state each field server-renders.

Verification was static: the compiled CSS was served against the exact markup
the components emit and screenshotted. The live wizard sits behind the login,
so the popovers have not been clicked through in the running app.

### Open items

Those listed under 08-17 stand. Added by this work:

1. **A date can no longer be typed.** The date trigger is a button; only the
   time field accepts typed entry. If sellers enter dates from a list at
   speed, the trigger needs the same typed path the time field has.
2. **The pickers are unverified in the running app.** Their keyboard and
   focus behaviour is interaction code that no test exercises, since the
   project tests in `node` without a DOM.
3. **Marked and enforced can drift.** `FieldLabel`'s `required` prop is set
   by hand at each call site against what the schema does. Nothing fails when
   the two disagree.
4. **One required field cannot be marked.** The meeting step's organization
   name is required only once another organization field is filled in, so a
   permanent asterisk would be a lie and no asterisk leaves the rule
   invisible. It still surfaces only as an error on submit — the same
   complaint that started this work, in the one place the asterisk cannot
   answer.
5. **PR #3 needs splitting or retitling** before review, as above.

## 2026-08-17 — S01 closed, CI added, organization identity persisted; 181 tests pass

Three pieces of work, each on its own branch and PR rather than direct commits
to `main`. Two are merged; the third is open. This entry supersedes the
08-14 statement that organisationsnummer is not written to Pipedrive.

The work came out of an adversarial review loop: a second reviewer audited the
pushed tree, this side verified each claim by executing it, and disagreements
were settled by running code rather than by argument. That is worth keeping —
it caught defects on both sides, including two this side introduced.

### Verified baseline

- `npm test` — **181/181 pass** across ten files (was 150 across eight).
- `npm run typecheck`, `npm run lint`, `npm run build` — all pass.
- CI runs all four on every pull request and on `main`; green on the current
  branch head.

### 1. S01: a meeting can be booked with no organization (PR #1, merged)

The wizard always sends an organization object with every field initialized to
`""`. `organizationSchema.partial().optional()` makes the keys optional but
still ran `requiredText` on a `name` that was present and blank, so the only
organization shape the UI ever produces failed validation. S01 — booking from
contact details alone — was unreachable in the actual form.

The service layer already agreed a blank organization means none:
`resolveMeetingParties` trims the name and creates nothing. Only the schema
disagreed, and it rejected before that code could run.

The meeting organization now resolves to one of three outcomes: nothing entered
drops to `undefined`, details with a name are kept, and details without a name
are rejected. A selected organization is exempt from the name requirement, and
its output never carries `name: ""` — the meeting route's
`organization?.name ?? person.name` would otherwise resolve to an empty string,
since `??` does not fall back on `""`.

That `??` hazard appeared three times in one change: once in the original fix,
once from the opposite direction when a valid field with a missing name took
the blank path, and once more through the selected-organization carve-out.
Normalizing at the schema boundary is what retired it; handling it correctly at
each call site did not.

**Why the tests missed it:** the S01 fixture omitted `organization` entirely — a
shape the wizard never sends. It encoded the schema's promise instead of the
UI's behavior. The four wizard initial states now live in
`src/components/sales-wizard/initialState.ts` so tests import the values the UI
actually submits rather than a copy that can drift.

### 2. CI on every pull request (PR #2, merged)

`.github/workflows/ci.yml` runs `test`, `typecheck`, `lint` and `build` in one
sequential job on pull requests into `main` and on pushes to `main`. Each is a
named step so a failure identifies the layer that broke, and `if: always()`
lets one push report every failure at once.

Two events from the S01 work argued for this. A regression passed a green local
suite because the guarding test was too narrow. Separately, an implementation
using `z.preprocess` passed every test while breaking the components — vitest
is configured Node-only, so `typecheck` was the only check that could see it.

No secrets are configured and none are needed: every entry in the env schema is
optional or defaulted. Verified by running all four scripts against a copy of
the tree with no `.env` file present. Keep it that way — CI must never need
production Pipedrive credentials.

Still to do: make the check **required** in branch protection. Until then it
reports red without blocking a merge.

### 3. Organization identity reaches Pipedrive (PR #3, open)

Organisationsnummer, website and city were collected, validated as mandatory on
the deal form, normalized and carried between steps — then dropped.
`createOrganization` was only ever called with `{ name, address }`. S03's
expected result, "organisationsnummer sparas", did not happen, and the identity
the scenarios lean on hardest for deduplication was neither stored nor
searchable.

`GET /organizationFields` on the live account settled where each value belongs:

- **Org. Nummer** is a custom field; there is no native Pipedrive equivalent.
- **Webbplats** is *also* custom, and is the one the account uses — all 100
  organizations populate it and none uses the native `website`. Writing to the
  native field would have stored the value where nobody looks, and no test
  would have caught it.
- **City** has no editable field; `address_locality` is read-only and derived,
  so the city is folded into the address Pipedrive parses itself.

All three creation paths — deal, meeting, Mediacleaning — now build their
payload through one function, so identity cannot be stored by one workflow and
dropped by another. Organization search requests `custom_fields`, which is what
makes an org number findable: the previous `name,address` query returns zero
hits for one, verified live.

The two keys are optional, unlike the deal keys that block deal creation. An
account that has not mapped them keeps working and only duplicate detection
degrades, which beats refusing to book a meeting over an unconfigured field.

**Proven live:** a created organization stores the number, website and joined
address, and an established record is returned when searching for its org
number. The test organization was deleted afterwards.

### New constraint discovered: Pipedrive's search index lags writes

An organization created seconds earlier was **not** findable by its org number,
while an established one was. This is inherent to Pipedrive's search endpoint,
not to any change here, and it directly constrains the automatic
search-before-create work: a search cannot be relied on to find a record
created moments ago in the same session. The design has to tolerate that rather
than assume read-after-write.

### Corrections to the 2026-08-14 entry

- Organisationsnummer **is** now written to Pipedrive, into the custom
  `Org. Nummer` field. The 08-14 entry predates that.
- The seven "required custom deal fields" listed there as blocking were already
  removed from the required set; deal creation blocks only on Faktura Start,
  Fakturagrupp and Viktigast för kunden.
- Test count moved 150 → 181; file count eight → ten.

### Remaining code work, in agreed order

1. **Automatic search-before-create**, governed by confidence tiers rather than
   auto-selection: exact identity-number match may reuse an organization; exact
   email may reuse a person but must not infer its organization; fuzzy
   name/phone matches must be shown, never chosen; multiple matches force a
   seller decision; no strong match creates. Trading duplicate records for
   wrongly linked records would be a worse outcome, and S01 must keep working —
   a weak match cannot become a blocker. This is the next task, and the search
   index lag described above bears on it most directly: a record created earlier
   in the same session may not be found, so a miss cannot be read as proof that
   no such customer exists.
2. **Calendar invitations and technician identity.** Section 2.7 and S08 require
   invitations to customer, seller and IT technician. No email/iCal code exists,
   and `technicianId`/`technicianName` are validated then never reach the
   activity payload — the seller selects a technician and the selection
   disappears. This is the largest genuinely unbuilt subsystem.
3. **DealStep conflict parity with MeetingStep.** `findPersonConflicts` is used
   only in the meeting step; DealStep silently lets the CRM value win.
4. **Document retry semantics.** Upload succeeding and note failing, then a
   rerun, uploads a second file. The warning state should say so.
5. **History payload narrowing and real calendar-date validation.**
   `Date.parse` accepts `2026-02-31`.

## 2026-08-14 — Scenario hardening complete; 150 tests pass

This is the current baseline while the implementation is being reviewed and
pushed. Older dated entries below are retained as history; statements in them
such as "documents are still text drafts", "lookups are not selectable", or
"meeting creation does not resolve CRM records" are superseded by this entry.

The session started with no automated test framework and a scenario document
that had never been checked systematically against the application. It ends
with **150 passing tests across eight test files**, all four project checks
green, and the main S01–S27 failure-path defects covered by durable tests.

### Verified baseline

- `npm run typecheck` — passes.
- `npm run lint` — passes.
- `npm test -- --run` — **150/150 tests pass** across eight files.
- `npm run build` — passes; Next builds all 11 application routes.
- `git diff --check` — no whitespace errors; the existing Windows LF/CRLF
  warnings remain.
- The final audit verdict was **Pass with minor issues**. No dedicated safety
  follow-up is required before the next implementation phase.

The suite includes 14 route-level PDF tests. Their `200` assertions fail
against the pre-fix route ordering, so they permanently cover the regression
where a history failure turned an already-generated or already-uploaded
document into a retryable server error. Resolution tests cover partial CRM
creation and the retry IDs that prevent duplicate organizations and contacts.

### Eight concrete defects closed

1. **Personnummer validation and normalization.** The old regex rejected the
   eight-digit date form used by S04/S05/S16/S17. Both `YYYYMMDD-NNNN` and
   `YYMMDD-NNNN` are accepted and normalized to one ten-digit storage form.
2. **PDFs and notes are now wired to Pipedrive.** Mediacleaning and contract
   routes generate real PDFs, apply the deal-first/organization-second
   attachment rule, and call the file-upload and note APIs. The wiring is
   covered by mocks but has not yet succeeded against the live account.
3. **Meeting activities are no longer orphaned.** A meeting resolves or creates
   its contact first. It creates an organization only when organization details
   were supplied, preserving S01's contact-only flow while satisfying S03/S04.
4. **Malformed personnummer no longer pass after punctuation stripping.** The
   test case `1234567-89012` exposed a missing hyphen-position check.
5. **Partial CRM resolution preserves created IDs.** If an organization is
   created and person creation then fails, the organization ID travels with the
   error and is written back into wizard state for reuse on retry.
6. **History failures are non-fatal after successful CRM writes.** Meeting and
   deal creation use the shared `recordHistorySafely` helper, so a failed local
   log write does not invite a duplicate CRM submission.
7. **The same post-write hazard is closed in both PDF routes.** Once the PDF
   response has been prepared after attachment handling, even an unexpected
   rejection from `recordHistorySafely` returns the prepared file rather than a
   `500` response.
8. **The route safety boundary is tested independently of the safe helper.**
   The PDF routes recover the prepared response even if the supposedly safe
   history helper itself rejects; route correctness does not rely solely on
   that helper's implementation contract.

### Other scenario gaps closed in the same work

- **S06 contact conflicts:** typed phone/email values are compared with the
  selected Pipedrive contact using normalized phone forms. The seller chooses
  which value this form uses. Copy now states accurately that this does **not**
  update Pipedrive.
- **S12 pipeline fallback:** when no stage is selected, the deal resolves the
  chosen pipeline's own first stage instead of applying a stage from an
  unrelated global default.
- **S15 deal ownership:** the server verifies that a selected deal belongs to
  the selected organization before attaching customer documents.
- **S17 organization creation:** Mediacleaning can create the organization when
  explicitly requested, without creating a deal.
- **S19 suppliers:** the UI has a real supplier list plus `Annan leverantör`, so
  the not-in-list scenario is now meaningful.
- **Document outcomes:** generated documents with attachment trouble are logged
  as `warning`, not `error`. History says `Klar med varning` and shows the actual
  reason, including the distinct case where the file uploaded but the note
  failed.
- **Local privacy:** identity-number fields, including likely aliases and nested
  occurrences, are removed completely before history is persisted. The history
  UI does not consume them, so retaining even a masked suffix had no purpose.
- **Contract/PDF structure:** contract generation uses the template module and
  supports the explicitly selected combined contract + Mediacleaning PDF flow.

### Safety boundaries — precise wording

- **No deletion is implemented.** Existing CRM records are currently protected
  from broad relinking or mutation. The next phase may add narrowly controlled,
  explicit editing, but it must not add deletion or unrestricted record edits.
- `attachDocument` catches the expected target-resolution, upload, and note
  failures and reports them as warnings so the seller still receives the file.
- The strongest proven PDF invariant is: **history recording cannot change an
  already prepared document response into an error**. It is not correct to say
  that document delivery is independent of every downstream function: the
  response is prepared after `attachDocument`, so a new, unexpected rejection
  escaping that helper could still discard the generated PDF.
- Upload and note creation are separate and their outcomes are diagnosable.
  This is **not idempotency**. Nothing consumes `fileId` to resume after a
  note-only failure, so rerunning the step can upload a second copy.
- Meeting/deal retry protection currently reuses partial person/organization
  IDs returned to the wizard. General request idempotency has not been designed
  or implemented.

### Still blocked outside the codebase

These items cannot be closed by more local implementation alone:

1. **Deal creation still returns 403 with the current Pipedrive token.** The
   final live `createDeal` call remains unverified until deal-write permission
   is enabled.
2. **Seven required custom deal fields do not exist in the account:**
   `avtalslangd`, `avtalsStartdatum`, `manadskostnad`, `startavgift`,
   `bindningstid`, `uppsagningstid`, and `totaltAffarsvarde`. Their API keys
   cannot be mapped until the fields are created or the client approves the
   structured-note fallback described for S13.
3. **`uploadFile` has never succeeded against the live account.** Its code path
   is now reachable and covered with mocks, but the token's file-write access
   is unknown. Six scenarios depend on this call, making it the highest-value
   live check as soon as permissions are widened.
4. **Calendar invitations are still unbuilt/unverified.** Pipedrive scheduler
   configuration exists, but the complete invitation behavior required by the
   scenarios has not been demonstrated live.
5. **A real S26 end-to-end run has not been performed.** Contact → organization
   → meeting → deal → Mediacleaning → contract → combined PDF → Pipedrive
   attachment remains blocked by the account items above.
6. **Client content approval remains required** for the final Mediacleaning and
   legal document wording/templates even though the generation and attachment
   architecture is now in place.

### Remaining code work, in agreed order

1. **Controlled CRM editing:** explicit keep/replace/add choices for allowlisted
   fields. Preserve correction-friendly UX while forbidding deletion and broad
   destructive edits.
2. **Enforced search-before-create:** require a completed search and an explicit
   `none of these` decision before creation; reset that decision when identifying
   details change.
3. **S13 commercial-terms note:** when the real Pipedrive fields are unavailable,
   write the canonical structured commercial terms to a deal note rather than
   silently dropping them.
4. **Idempotency design:** decide key generation, storage, replay semantics, and
   behavior after partial upload/note success before implementing it.

### What has and has not been proven

The automated suite proves the local schemas, normalization, party resolution,
ownership checks, PDF structure, attachment routing, history redaction, warning
semantics, and route failure boundaries represented in its mocks. It does not
prove Pipedrive permissions, live payload compatibility for file upload/deal
creation, scheduler invitation behavior, or the full S26 workflow. Those must
remain labelled **unverified**, not inferred from green mocked tests.

## 2026-08-13 — Everything is on `origin/main` (history was rewritten)

Roughly 2,600 lines had been sitting uncommitted: the auth gate, run history,
Pipedrive record linking, the reference dropdowns, and the brand assets. All of
it is now pushed. Nothing in the working tree is unversioned any more.

It landed first as a single 48-file commit, which was then rewritten into eight
scoped commits:

| Commit | Files | Scope |
| --- | --- | --- |
| `5afdef0` | 3 | Boot-time environment validation |
| `a84b567` | 7 | Shared-password auth gate |
| `8f4beda` | 5 | File-backed run history |
| `040b397` | 7 | Pipedrive hardening + deal record linking |
| `279ad8d` | 10 | Selectable lookups, ID fields → dropdowns |
| `b147cce` | 3 | Document steps emit a real file |
| `60de293` | 11 | Brand assets, fonts, login/sidebar styling |
| `9eeb89d` | 2 | Documentation |

### Two things to know about that history

- **The range is not bisectable.** Those eight commits are one working state
  carved into eight pieces, not eight commits authored in sequence. They are
  ordered so dependencies mostly come first (env → auth → history → Pipedrive →
  wizard), but only the tip is verified to typecheck, lint and build. `git
  bisect` across `6a9de83..9eeb89d` will give misleading results.
- **It was a force-push.** The original 48-file commit (`9710c40`) no longer
  exists on GitHub. Any clone made between the two pushes needs
  `git fetch && git reset --hard origin/main`; it cannot fast-forward.

### Line endings are unsettled

Git reports LF → CRLF conversion on ~40 files on every add. Harmless while the
repo is only touched from Windows, but the first commit from macOS or Linux will
produce whole-file diffs that hide the real change. A `.gitattributes` with
`* text=auto eol=lf` would settle it. Not added yet — it rewrites line endings
across the tree and deserves its own commit.

## 2026-08-13 — Visual identity: brand palette, Satoshi, real logo assets

The app was styled with placeholder defaults — a teal accent (`#0f766e`), a
near-black `#111827` sidebar, and Inter — none of which came from the brand. It
now derives from the brand navy `#162944`, sets Satoshi throughout, and uses the
actual wordmark instead of the words "Digital Kontakt" typed as text.

Presentation only. No workflow, validation, or Pipedrive behaviour changed.

### Design tokens

- `src/app/globals.css` — rewritten as a token system rooted at `#162944`. The
  **neutral ramp is tinted toward the brand hue** rather than being pure grey, so
  backgrounds, borders and muted text read as one family instead of a navy
  accent dropped onto a generic grey UI.
- The interactive blue `--accent: #2176de` is the *same hue* as the brand lifted
  to a legible level (hsl 213°), not an unrelated blue.
- Semantic colours (success/danger/warning) kept their meanings; only their
  tints were rebalanced against the new background.

### Typography

Satoshi for both headings and body, per the brand decision. Headings run at
weight **900 with `-0.035em` tracking**, which is what echoes the logo's heavy,
tightly-set lowercase — the wordmark's character comes from weight and tracking
more than from letterform quirks.

- `src/fonts/satoshi-{400,500,700,900}.woff2` — self-hosted (~100KB total),
  under `src/` deliberately so they are not also served raw from `public/`.
- `src/app/layout.tsx` — loaded via `next/font/local`, which fingerprints,
  preloads and derives a metric-matched fallback family.
- **Gotcha worth remembering:** `--font-sans` was first written as the literal
  family name `Satoshi`. That *appeared* to work — CSS family names are
  case-insensitive and `next/font` happened to generate `satoshi` — but it
  bypassed the generated `satoshi Fallback` family, losing the anti-layout-shift
  benefit that is the whole reason to use `next/font`. It now reads
  `var(--font-satoshi, …)`. If the font stack is ever edited, keep the variable.

### Logo assets, generated from the source file

`public/digital-kontakt-logga-vit.png` is **3172×940 with the wordmark occupying
only 3001×512** — roughly a third of the height is transparent padding. Used
directly it sits with a large dead gap above it and cannot be aligned to
anything. Derivatives were generated with `sharp` by measuring the alpha
bounding box:

- `public/brand/wordmark-white.png` — trimmed to exact bounds; sidebar + login.
- `public/brand/wordmark-navy.png` — same silhouette in `#162944`, for light
  surfaces; used on `/historik`, which renders outside the app shell and
  previously carried no brand at all.
- `src/app/icon.png` / `apple-icon.png` — favicon built from the logo's own `d`
  glyph on a rounded navy plate. The glyph boundary is `x 85..325`; the `d` and
  `i` are kerned tight enough that scanning for an empty column runs straight
  through into the `i`, so the cut point was found from the column coverage
  profile (`x=326` starts the next glyph's chamfer) rather than by gap detection.

If the logo is ever replaced, these four files must be regenerated — they are
derived artefacts, not independent originals.

### Auth gate: brand assets opened up

`src/proxy.ts` — the matcher excluded `_next/static`, `_next/image` and
`favicon.ico`, but **not** Next's generated `/icon.png` and `/apple-icon.png`
routes. Since the gate is deny-by-default, the favicon 307'd to the login HTML
for anyone without a session, so the tab icon silently failed on the login page
— the one page guaranteed to be seen logged-out. `icon.png`, `apple-icon.png`
and `brand/` are now public.

The gate is otherwise unchanged and was re-verified: `/` still 307s, `/api/*`
still 401s.

### Markup changes

Kept minimal — nearly all of this is CSS against the existing class names.

- `SalesWizard.tsx` / `LoginForm.tsx` — the text brand (`<strong>Digital
  Kontakt</strong>` + `<span>Sales Portal</span>`) replaced by the wordmark
  image. **"Sales Portal" was dropped entirely** at the client's request; the
  wordmark alone carries the brand on both screens.
- Login moved to a navy shell with the white wordmark above the card. Its
  intro line is full-strength ink at 16px — it functions as the card's heading,
  so muted 14px grey was wrong.
- `historik/page.tsx` — navy wordmark linking back to the wizard.
- The max-width constraint on `.main` is applied to the grid item itself rather
  than via a wrapper `<div>`, so no extra element was introduced.

### Verified

`typecheck`, `lint` and `build` pass. Font loading, the compiled CSS custom
properties, and asset routes were checked against a running dev server
(`/icon.png`, `/apple-icon.png`, `/brand/*` → 200; `/` → 307; `/api/history` →
401). Dead CSS from the removed tagline and login-brand elements was swept.

**Not machine-verified visually** — no browser automation was available in the
session, so layout was confirmed structurally and then eyeballed by the client,
who signed off on the login page, sidebar and logo sizing. The 980px and 560px
breakpoints were updated but, as with the 2026-08-04 entry, **still have not
been QA'd on a real device**.

### Note on the vendored font

Satoshi is licensed under the ITF Free Font License, which permits commercial
use and self-hosting. The `.woff2` files are committed to the repo.

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
