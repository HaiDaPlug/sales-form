# Prospekt overhaul — analysis of the technician's change document

Written 2026-09-09 against branch `feat/organization-identity` (HEAD `dec4c5f`,
plus the uncommitted supplier-list work in `SupplierEditor.tsx` / `suppliers.ts`).

Purpose: map every requirement in the client document onto the current code,
verify what Pipedrive's API can and cannot do, and isolate the places where the
document contradicts itself, contradicts the account, or leaves a judgement call
that the owner has to make. Decisions are numbered **D1–D16** so they can be
answered by number. Everything not listed under a decision is treated as
straightforward and will be built as written.

---

## 1. Verified facts the plan rests on

### Pipedrive API (checked against developers.pipedrive.com, 2026-09-09)

| Fact | Status | Consequence |
| --- | --- | --- |
| "Prospekt" maps to a Pipedrive **Lead**. `POST /v1/leads` needs `title` and at least one of `person_id` / `organization_id`; both may be given. `owner_id` must be a Pipedrive user. | Verified | A lead can be linked to both the organization and the contact, as the document asks. |
| Leads have **no custom fields of their own — they inherit the deal custom fields**, and values set on a lead carry over when it is converted. | Verified | Faktura start, Fakturagrupp, Viktigast för kunden and **Affärens säljare** can all be written on the prospect with the keys already in `.env`. Must be confirmed live that an enum option id (72–75) is accepted on `POST /leads` the way it is on deals. |
| `POST /v1/files` accepts `lead_id` (UUID). `POST /v1/notes` accepts `lead_id`. Activities accept `lead_id`. | Verified | Audio file, PDF and internal comment can all be attached to the prospect. |
| File size limit for `/files`: not documented; community answer says 50 MB per file. | Unofficial | Audio uploads need a cap and a test against the live account. |
| `GET /v2/leads/search` supports `term`, `person_id`, `organization_id`, `fields` incl. `custom_fields`. | Verified | "Koppla befintligt prospekt" lookup is possible with the same LookupBox pattern. |
| Lead labels: full CRUD via `/v1/leadLabels` (name + colour). | Verified | Statuses could be labels — see D3. |
| **Lead → deal conversion exists in the API** (`POST /v2/leads/{id}/convert/deal`, status via `/convert/status/{id}`; status values `not_started, running, completed, failed, rejected`, deal id present only when completed). | Verified | The portal must **not** call it (document, Sida 1 and 5). It also means the backend has to be built without the capability, not just without a button. |
| A converted lead disappears from `GET /v1/leads` ("not archived leads" only). Whether the resulting deal carries an `origin_id` pointing back at the lead is **not documented** on the v1 page. | Unverified | The portal needs its own way to find the deal a prospect became — see D7. |
| **Smart Docs has no public API** — no endpoint to create a document from a template, send it for signature, list documents or read signing status (developer community, unanswered since 2024). | Verified (absence) | The portal cannot observe "avtal signerat" if signing happens through Smart Docs — see D4. |
| **Meeting Scheduler has no public API** for availability or slots. | Verified (absence) | "Tillgängliga tider" must be computed by the portal from existing activities — see D9. |
| `GET /v1/activities` with `user_id=0`, `start_date`, `end_date` returns every user's activities (already verified live in `current_state.md`, 2026-08-27). | Verified live | Free-slot computation can reuse `findMeetingOverlaps`' data path. |

### The client's account (from `current_state.md`)

- The four sellers (Filippa, Robin, Adam Westin, Tobias Ek) are **options 72–75 on
  the custom deal field "Affärens säljare"**. They have no Pipedrive login. Pipedrive
  users are two service accounts, one deactivated user and Roble.
- The account has **zero custom activity fields**; a meeting's seller lives on the
  first line of the activity note.
- Organization custom fields: "Org. Nummer" and "Webbplats".
- The API token cannot delete deals (403).

### The portal today

- Login = shared password + a free-text name. Identity is a display string
  (`session.subject`); nothing binds it to a seller option id.
