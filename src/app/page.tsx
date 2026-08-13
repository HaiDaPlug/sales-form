import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/server";
import { SalesWizard } from "@/components/sales-wizard/SalesWizard";

export default async function Home() {
  const session = await getCurrentSession();

  // The proxy already gates this route; this covers the direct-render case.
  if (!session) redirect("/login");

  return <SalesWizard currentUser={session.subject} />;
}
