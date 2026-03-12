import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `$${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(1)}K`;
  }
  return `$${num.toFixed(2)}`;
}

export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/**
 * Format a date string as a short locale date (e.g., "Jan 15, 2026")
 */
export function formatDate(dateValue: string | null | undefined): string {
  if (!dateValue) return "-";
  try {
    return new Date(dateValue).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateValue ?? "-";
  }
}

/**
 * Format a date string as a full locale string (e.g., "1/15/2026, 3:45:00 PM")
 */
export function formatDateTime(dateValue: string | null | undefined): string {
  if (!dateValue) return "-";
  try {
    return new Date(dateValue).toLocaleString();
  } catch {
    return dateValue ?? "-";
  }
}

/**
 * Format a date string as a relative time (e.g., "2 minutes ago", "3 hours ago")
 */
export function formatRelativeDate(
  dateValue: string | null | undefined,
): string {
  if (!dateValue) return "-";
  try {
    const date = new Date(dateValue);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return formatDate(dateValue);
  } catch {
    return dateValue ?? "-";
  }
}
