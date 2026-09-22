import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { PageLayout } from "@/components/PageLayout";

export default function DashboardPage() {
  return (
    <PageLayout dashboardShell>
      <main className="flex-1 px-4 py-7 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-[1320px]">
          <DashboardHome />
        </div>
      </main>
    </PageLayout>
  );
}
