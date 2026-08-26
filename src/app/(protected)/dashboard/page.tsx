import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { PageLayout } from "@/components/PageLayout";

export default function DashboardPage() {
  return (
    <PageLayout>
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="mb-7">
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary">
              Your ScamDunk workspace
            </p>
            <h1 className="mt-2 font-display text-3xl italic sm:text-4xl">
              Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Review scan credits, active monitoring, saved stocks, and the latest published market-wide findings.
            </p>
          </div>
          <DashboardHome />
        </div>
      </main>
    </PageLayout>
  );
}
