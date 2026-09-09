import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession, sellerFromSession } from "@/lib/auth/server";
import { UNDERLAG_LABELS } from "@/lib/crm/prospect";
import { getSellerStatus } from "@/lib/status/service";
import type { ProspectStatus, SellerStatus } from "@/lib/status/types";

export const metadata = {
  title: "Status — Digital Kontakt Sales Portal"
};

// Assignment can change in Pipedrive at any moment; never serve a cached page.
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const session = await getCurrentSession();

  if (!session) redirect("/login?next=/status");

  let status: SellerStatus | undefined;
  let error: string | undefined;

  try {
    status = await getSellerStatus(sellerFromSession(session));
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "Kunde inte hämta status från Pipedrive.";
  }

  return (
    <main className="history-page">
      {/* This page renders outside the app shell, so it carries its own mark. */}
      <Link className="page-brand" href="/" aria-label="Digital Kontakt — till arbetsflöden">
        <Image src="/brand/wordmark-navy.png" alt="Digital Kontakt" width={1200} height={205} priority />
      </Link>

      <div className="toolbar">
        <div>
          <p className="eyebrow">Status</p>
          <h1>Dina prospekt och affärer</h1>
          <p className="hint">
            Tilldelade dig i Pipedrive just nu. Inloggad som {session.subject}. Godkännande och konvertering till affär
            görs av kvalitetskontrollen i Pipedrive.
          </p>
        </div>
        <Link className="btn" href="/">
          Till arbetsflöden
        </Link>
      </div>

      {error && <div className="notice error">{error}</div>}

      {status && (
        <>
          <section className="panel">
            <h2 className="section-title">Prospekt</h2>
            {status.prospects.length === 0 ? (
              <p className="history-empty">Inga prospekt är tilldelade dig.</p>
            ) : (
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th scope="col">Prospekt</th>
                      <th scope="col">Kund</th>
                      <th scope="col">Registrerat</th>
                      <th scope="col">Underlag</th>
                      <th scope="col">Kvalitetskontroll</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.prospects.map((prospect) => (
                      <tr key={prospect.leadId}>
                        <td data-label="Prospekt">{prospect.title}</td>
                        <td data-label="Kund">{prospect.organizationName ?? "—"}</td>
                        <td className="nowrap" data-label="Registrerat">
                          {formatDate(prospect.registeredAt)}
                        </td>
                        <td data-label="Underlag">
                          {prospect.underlag ? UNDERLAG_LABELS[prospect.underlag] : "Inget underlag ännu"}
                        </td>
                        <td data-label="Kvalitetskontroll">{describeQualityControl(prospect)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="section-title">Affärer</h2>
            {status.deals.length === 0 ? (
              <p className="history-empty">Inga affärer är tilldelade dig.</p>
            ) : (
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th scope="col">Affär</th>
                      <th scope="col">Kund</th>
                      <th scope="col">Skapad</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.deals.map((deal) => (
                      <tr key={String(deal.dealId)}>
                        <td data-label="Affär">{deal.title}</td>
                        <td data-label="Kund">{deal.organizationName ?? "—"}</td>
                        <td className="nowrap" data-label="Skapad">
                          {formatDate(deal.addedAt)}
                        </td>
                        <td data-label="Status">
                          {deal.sourceLeadId ? "Konverterad från prospekt" : (deal.status ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="section-title">Kunder</h2>
            {status.customers.length === 0 ? (
              <p className="history-empty">Inga kunder är tilldelade dig.</p>
            ) : (
              <ul className="customer-list">
                {status.customers.map((customer) => (
                  <li key={String(customer.organizationId)}>
                    <span className="customer-name">{customer.name}</span>
                    <span className="customer-meta">
                      {customer.prospectCount} prospekt · {customer.dealCount} affärer
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

/**
 * The evidence and the verdict are separate things: a prospect can carry a
 * signed contract and still be waiting for someone to check the sale.
 */
function describeQualityControl(prospect: ProspectStatus): string {
  if (prospect.qualityControl === "converted") {
    return `Godkänd och konverterad ${formatDate(prospect.convertedAt)} — affär ${prospect.dealId}`;
  }

  if (prospect.qualityControl === "archived") return "Arkiverad, ej konverterad";

  return "Väntar på kvalitetskontroll";
}

function formatDate(value: string | undefined): string {
  if (!value) return "—";

  const parsed = new Date(value.replace(" ", "T"));

  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("sv-SE");
}
