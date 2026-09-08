import { Activity, Clock3, Home, Star, type LucideIcon } from "lucide-react";

export interface DashboardNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/watchlist", label: "Watchlist", icon: Star },
  { href: "/recent-scans", label: "Recent Scans", icon: Clock3 },
  { href: "/pump-radar", label: "Pump Radar", icon: Activity },
];
