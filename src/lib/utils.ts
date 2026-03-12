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
 * Extract the value from a settled promise, returning a fallback on rejection.
 * Useful with Promise.allSettled to safely unwrap results.
 */
export function settledVal<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}
