import { Metadata } from "next";

export const metadata: Metadata = {
  title: "ScamDunk Admin",
  description: "Admin dashboard for ScamDunk application",
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
