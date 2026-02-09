"use client";

import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: number;
  changeLabel?: string;
  color?: "blue" | "green" | "yellow" | "red" | "purple" | "indigo" | "gray";
}

export default function StatCard({
  title,
  value,
  icon: Icon,
  change,
  changeLabel,
}: StatCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-6 transition-all duration-200 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-semibold text-foreground">{value.toLocaleString()}</p>
          {change !== undefined && (
            <div className="mt-2 flex items-center text-sm">
              {change >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500 mr-1" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
              )}
              <span className={change >= 0 ? "text-emerald-600" : "text-red-600"}>
                {change >= 0 ? "+" : ""}
                {change}%
              </span>
              {changeLabel && <span className="text-muted-foreground ml-1">{changeLabel}</span>}
            </div>
          )}
        </div>
        <div className="p-3 gradient-brand rounded-2xl shadow-sm">
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}