- Four steps: Mötesbokning, Skapa affär, Mediacleaning, Avtalsgenerering.
  `POST /api/pipedrive/deals` creates deals; document steps attach to deal first,
  else organization.
- History (`.data/history.jsonl`, `/historik`) is shared across everyone.
- Contract and Mediacleaning PDFs are drafts with unapproved legal wording, marked
  `UTKAST`.

---

## 2. Target model

**Prospekt = Pipedrive Lead.** Title `"<Organisationsnamn> Prospekt"`, derived and
read-only. Linked to `organization_id` and `person_id`. Custom fields written on the
lead: Faktura/avtal start → Faktura Start key, Fakturagrupp, Viktigast för kunden,
Affärens säljare (option id from the session). `value` = form value + currency.
No pipeline, no stage — those are chosen by the QC employee at conversion.

**Seller identity** comes from the session, never from the request body. The
session must carry `{ subject, sellerOptionId, sellerName }`. Every server route
that writes a seller reads it from the session; the schemas' `sellerId` /
`sellerName` inputs are removed from the client contract.

**Underlag status** (D3) is a value on the prospect, written by the portal:
`Ljudfil uppladdad`, `Väntar på signering` (and possibly `Digital signering krävs`),
`Avtal signerat`. It is never "godkänd". QC result and conversion are read from
Pipedrive, never written.

