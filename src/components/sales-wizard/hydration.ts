import type {
  ContractStepData,
  MediacleaningStepData,
  MeetingStepData,
  ProspectStepData
} from "@/lib/crm/types";

/**
 * Carries customer data forward between the wizard's steps.
 *
 * Every function only fills blanks: a value the seller has already typed into
 * the target step is never overwritten. The prospect and meeting steps feed
 * each other in both directions, so the carry-over holds whichever the seller
 * starts with — the client asked for prospect first, and a seller who books a
 * meeting first still gets their details back on the prospect.
 *
 * Pure and outside the component so the reorder of the steps could be tested:
 * the previous version keyed on the step's position in the list.
 */

export function hydrateProspectFromMeeting(current: ProspectStepData, meeting: MeetingStepData): ProspectStepData {
  return {
    ...current,
    person: {
      ...current.person,
      id: current.person.id ?? meeting.person.id,
      name: current.person.name || meeting.person.name,
      // Meeting fields are optional but the prospect step requires them, so a
      // missing value carries forward as an empty field for the seller to fill
      // in — never as `undefined`, which the prospect schema rejects.
      phone: current.person.phone || meeting.person.phone || "",
      phoneType: current.person.phoneType || meeting.person.phoneType,
      email: current.person.email || meeting.person.email || "",
      emailType: current.person.emailType || meeting.person.emailType,
      organizationId: current.person.organizationId ?? meeting.person.organizationId
    },
    organization: {
      ...current.organization,
      id: current.organization.id ?? meeting.organization?.id,
      name: current.organization.name || meeting.organization?.name || "",
      website: current.organization.website || meeting.organization?.website || "",
      address: current.organization.address || meeting.organization?.address || "",
      city: current.organization.city || meeting.organization?.city || "",
      organizationNumber: current.organization.organizationNumber || meeting.organization?.organizationNumber || ""
    },
    viktigastForKunden: current.viktigastForKunden || meeting.internalComment || ""
  };
}

export function hydrateMeetingFromProspect(current: MeetingStepData, prospect: ProspectStepData): MeetingStepData {
  return {
    ...current,
    person: {
      ...current.person,
      id: current.person.id ?? prospect.person.id,
      name: current.person.name || prospect.person.name,
      phone: current.person.phone || prospect.person.phone,
      phoneType: current.person.phoneType ?? prospect.person.phoneType,
      email: current.person.email || prospect.person.email,
      emailType: current.person.emailType ?? prospect.person.emailType,
      organizationId: current.person.organizationId ?? prospect.person.organizationId
    },
    organization: {
      ...current.organization,
      id: current.organization?.id ?? prospect.organization.id,
      name: current.organization?.name || prospect.organization.name,
      website: current.organization?.website || prospect.organization.website,
      address: current.organization?.address || prospect.organization.address,
      city: current.organization?.city || prospect.organization.city,
      organizationNumber: current.organization?.organizationNumber || prospect.organization.organizationNumber
    }
  };
}

export function hydrateMediacleaning(
  current: MediacleaningStepData,
  from: { prospect: ProspectStepData; meeting: MeetingStepData; createdLeadId?: string }
): MediacleaningStepData {
  const { prospect, meeting, createdLeadId } = from;

  return {
    ...current,
    companyName: current.companyName || prospect.organization.name || meeting.organization?.name || "",
    organizationNumber:
      current.organizationNumber || prospect.organization.organizationNumber || meeting.organization?.organizationNumber || "",
    address: current.address || prospect.organization.address || meeting.organization?.address || "",
    city: current.city || prospect.organization.city || meeting.organization?.city || "",
    organizationId: current.organizationId || String(prospect.organization.id ?? meeting.organization?.id ?? ""),
    leadId: current.leadId || createdLeadId || ""
  };
}

export function hydrateContract(
  current: ContractStepData,
  from: {
    prospect: ProspectStepData;
    meeting: MeetingStepData;
    mediacleaning: MediacleaningStepData;
    createdLeadId?: string;
  }
): ContractStepData {
  const { prospect, meeting, mediacleaning, createdLeadId } = from;

  return {
    ...current,
    companyName: current.companyName || prospect.organization.name || mediacleaning.companyName,
    organizationNumber:
      current.organizationNumber || prospect.organization.organizationNumber || mediacleaning.organizationNumber,
    signerName: current.signerName || prospect.person.name || meeting.person.name,
    address: current.address || prospect.organization.address || mediacleaning.address,
    price: current.price || prospect.monthlyCost || prospect.value || 0,
    bindingPeriodMonths: current.bindingPeriodMonths || prospect.bindingPeriodMonths || 24,
    organizationId: current.organizationId || String(prospect.organization.id ?? mediacleaning.organizationId ?? ""),
    // The prospect this session created is the one the contract belongs to.
    leadId: current.leadId || createdLeadId || String(mediacleaning.leadId ?? ""),
    dealId: current.dealId || String(mediacleaning.dealId ?? "")
  };
}
