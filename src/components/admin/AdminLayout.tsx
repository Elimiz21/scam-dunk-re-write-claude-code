"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Activity,
  Settings,
  Shield,
  Users,
  UsersRound,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
  Bell,
  Eye,
  Radar,
  TrendingUp,
  AlertTriangle,
  Search,
  Database,
  MessageSquare,
  Newspaper,
  KeyRound,
  FileText,
  BarChart3,
  Cog,
  UserCog,
  Headphones,
  Mail,
  Home,
  Radio,
  Monitor,
  LucideIcon,
} from "lucide-react";

interface AdminSession {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

interface NavCategory {
  name: string;
  icon: LucideIcon;
  items: NavItem[];
}

// Standalone dashboard item
const dashboardItem: NavItem = {
  name: "Dashboard",
  href: "/admin/dashboard",
  icon: LayoutDashboard,
};

// Categorized navigation structure
const navigationCategories: NavCategory[] = [
  {
    name: "Support",
    icon: Headphones,
    items: [
      { name: "Customer Support", href: "/admin/support", icon: Headphones },
      { name: "Email Management", href: "/admin/email-management", icon: Mail },
    ],
  },
  {
    name: "Content",
    icon: FileText,
    items: [
      { name: "Landing Page", href: "/admin/homepage", icon: Home },
      { name: "News", href: "/admin/news", icon: Newspaper },
      { name: "Scan Messages", href: "/admin/scan-messages", icon: MessageSquare },
    ],
  },
  {
    name: "Market Intelligence",
    icon: BarChart3,
    items: [
      { name: "Scan Intelligence", href: "/admin/scan-intelligence", icon: Radar },
      { name: "Market Analysis", href: "/admin/market-analysis", icon: TrendingUp },
      { name: "Risk Alerts", href: "/admin/risk-alerts", icon: AlertTriangle },
      { name: "Social Scan", href: "/admin/social-scan", icon: Radio },
      { name: "Browser Agents", href: "/admin/browser-agents", icon: Monitor },
      { name: "Stock Lookup", href: "/admin/stock-lookup", icon: Search },
    ],
  },
  {
    name: "System",
    icon: Cog,
    items: [
      { name: "Data Ingestion", href: "/admin/data-ingestion", icon: Database },
      { name: "API Usage", href: "/admin/api-usage", icon: Activity },
      { name: "Integrations", href: "/admin/integrations", icon: Settings },
      { name: "Model Efficacy", href: "/admin/model-efficacy", icon: Shield },
    ],
  },
  {
    name: "Administration",
    icon: UserCog,
    items: [
      { name: "Users", href: "/admin/users", icon: UsersRound },
      { name: "Team", href: "/admin/team", icon: Users },
      { name: "Settings", href: "/admin/settings", icon: KeyRound },
    ],
  },
];

// Helper to get category containing a path
function getCategoryForPath(path: string): string | null {
  for (const category of navigationCategories) {
    if (category.items.some(item => path.startsWith(item.href))) {
      return category.name;
    }
  }
  return null;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Initialize expanded categories based on current path
  const initializeExpandedCategories = useCallback(() => {
    const activeCategory = getCategoryForPath(pathname);
    if (activeCategory) {
      setExpandedCategories(new Set([activeCategory]));
    }
  }, [pathname]);

  useEffect(() => {
    initializeExpandedCategories();
  }, [initializeExpandedCategories]);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const res = await fetch("/api/admin/auth/session");
      const data = await res.json();

      if (data.authenticated) {
        setSession(data.admin);
      } else {
        router.push("/admin/login");
      }
    } catch {
      router.push("/admin/login");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
      router.push("/admin/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  function toggleCategory(categoryName: string) {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName);
      } else {
        newSet.add(categoryName);
      }
      return newSet;
    });
  }

  function isCategoryActive(category: NavCategory): boolean {
    return category.items.some(item => pathname.startsWith(item.href));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="admin-layout min-h-screen bg-background text-foreground">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-300 ease-in-out lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
          <span className="text-xl font-bold text-foreground">ScamDunk Admin</span>
          <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-6 w-6" />
          </button>
        </div>
        <nav className="mt-4 px-2 space-y-1 overflow-y-auto flex-1">
          {/* Dashboard - standalone item */}
          <Link
            href={dashboardItem.href}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors ${
              pathname === dashboardItem.href
                ? "gradient-brand text-white"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <dashboardItem.icon className="h-5 w-5 mr-3" />
            {dashboardItem.name}
          </Link>

          {/* Category divider */}
          <div className="pt-4 pb-2">
            <div className="border-t border-border" />
          </div>

          {/* Categorized navigation */}
          {navigationCategories.map((category) => {
            const isExpanded = expandedCategories.has(category.name);
            const isActive = isCategoryActive(category);
            return (
              <div key={category.name} className="space-y-1">
                <button
                  onClick={() => toggleCategory(category.name)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center">
                    <category.icon className="h-5 w-5 mr-3" />
                    {category.name}
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-200 ease-in-out ${
                    isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="pl-4 space-y-1">
                    {category.items.map((item) => {
                      const isItemActive = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center px-4 py-2.5 text-sm rounded-md transition-colors ${
                            isItemActive
                              ? "gradient-brand text-white"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          }`}
                        >
                          <item.icon className="h-4 w-4 mr-3" />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-card border-r border-border overflow-y-auto">
          <div className="flex items-center h-16 px-4 border-b border-border/50">
            <div className="relative h-8 w-8 rounded-xl gradient-brand flex items-center justify-center shadow-sm">
              <Shield className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-success flex items-center justify-center border-[1.5px] border-background">
                <Eye className="h-2 w-2 text-white" />
              </div>
            </div>
            <span className="ml-2 font-display tracking-tight italic text-foreground">
              Scam<span className="gradient-brand-text not-italic font-sans font-bold">Dunk</span>
            </span>
            <span className="ml-2 text-xs text-muted-foreground uppercase font-semibold tracking-wider">Admin</span>
          </div>
          <nav className="flex-1 mt-4 px-2 space-y-1 overflow-y-auto">
            {/* Dashboard - standalone item */}
            <Link
              href={dashboardItem.href}
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors ${
                pathname === dashboardItem.href
                  ? "gradient-brand text-white"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <dashboardItem.icon className="h-5 w-5 mr-3" />
              {dashboardItem.name}
              {pathname === dashboardItem.href && <ChevronRight className="ml-auto h-4 w-4" />}
            </Link>

            {/* Category divider */}
            <div className="pt-4 pb-2">
              <div className="border-t border-border" />
            </div>

            {/* Categorized navigation */}
            {navigationCategories.map((category) => {
              const isExpanded = expandedCategories.has(category.name);
              const isActive = isCategoryActive(category);
              return (
                <div key={category.name} className="space-y-1">
                  <button
                    onClick={() => toggleCategory(category.name)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center">
                      <category.icon className="h-5 w-5 mr-3" />
                      {category.name}
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-200 ease-in-out ${
                      isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="pl-4 space-y-1">
                      {category.items.map((item) => {
                        const isItemActive = pathname.startsWith(item.href);
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center px-4 py-2.5 text-sm rounded-md transition-colors ${
                              isItemActive
                                ? "gradient-brand text-white"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                            }`}
                          >
                            <item.icon className="h-4 w-4 mr-3" />
                            {item.name}
                            {isItemActive && <ChevronRight className="ml-auto h-4 w-4" />}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="p-4 border-t border-border">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 rounded-full gradient-brand flex items-center justify-center">
                  <span className="text-white font-medium">
                    {session.email[0].toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {session.name || session.email}
                </p>
                <p className="text-xs text-muted-foreground uppercase">{session.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="mt-4 w-full flex items-center justify-center px-4 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground rounded-md transition-colors"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur-lg border-b border-border/50 flex items-center px-4 lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1 flex items-center justify-end">
            <button className="p-2 text-muted-foreground hover:text-foreground relative">
              <Bell className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Page content */}
        <main className="py-6 px-4 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