**Hard rules after the change** (replace the README's):

1. No route creates a deal. `createDeal` and `POST /api/pipedrive/deals` are
   deleted, not disabled. `deals/search` and `GET /deals/{id}` stay for
   Mediacleaning's "befintlig affär".
2. No route calls a lead conversion endpoint or updates a lead's owner.
3. Underlag status may only move forward by portal actions that actually
   happened (file upload completed, contract generated). "Avtal signerat" and
   any QC result are read-only from the portal's side unless D4 chooses an
   e-sign provider with webhooks.
4. Existing persons and organizations stay read-only (unchanged).
5. Every read on the status page is filtered server-side by the session's
   seller option id against the **current** "Affärens säljare" value in Pipedrive.

---

## 3. Page-by-page mapping

Legend: ✅ straightforward · ⚠️ needs a decision (see §4) · ❌ not possible as written

### Sida 1 — Skapa prospekt

| Requirement | Today | Change | |
| --- | --- | --- | --- |
| Title auto = org name + "Prospekt", updates on org select/type | `deal.title` free text, prefilled `"<org> - Digital Kontakt"` | Derived value, shown read-only; no schema field | ✅ |
| Step/button renamed "Skapa prospekt"; submit creates a lead linked to org + person | `POST /api/pipedrive/deals` → `createDeal` | New `POST /api/pipedrive/prospects` → `createLead`; delete deal creation entirely | ✅ |
| Seller name + user id from login, travels with the prospect | Seller dropdown, option id in body | Session-bound seller (D1); written to Affärens säljare on the lead | ⚠️ D1, D2 |
| Remove "Privatperson…" checkbox; keep one Organisationsnummer field accepting both formats | Checkbox toggles label; `normalizeIdentityNumber` already accepts both | Remove `customerType` from UI and schema; label stays "Organisationsnummer" with hint "eller personnummer" | ✅ |
| Rename Faktura start → Faktura/avtal start; drop Avtalsstart; one date for both | Two date fields; only Faktura start reaches Pipedrive | One field; written to Faktura Start key; carried to the contract PDF as start date | ✅ |
| Remove Uppsägningstid månader | Optional number, not sent to Pipedrive | Remove field + schema key | ✅ |
| Audio upload as QC basis, attached to customer and prospect, visible to QC employee | Nothing | Multipart upload endpoint → `POST /files` with `lead_id` (+ `org_id`); note on the lead; status "Ljudfil uppladdad" only after the upload response | ⚠️ D8 |
| Audio instead of signing; approval/conversion only after QC in Pipedrive | n/a | Portal never approves or converts; status shows underlag only | ✅ (by omission) |
| No audio → create prospect and send contract for digital signing; status "Väntar på signering" until signed; signing must not convert | Contract step generates a draft PDF; no signing | Status set when the contract is generated/sent; the **transition to "Avtal signerat" cannot be automated with Smart Docs** | ⚠️ D4, D5 |
| Portal shows underlag status separate from QC result | n/a | Status page (Sida 5) | ⚠️ D3, D6 |
| Backend must not create deals / approve / convert even on direct calls | Deal route exists | Delete the route and service function; no conversion endpoint is ever added | ✅ |
| Not mentioned: Pipeline, Steg, Värde, Valuta, Avtalslängd, Månadskostnad, Startavgift, Totalt affärsvärde, Bindningstid | All present | Pipeline/Steg removed (leads have none); Värde/Valuta → lead value; the rest stay as form data feeding the contract | ⚠️ D16 |

### Sida 2 — Mötesbokning

| Requirement | Today | Change | |
| --- | --- | --- | --- |
| Remove Säljare dropdown; identity from login; not editable; "Inloggad som: …" | Dropdown, name written to activity note | Session seller; note line stays (no activity field exists) | ⚠️ D1 |
| Webbadress shown and mandatory when a new org is registered during booking | `website` exists but hidden in this step; optional | Show when org has no id and a name is typed; required in that case only | ✅ |
| Remove IT-tekniker dropdown and external name field; booking works without | Both present; activity owner = token user | Remove both; owner per D10 | ⚠️ D10 |
| Mötestyp editable text, default "IT-genomgång" | Already so | Keep | ✅ |
| Pick a date → fetch available times; buttons/list; only available selectable; re-check on submit | Free time input; overlap check warns with "boka ändå" | New `GET /api/pipedrive/activities/free-slots?date=&duration=`; slot picker; hard reject on submit if the slot is now taken | ⚠️ D9 |
| Loading / empty / error / "taken meanwhile" messages, Swedish texts as given | Overlap dialog | Implement the four states with the exact copy | ✅ |
| Remove Anteckningar till IT-tekniker; keep Intern kommentar | Both present | Remove `technicianNotes` | ✅ |
| Button "Boka möte"; clear confirmation | "Validera och skicka" shared by all steps | Per-step button label; confirmation card with date, time, contact | ✅ |
| Past dates not selectable; required marks; inline field errors | Required marks exist; errors listed at bottom | Add `min` on DateField; map Zod paths to fields | ✅ |
| Not mentioned: Pipedrive Scheduler section, Längd minuter, Plats/länk, Agenda | Present | Keep unless told otherwise; duration is needed for slot generation | ⚠️ D10 |

### Sida 3 — Mediacleaning

| Requirement | Today | Change | |
| --- | --- | --- | --- |
| Keep "Koppla befintlig organisation"; add "Koppla befintligt prospekt"; org and prospect are separate records | Org lookup + deal lookup | Add lead lookup via `/v2/leads/search` (new v2 base URL in the client) | ✅ |
| "Koppla befintlig affär" → "Koppla befintligt prospekt eller befintlig affär"; new sales link to prospects; existing deals selectable; never creates/converts | Deal lookup | One combined lookup with two result groups, or two lookups; `leadId` added to schema | ✅ |
| Auto-fill Företagsnamn, Organisationsnummer, Adress, Ort from Pipedrive on select | Name + address filled only if blank | New `GET /api/pipedrive/organizations/{id}` returning name, org number (custom key), address, `address_locality`; overwrite fields on select | ✅ |
| Fetch the record's contact persons; seller picks one; chosen name = firmatecknare; no document before a contact is chosen | Signer only in the contract step, typed | `GET /organizations/{id}/persons`; `signerPersonId` + `signerName` on Mediacleaning; required when a CRM record is linked | ⚠️ D11 |
| Each supplier carries company name, org number, address; used automatically in the cancellation letter | List has name + notice address (uncommitted work) | Add `organizationNumber` per supplier; print it on the letter | ⚠️ D13 |
| Add a new supplier (name, org number, address, e-mail) with "Spara"; then selectable like the others | "Annan leverantör" typed per document, not saved | Server-side supplier store (`.data/suppliers.json`, same pattern as history) + `POST /api/suppliers` | ⚠️ D13 |
| Remove kundnummer; org number identifies the customer, travels in the document | `customerNumber` per supplier, printed on the letter | Remove field; the customer block already prints the org number | ✅ |
| Intern kommentar saved as a note on the linked prospect or deal; org if only org; never creates a deal; saved on send/save | Note goes to deal else org | Note target order: lead → deal → org | ✅ |
| "Dokumentet ska skickas med smart doc under Organisation (INTE PROSPEKT)" | PDF uploaded to deal else org | PDF uploaded to the **organization** even when a prospect/deal is linked; Smart Docs send is a manual step in Pipedrive | ⚠️ D5, D12 |

### Sida 4 — Avtal

| Requirement | Today | Change | |
| --- | --- | --- | --- |
| Remove Säljare dropdown and Säljare namn; from login | Both present, name printed on the PDF | Session seller; name printed from session | ⚠️ D1 |
| Contract linked to the right prospect and customer; generation and signing without a deal | Org + deal lookup | Add prospect lookup; note → lead; status "Väntar på signering" on the lead | ✅ |
| Seller cannot create a contract in another seller's name | Free text | Removed by construction | ✅ |
| Signed contract available for QC in Pipedrive; signing must not convert | n/a | Depends on signing mechanism | ⚠️ D4, D5 |
| "Dokumentet ska skickas med smart doc under Organisation (INTE PROSPEKT)" | Upload to deal else org | Upload to organization | ⚠️ D5, D12 |
| Implicit: the PDF is now sent to customers for signature, but its wording is an unapproved `UTKAST` | Draft marker on every page | Final wording is still owed by the client before this can go live | ⚠️ D5 |

### Sida 5 — Status

| Requirement | Today | Change | |
| --- | --- | --- | --- |
| Seller sees only own activity and the customers, prospects, deals currently assigned to their account; enforced in backend | `/historik` shows everyone | New `/status` page + `GET /api/status`; server filters by session seller id; `/historik` filtered the same way or folded in | ⚠️ D1, D14 |
| Per prospect: waiting for signing / QC, approved and converted; from Pipedrive | n/a | Underlag status from the lead's field/label; conversion = lead gone + deal found | ⚠️ D3, D6, D7 |
| Registration date; if converted, conversion date and a reference to the deal | n/a | `add_time` of the lead; `add_time` of the deal + link to the Pipedrive deal | ✅ once D7 is settled |
| Follow-up only; no approve/convert from the page | n/a | Read-only page | ✅ |
| Assignment driven by a Pipedrive field for ansvarig säljare, unambiguously mapped to the portal account; admin can change it per record and in bulk; seller cannot | "Affärens säljare" exists on deals (and so on leads); not on organizations or persons | Session ↔ option id map (D1); organizations derived or given their own field (D14) | ⚠️ D1, D14 |
| After reassignment the new seller sees the records, the old one does not; read on every load | n/a | No caching of assignment beyond a request | ✅ |
| Original creator, registration date and history preserved; original vs current seller are separate; reassignment does not approve/convert | History has `createdBy` (display name) | Portal registry keeps creator + timestamps; optionally a second Pipedrive field | ⚠️ D15 |

---

## 4. Contradictions and decisions

Recommendation first in each list.

**D1 — Seller identity.** The document wants the seller's *user id* from the login,
and Sida 5 wants a Pipedrive field whose value maps unambiguously to the logged-in
account. The sellers are not Pipedrive users; they are options on "Affärens
säljare". So "user id" has to mean the portal's own account bound to an option id.
(a) **Per-seller portal accounts** (username, password, display name, seller option
id — held in an env/JSON config, validated at login against the live options) —
no Pipedrive seats needed, fits the existing `verifyCredentials`/`getSessionSubject`
seam. (b) Buy Pipedrive seats for the four sellers so `owner_id` can be the
assignment field instead of the custom field. (c) Keep the shared password — fails
the document. Recommend (a).

**D2 — Lead owner.** `owner_id` must be a Pipedrive user. (a) **A configured user
via env** (`PIPEDRIVE_LEAD_OWNER_USER_ID`, e.g. the QC employee, so new prospects
land in their Leads Inbox). (b) The API token's user (default when omitted).
(c) The seller — only possible under D1(b).

**D3 — Where the underlag status lives in Pipedrive.** (a) **A custom enum field
"Underlag" on deals** (an admin creates it; leads inherit it; the value survives
conversion so the status page can still show it on the deal; bulk-editable). (b)
Lead labels ("Ljudfil uppladdad" etc.) — very visible as coloured chips in the
Leads Inbox, but labels do not follow the lead into the deal. (c) Both. Also
confirm the state set: the document names *Ljudfil uppladdad*, *Digital signering
krävs*, *Väntar på signering*, *Avtal signerat*. Are "Digital signering krävs" and
"Väntar på signering" two states (no audio & contract not yet sent → contract sent)
or one?

**D4 — Signing mechanism, the biggest contradiction.** The document says the
prospect "ska ha statusen Väntar på signering **tills avtalet har signerats**" and
that a signed contract becomes available for QC in Pipedrive, while documents are
to be sent "med smart doc under Organisation". Smart Docs has no public API, so
the portal can never learn that a Smart Doc was signed. (a) **Accept a manual
step:** the seller/QC employee sets "Avtal signerat" in Pipedrive when the Smart
Doc comes back signed; the portal reads it. (b) Use an e-sign provider with an
API and webhooks (Scrive, Oneflow, DocuSign…) so the portal sends the PDF and
flips the status itself; Smart Docs is then not used. (c) Poll the Files list of
the organization for a new signed PDF as a heuristic — fragile, not recommended.

**D5 — What is actually signed.** (a) The portal's generated contract PDF is
uploaded to the organization and a human sends *that file* for signature through
Smart Docs. (b) The contract is a Smart Docs template filled from Pipedrive fields,
and the portal's PDF is only an internal summary. This decides whether the
`UTKAST` marker and unapproved wording must be finalised now (a) or can stay (b).
Either way the client still owes the final legal wording before anything is sent to
customers.

**D6 — What "godkänd" means and what rejection looks like.** The document never
describes a failed QC. (a) **Conversion to deal is the approval signal**; the
status page shows "Godkänd och konverterad" when the lead has become a deal, and
"Väntar på kvalitetskontroll" before that. (b) A separate custom enum
"Kvalitetskontroll" (Ej granskad / Godkänd / Underkänd) that the employee sets
before converting, so "godkänd, ännu ej konverterad" and "underkänd" are visible.
In both cases: what should a rejected prospect look like — archived lead, a
value on the same field, or a label — and should the seller see it?

**D7 — Finding the deal a prospect became.** A converted lead vanishes from
`GET /leads`. (a) **A custom text field "Portal-referens"** on deals (inherited by
leads) holding the portal's prospect id; after conversion the deal is found by
searching custom fields for that id. (b) Match by organization id + title
"<Org> Prospekt" (title carries over, but can be edited). (c) Check live whether
v2 deals expose `origin_id` = lead id; use it if so. Recommend (a), with (c) as a
cheap live check first.

**D8 — Audio.** (a) May a prospect have **both** an audio file and a contract for
signing? Recommend yes; status shows both. (b) Upload happens inside "Skapa
prospekt" (lead first, then file; if the file fails the lead is kept and only the
upload is retried) — recommended — and/or later from the status page. (c) Where
is the app hosted? Vercel caps request bodies at 4.5 MB, which rules out audio
through the Next.js route; self-hosted Node has no such cap. (d) Accepted formats
and cap: recommend mp3/m4a/wav/ogg, 50 MB, to match the community-stated Pipedrive
limit — needs a live test.

