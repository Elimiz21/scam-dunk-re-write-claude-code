import { PageLayout } from "@/components/PageLayout";
import { PublicPumpRadar } from "@/components/dashboard/PumpRadar";

export default function PumpRadarPage() {
  return (
    <PageLayout dashboardShell>
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <PublicPumpRadar fullPage />
        </div>
      </main>
    </PageLayout>
  );
}
