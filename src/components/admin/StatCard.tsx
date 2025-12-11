"use client";

import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: number;
  changeLabel?: string;
  color?: "blue" | "green" | "yellow" | "red" | "purple" | "indigo";
}

const colorClasses = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  indigo: "bg-indigo-500",
};

export default function StatCard({
  title,
  value,
  icon: Icon,
  change,
  changeLabel,
  color = "indigo",
}: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">{value.toLocaleString()}</p>
          {change !== undefined && (
            <div className="mt-2 flex items-center text-sm">
              {change >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
              )}
              <span className={change >= 0 ? "text-green-600" : "text-red-600"}>
                {change >= 0 ? "+" : ""}
                {change}%
              </span>
              {changeLabel && <span className="text-gray-500 ml-1">{changeLabel}</span>}
            </div>
          )}
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color]}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}
