# Intentions & Ideas

Captured thoughts, directions, and things we want to act on. Lightweight by design - prune freely.

---

### Swap in the client's document wording when it arrives
> 2026-08-14, updated 2026-09-20 - Mediacleaning and contract generation

The client decided on 2026-09-18 that no document carries a draft mark, since
the seller reviews each one before sending. The placeholder wording stays until
they deliver the Mediacleaning text and the two contract texts, with the names
each contract type should have in the "Avtalstyp" list. Both live in
`src/lib/pdf/templates/`; swapping them touches nothing else.

### Confirm the combined document workflow with the client
> 2026-08-14 - Contract generation and Mediacleaning

The documentation permits contract generation together with Mediacleaning.
The app now requires an explicit seller checkbox and otherwise keeps the PDFs
separate. Confirm that this is the client's intended selection model.

### Popup from an external link in Mötesbokning, after the Kontakt section
> 2026-09-17 - Deferred; the client will specify the link and content later

Add a popup opened from another link in the meeting step, placed directly after
the "Kontakt" section. Not part of the 2026-09-17 change set; build once the
client supplies the source.

### Fix fixed-time meeting ownership and customer invitations
> 2026-08-16 - Meeting booking follow-up

Keep staff-created fixed-time meetings, assign them to the selected IT technician, and email the customer; technicians rely on Pipedrive rather than an invitation. Re-test the observed 13:35-to-16:35 discrepancy before changing time handling, and flag the current limitation for tomorrow's meetings.
