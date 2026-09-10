/**
 * Prospect naming, shared by the form (to show the title as it is typed) and
 * the server (to write it). Pure, so it can live on both sides.
 */

/** "Digital Kontakt" → "Digital Kontakt Prospekt". The seller never types this. */
export function prospectTitle(organizationName: string): string {
  return `${organizationName.trim()} Prospekt`;
}

/**
 * The values the "Underlag" custom field can hold, exactly as the options are
 * named in Pipedrive. The portal writes the first two itself — on creation and
 * after a completed upload — and only reads the others: sending and signing
 * happen in Pipedrive, so a person records them there.
 */
export const UNDERLAG_LABELS = {
  signatureRequired: "Digital signering krävs",
  audioUploaded: "Ljudfil uppladdad",
  awaitingSignature: "Väntar på signering",
  signed: "Avtal signerat"
} as const;

export type UnderlagStatus = keyof typeof UNDERLAG_LABELS;

/** The only status the portal ever sets after a prospect exists. */
export type PortalUpdatableUnderlag = "audioUploaded";
