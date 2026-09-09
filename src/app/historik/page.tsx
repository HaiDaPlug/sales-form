import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/server";
import { listHistory } from "@/lib/history/store";
import { WORKFLOW_KINDS, WORKFLOW_LABELS, type WorkflowKind } from "@/lib/history/types";

export const metadata = {
  title: "Historik — Digital Kontakt Sales Portal"
};

// History is written per request; never serve a cached page.
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ kind?: string }>;
};

export default async function HistoryPage({ searchParams }: PageProps) {
  const session = await getCurrentSession();

  if (!session) redirect("/login?next=/historik");

  const { kind: kindParam } = await searchParams;
  const kind = WORKFLOW_KINDS.includes(kindParam as WorkflowKind) ? (kindParam as WorkflowKind) : undefined;
  const entries = await listHistory({ kind, limit: 200 });

  return (
    <main className="history-page">
      {/* This page renders outside the app shell, so it carries its own mark. */}
      <Link className="page-brand" href="/" aria-label="Digital Kontakt — till arbetsflöden">
        <Image src="/brand/wordmark-navy.png" alt="Digital Kontakt" width={1200} height={205} priority />
      </Link>

      <div className="toolbar">
        <div>
          <p className="eyebrow">Historik</p>
          <h1>Körningar</h1>
          <p className="hint">Alla körda arbetsflöden, senaste först. Inloggad som {session.subject}.</p>
        </div>
        <Link className="btn" href="/">
          Till arbetsflöden
        </Link>
      </div>

      <nav className="history-filters" aria-label="Filtrera historik">
        <Link className="filter-pill" data-active={!kind} href="/historik">
          Alla
        </Link>
        {WORKFLOW_KINDS.map((workflowKind) => (
          <Link
            className="filter-pill"
            data-active={kind === workflowKind}
            key={workflowKind}
            href={`/historik?kind=${workflowKind}`}
          >
            {WORKFLOW_LABELS[workflowKind]}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <div className="panel">
          <p className="history-empty">Inga körningar matchar filtret än.</p>
        </div>
      ) : (
        <div className="panel history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th scope="col">Tid</th>
                <th scope="col">Arbetsflöde</th>
                <th scope="col">Kund</th>
                <th scope="col">Sammanfattning</th>
                <th scope="col">Av</th>
                <th scope="col">Resultat</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} data-status={entry.status}>
                  <td className="nowrap" data-label="Tid">
                    {formatTimestamp(entry.createdAt)}
                  </td>
                  <td data-label="Arbetsflöde">{WORKFLOW_LABELS[entry.kind]}</td>
                  <td data-label="Kund">{entry.customerName ?? "—"}</td>
                  <td data-label="Sammanfattning">
                    <span>
                      {entry.summary}
                      {entry.errorMessage && <span className="history-error"> — {entry.errorMessage}</span>}
                    </span>
                  </td>
                  <td className="nowrap" data-label="Av">
                    {entry.createdBy}
                  </td>
                  <td className="nowrap" data-label="Resultat">
                    {describeResult(entry)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function describeResult(entry: Awaited<ReturnType<typeof listHistory>>[number]) {
  if (entry.status === "error") return "Misslyckades";
  // The work completed but something after it did not. The specific cause is in
  // `errorMessage` — a note may have failed after the file uploaded fine, so
  // this must not claim the document was never linked.
  if (entry.status === "warning") return "Klar med varning";
  if (entry.pipedriveDealId) return `Affär ${entry.pipedriveDealId}`;
  if (entry.pipedriveActivityId) return `Aktivitet ${entry.pipedriveActivityId}`;
  if (entry.fileName) return "Dokument";

  return "Klar";
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
}