**D9 — Availability without a Scheduler API.** Free slots have to be computed as
(working window − existing activities). (a) Whose calendar: **all users'
activities** (the scope the overlap check already uses) or a configured list of
technician user ids? (b) Working window and step: e.g. 08:00–17:00 Mon–Fri, 30-min
steps, slot length = the form's duration (default 60)? (c) Minimum lead time
(e.g. no slots earlier than +2 h)? (d) Re-check on submit becomes a **hard
reject** with the document's text — this removes today's "boka ändå" option.
Confirm that is intended.

**D10 — Meeting owner and leftovers.** With IT-tekniker gone: (a) **activity
owned by a configured technician user** (`PIPEDRIVE_MEETING_OWNER_USER_ID`) or (b)
the token user as today. And: keep the Pipedrive Scheduler link section, Längd
minuter, Plats/länk and Agenda (not mentioned in the document — recommend keep,
duration is needed for slots), or remove?

**D11 — Mediacleaning contact person vs local-only mode.** The document requires a
contact person selected from Pipedrive before the document can be created. The
README's hard rule says Mediacleaning must still produce a downloadable PDF with
no Pipedrive target. (a) **Keep local-only mode with a typed firmatecknare; when
an organization/prospect/deal is linked, the signer must be chosen from its
persons.** (b) Drop local-only mode entirely.

