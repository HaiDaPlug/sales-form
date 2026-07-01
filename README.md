# Digital Kontakt Sales Portal

Internal sales workflow portal for Digital Kontakt. The app guides sellers through four separate workflows while using Pipedrive as the CRM record system:

1. Meeting booking with IT technician
2. Create deal in Pipedrive
3. Mediacleaning cancellation documents
4. Contract generation

## Hard Business Rules

- Meeting booking must not create a deal.
- Mediacleaning must not create a deal.
- Contract generation must not create a deal.
- Only the explicit Create Deal step may create a Pipedrive deal.
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

Fill `.env.local` with the real Pipedrive API token and custom field keys. Do not commit real secrets.

## Scaffold Status

This first pass creates the app shell, typed models, validation schemas, server-side Pipedrive service boundaries, PDF service boundaries, and a practical four-step wizard UI. The next implementation pass should replace placeholder flows with real account-specific Pipedrive behavior.

## Still Needed From Client/Pipedrive

- Custom field API keys for faktura start, fakturagrupp, viktigast for kunden, avtalslangd, payment interval, binding period, and cancellation period.
- Pipeline and stage IDs, including the target flow for Google Digital Paket.
- Seller/user IDs and whether IT technicians are Pipedrive users or external contacts.
- Calendar invitation decision: Pipedrive activity plus Pipedrive scheduler, Google Calendar, Microsoft 365, or another calendar provider.
- Approved Swedish legal text for cancellation letters and contract summaries.
- Whether Mediacleaning agreement summary and Contract generation should produce separate PDFs or a combined export in some cases.
- Final attachment fallback order: deal, organization, person/activity, or local download only.
- Auth decision for internal access: login, VPN, password gate, or private deployment only.

## Useful Checks

```bash
npm run typecheck
npm run build
```
