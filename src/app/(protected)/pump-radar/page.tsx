import { PageLayout } from "@/components/PageLayout";
import { PublicPumpRadar } from "@/components/dashboard/PumpRadar";

export default function PumpRadarPage() {
  return (
    <PageLayout dashboardShell>
      <main className="flex-1 px-4 py-7 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-[1320px]">
          <header className="mb-6 max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Market-wide findings</p>
            <h1 className="font-editorial text-[clamp(1.4rem,2vw,1.85rem)] leading-tight">Pump Radar</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">Anonymous risk patterns from the latest completed market scan.</p>
          </header>
          <PublicPumpRadar fullPage showHeading={false} />
        </div>
      </main>
    </PageLayout>
  );
}