**D12 — Document target.** "Smart doc under Organisation (INTE PROSPEKT)" is read
as: the PDF is uploaded to the organization, not the lead; the internal-comment
note still goes to the lead/deal. (a) **File → organization only; note → lead →
deal → org.** (b) Also attach a copy of the file to the lead so the QC employee
sees it there. Confirm (a).

**D13 — Supplier registry.** (a) The 64 known suppliers need organization numbers
— does the client supply them, or do we look them up and mark unverified ones?
(b) New suppliers saved with "Spara": **shared server-side list** (`.data/`, like
history) visible to all sellers, or per-browser? (c) Who may edit or remove a
saved supplier, and should duplicates be blocked by org number?

**D14 — Status page scope for "kunder".** Only deals/leads carry "Affärens
säljare". (a) **Customers = the organizations behind the seller's leads and
deals** (no new field). (b) A new organization custom field "Ansvarig säljare"
that admins maintain per organization. Also: should `/historik` be replaced by
the status page, and in any case filtered to the logged-in seller (the document's
"andra säljares uppgifter ska inte visas" applies to it too)?

**D15 — Original seller.** (a) **Portal registry** (extend the history store:
creator, seller option id at creation, lead id, timestamps) plus a note on the
lead "Skapad via portalen av …". (b) A second custom field "Ursprunglig säljare"
so it is visible and bulk-safe inside Pipedrive.

