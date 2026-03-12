"use client";

import { useState, useCallback } from "react";

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface UseAdminFetchOptions {
  /** Show success messages from mutations (default: true) */
  showSuccess?: boolean;
}

interface UseAdminFetchReturn<T> {
  data: T | null;
  loading: boolean;
  error: string;
  success: string;
  pagination: PaginationState;
  setError: (error: string) => void;
  setSuccess: (success: string) => void;
  /** Fetch data from an admin API endpoint */
  fetchData: (
    url: string,
    options?: { onSuccess?: (data: T) => void },
  ) => Promise<T | null>;
  /** Perform a mutation (POST/PATCH/DELETE) and optionally refetch */
  mutate: (
    url: string,
    body: Record<string, unknown>,
    options?: {
      method?: string;
      onSuccess?: (data: Record<string, unknown>) => void;
      refetch?: () => void;
    },
  ) => Promise<boolean>;
  /** Update pagination from API response data */
  setPagination: (p: PaginationState) => void;
  /** Update the data state directly */
  setData: (data: T | null) => void;
}

/**
 * Shared hook for admin page data fetching and mutations.
 *
 * Replaces the repetitive pattern of:
 *   const [data, setData] = useState(null);
 *   const [loading, setLoading] = useState(true);
 *   const [error, setError] = useState("");
 *   const [success, setSuccess] = useState("");
 */
export function useAdminFetch<T>(
  _options?: UseAdminFetchOptions,
): UseAdminFetchReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  });

  const fetchData = useCallback(
    async (
      url: string,
      options?: { onSuccess?: (data: T) => void },
    ): Promise<T | null> => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Request failed (${res.status})`);
        }
        const json = await res.json();
        setData(json);
        if (json.pagination) {
          setPagination(json.pagination);
        }
        options?.onSuccess?.(json);
        return json;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load data";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const mutate = useCallback(
    async (
      url: string,
      body: Record<string, unknown>,
      options?: {
        method?: string;
        onSuccess?: (data: Record<string, unknown>) => void;
        refetch?: () => void;
      },
    ): Promise<boolean> => {
      setError("");
      setSuccess("");
      try {
        const res = await fetch(url, {
          method: options?.method || "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Action failed");
        if (json.message) setSuccess(json.message);
        options?.onSuccess?.(json);
        options?.refetch?.();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Action failed";
        setError(message);
        return false;
      }
    },
    [],
  );

  return {
    data,
    loading,
    error,
    success,
    pagination,
    setError,
    setSuccess,
    fetchData,
    mutate,
    setPagination,
    setData,
  };
}
