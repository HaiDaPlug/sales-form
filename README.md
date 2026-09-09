# Digital Kontakt Sales Portal

Internal sales workflow portal for Digital Kontakt. The app guides sellers
through four workflows while using Pipedrive as the CRM record system:

1. Meeting booking
2. Create prospect
3. Mediacleaning cancellation documents
4. Contract generation

A fifth page, `/status`, shows each seller what Pipedrive currently assigns to
them. Every run is recorded in a history the seller can see, so work is
traceable rather than submitted into a void.

## The division of labour

The portal is the sellers' restricted interface. **Pipedrive is the back
office.** A seller creates prospects, contacts, organizations and meetings, and
supplies the evidence a sale rests on. A separate employee quality-checks that
evidence in Pipedrive and converts the prospect into a deal. That conversion is
the approval, and it happens nowhere near this application.

A "prospekt" is a Pipedrive **Lead**. Leads inherit the deal custom fields, so
the invoicing values, the seller assignment and the evidence status live on the
prospect and follow it into the deal it becomes.

## Hard Business Rules

1. **No workflow creates a deal.** `createDeal` and its route operation are
   deleted, not disabled — `src/lib/crm/boundaries.test.ts` fails if they come
   back. Deals are read-only: Mediacleaning may attach a document to one.
2. **No workflow converts a prospect or approves a sale.** No conversion
   endpoint is called and no function for it exists, so a direct call to the
   backend cannot reach one either.
3. **The evidence status only advances on a completed action.** "Ljudfil
   uppladdad" is written after Pipedrive confirms the file, never before.
   "Väntar på signering" and "Avtal signerat" describe the back-office's own
   acts and are only ever read.
4. **Existing CRM records are read-only**, with one exception: the evidence
   field on a prospect the portal created. There is no delete method anywhere.
5. **Every read is scoped to the logged-in seller**, server-side, from the
   current value of "Affärens säljare" in Pipedrive.
6. A prospect requires an organization; a meeting may be booked from contact
   details alone.
7. Mediacleaning and contract generation require a linked organization and a
   contact person chosen from it. The document is uploaded to the
   **organization**, its note to the prospect, else the deal, else the
   organization.
8. Meeting bookings are checked against the technicians' calendars when the
   slot is chosen **and** again when the booking is sent.

## Who the sellers are

The four sellers have no Pipedrive login. They are options 72–75 on the custom
deal field **"Affärens säljare"**, and that option id is what assigns every
record. Each seller therefore has a portal account that carries their option
id, held in `APP_USERS`:

```json
[{"username":"filippa","name":"Filippa","sellerOptionId":72,"passwordHash":"scrypt$..."}]
```

Hashes come from `npm run hash-password`. The signed session carries the option
id, and **no request body ever names a seller** — a seller cannot act in a
colleague's name, whatever they send.

An administrator changes an assignment by editing "Affärens säljare" in
Pipedrive, per record or in bulk. The portal reads that on every request, so a
transferred customer moves between sellers immediately. "Ursprunglig säljare"
records who created the prospect and is never updated, so a transfer preserves
the origin.

## Evidence and quality control

A sale rests on one of two things, chosen when the prospect is created:

- **A recording of the call.** The browser uploads it to private Vercel Blob
  storage — a Vercel function cannot receive more than 4.5 MB — and the server
  moves it to Pipedrive, attached to both the prospect and the organization.
  Only then does the prospect read "Ljudfil uppladdad".
- **A contract for digital signature.** The prospect starts as "Digital
  signering krävs". The contract step uploads the PDF to the organization and
  creates a task for the back-office, who send it with Smart Docs and set the
  status afterwards.

Smart Docs has no public API and the sellers cannot log in to Pipedrive, so the
portal cannot send a document for signature or observe a signature. That step
is a person's, deliberately.

Evidence is not approval. The status page reports the two separately.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

`APP_SESSION_SECRET` and at least one account in `APP_USERS` are required to log
in. Without `DATABASE_URL` the run history falls back to a local JSON Lines
file and the supplier registry is served read-only — fine for development,
impossible on Vercel, whose filesystem is read-only.

## Deployment notes

- **Neon Postgres** holds the run history and the supplier registry. The tables
  are created on first use; there is no migration step.
- **Vercel Blob** stages audio uploads. Without `BLOB_READ_WRITE_TOKEN` the
  browser posts the file straight to the route instead, which only works on a
  host with no request-size limit.
- Custom field keys are account-specific hashes read from `GET /dealFields`.
  Prospect creation fails loudly if one is missing, rather than dropping the
  value.

## Meeting availability

Pipedrive's Scheduler has no public API for its availability, so the portal
computes it: the configured working window, minus everything already booked in
the technicians' calendars (`PIPEDRIVE_TECHNICIAN_USER_IDS`). A slot survives
while one technician is free, and the booking is assigned to them. The check
runs again at submit time and refuses a slot taken in the meantime — the
earlier "book anyway" escape is gone, and it was what produced the duplicate
activities already in the account.

Times are Swedish wall-clock throughout. Pipedrive stores activities in UTC, so
every comparison converts first; a fixed offset would be wrong across
daylight-saving changes and around midnight.

## Documents

Mediacleaning produces one cancellation per supplier in a single PDF, with the
customer's identity number and the supplier's own details. Suppliers come from
a shared registry a seller can add to; most of the shipped list still has no
organisationsnummer, and those stay blank rather than guessed, because a wrong
identity number on a cancellation is worse than none.

Both document workflows are still marked `UTKAST`. The client owes the final
legal wording before anything is sent to a customer. The Mediacleaning copy is
isolated in `src/lib/pdf/templates/mediacleaning.ts` so an approved version can
be swapped in without touching pagination or upload logic.

## Still needed from the client

- The Pipedrive user ids for the back-office/QC inbox and the technician pool.
- Custom deal fields "Underlag" (four options, exactly as named in
  `src/lib/crm/prospect.ts`) and "Ursprunglig säljare" (the same four sellers),
  and their API keys.
- Organisationsnummer for the shipped supplier list.
- Final legal wording for the contract and the cancellation letters.
- Confirmation that the Smart Docs template on the organization can carry
  everything it needs, since prospect-level commercial values are not mirrored
  onto the organization.
- Deal `806` ("ZZ TEST seller field") still needs deleting by hand; the API
  token lacks permission.

## Useful Checks

```bash
npm run typecheck
npm test
npm run lint
npm run build
```