**D16 — Fields the document does not mention on the prospect step.** Pipeline
and Steg are removed (leads have neither; chosen at conversion). Värde and Valuta
become the lead value. Avtalslängd, Månadskostnad, Startavgift, Totalt
affärsvärde and Bindningstid stay as form data feeding the contract step, still
without Pipedrive fields. Confirm.

---

## 5. Things that need a Pipedrive admin (cannot be done from the portal)

- Create the custom deal field(s) decided in D3/D6/D7/D15 and hand over their
  40-char keys for `.env`.
- Confirm the four seller options remain the source of truth for assignment and
  that Leads Inbox bulk edit can change that field (verify in the account).
- Decide the lead owner user (D2) and meeting owner user (D10).
- Delete test deal `806` (token lacks permission).
- Deliver final legal wording for the contract and Mediacleaning letters (still
  open since 2026-08-14).

## 6. Suggested build order (after decisions)

1. Identity: per-seller accounts, session carries seller option id; remove every
   client-supplied `sellerId`/`sellerName`. Filter `/historik` by seller.
2. Prospect step: delete deal creation; lead creation with org/person resolution
   (reuse `resolveDealParties`); title derivation; field removals/merges; status
   field write; portal registry entry.
3. Audio upload: multipart route, file → lead + org, note, status update, retry
   path.
4. Meeting step: remove seller/technician fields, website-on-new-org, free-slot
   endpoint + picker, hard re-check, button/confirmation, inline errors, past
   dates.
5. Mediacleaning: prospect lookup, org auto-fill, contact picker, supplier
   registry (commit the pending supplier-list work first), remove kundnummer,
   note/file targets.
6. Contract: session seller, prospect lookup, org upload, "Väntar på signering".
7. Status page and backend filtering; conversion detection.
8. README/hard rules rewrite; `.env.example`; tests for every rule in §2.
