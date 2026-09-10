import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { PageLayout } from "@/components/PageLayout";

export default function DashboardPage() {
  return (
    <PageLayout dashboardShell>
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="mx-auto w-full max-w-[1500px]">
          <DashboardHome />
        </div>
      </main>
    </PageLayout>
  );
}
