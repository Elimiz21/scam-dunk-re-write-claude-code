import { notFound } from "next/navigation";

import { FunnelReport } from "@/components/FunnelReport";

export const metadata = { robots: { index: false, follow: false } };

export default async function TeamFunnelPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const expectedToken = process.env.FUNNEL_DASHBOARD_SHARE_TOKEN;
  if (!expectedToken || token !== expectedToken) notFound();

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7">
          <p className="text-sm font-medium text-teal">ScamDunk</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Conversion funnel</h1>
          <p className="mt-2 text-sm text-muted-foreground">Aggregate-only reporting for the ScamDunk team. No user names, emails, or scan contents are shown.</p>
        </header>
        <FunnelReport endpoint={`/api/team/funnel/${encodeURIComponent(token)}`} />
      </div>
    </main>
  );
}
