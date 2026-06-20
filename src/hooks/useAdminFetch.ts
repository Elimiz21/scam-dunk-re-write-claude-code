"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface UseAdminFetchOptions {
  /** Show success messages from mutations (default: true) */
  showSuccess?: boolean;
  /** Auto-clear success messages after this many ms (default: 3000, 0 disables) */
  successTimeout?: number;
}

interface FetchOptions<T> {
  /** Called with the parsed JSON when the request succeeds */
  onSuccess?: (data: T) => void;
  /** Treat this fetch as a "background refresh" — do not toggle the global loading flag */
  silent?: boolean;
}

interface MutateOptions {
  method?: string;
  onSuccess?: (data: Record<string, unknown>) => void;
  /** Called after a successful mutation (e.g. to refetch the list) */
  refetch?: () => void;
};

interface UseAdminFetchReturn<T> {
  data: T | null;
  loading: boolean;
  error: string;
  success: string;
  pagination: PaginationState;
  setError: (error: string) => void;
  setSuccess: (success: string) => void;
  /**
   * Fetch data from an admin API endpoint. Aborts any in-flight request from a
   * previous call (kills stale-response races) and clears the error at the
   * start of every call (prevents a stuck error from bricking the page).
   */
  fetchData: (url: string, options?: FetchOptions<T>) => Promise<T | null>;
  /** Perform a mutation (POST/PATCH/DELETE) and optionally refetch */
  mutate: (
    url: string,
    body: Record<string, unknown>,
    options?: MutateOptions,
  ) => Promise<boolean>;
  /** Update pagination from API response data */
  setPagination: (p: PaginationState) => void;
  /** Update the data state directly */
  setData: (data: T | null) => void;
}

/**
 * Shared hook for admin page data fetching and mutations.
 *
 * Fixes whole classes of bugs the hand-rolled pattern had:
 *  - AbortController per request: aborts the previous request on every new call
 *    and on unmount, killing stale-response races and setState-after-unmount.
 *  - 401 handling: redirects to /admin/login on an expired session.
 *  - error is cleared at the START of every fetch/mutate so a transient failure
 *    never permanently bricks the page.
 *  - success messages auto-clear after ~3s.
 *
 * Replaces the repetitive pattern of:
 *   const [data, setData] = useState(null);
 *   const [loading, setLoading] = useState(true);
 *   const [error, setError] = useState("");
 *   const [success, setSuccess] = useState("");
 */
export function useAdminFetch<T>(
  options?: UseAdminFetchOptions,
): UseAdminFetchReturn<T> {
  const showSuccess = options?.showSuccess ?? true;
  const successTimeout = options?.successTimeout ?? 3000;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccessState] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  });

  // Track the in-flight fetch so a new call can abort the old one.
  const abortRef = useRef<AbortController | null>(null);
  // Track the success auto-clear timer so we can reset it.
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const setSuccess = useCallback(
    (message: string) => {
      if (!showSuccess) return;
      setSuccessState(message);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (message && successTimeout > 0) {
        successTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setSuccessState("");
        }, successTimeout);
      }
    },
    [showSuccess, successTimeout],
  );

  const fetchData = useCallback(
    async (url: string, opts?: FetchOptions<T>): Promise<T | null> => {
      // Abort any in-flight request — newest call always wins.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!opts?.silent) setLoading(true);
      setError("");
      try {
        const res = await fetch(url, { signal: controller.signal });

        if (res.status === 401) {
          // Session expired — bounce to login.
          if (typeof window !== "undefined") {
            window.location.href = "/admin/login";
          }
          return null;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Request failed (${res.status})`);
        }

        const json = await res.json();
        // Ignore if a newer request superseded this one.
        if (controller.signal.aborted) return null;

        setData(json);
        if (json && json.pagination) {
          setPagination(json.pagination);
        }
        opts?.onSuccess?.(json);
        return json;
      } catch (err) {
        // Aborted requests are expected — swallow them.
        if (err instanceof DOMException && err.name === "AbortError") {
          return null;
        }
        if (controller.signal.aborted) return null;
        const message =
          err instanceof Error ? err.message : "Failed to load data";
        setError(message);
        return null;
      } finally {
        // Only the most recent request should clear the loading flag.
        if (abortRef.current === controller && !opts?.silent) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const mutate = useCallback(
    async (
      url: string,
      body: Record<string, unknown>,
      opts?: MutateOptions,
    ): Promise<boolean> => {
      setError("");
      setSuccessState("");
      try {
        const res = await fetch(url, {
          method: opts?.method || "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.status === 401) {
          if (typeof window !== "undefined") {
            window.location.href = "/admin/login";
          }
          return false;
        }

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Action failed");
        if (json.message) setSuccess(json.message);
        opts?.onSuccess?.(json);
        opts?.refetch?.();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Action failed";
        setError(message);
        return false;
      }
    },
    [setSuccess],
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

interface UseAdminListOptions {
  /** Initial page (default 1) */
  initialPage?: number;
  /** Debounce delay for the search term in ms (default 350) */
  debounceMs?: number;
}

interface UseAdminListReturn {
  page: number;
  setPage: (page: number) => void;
  search: string;
  /** Set the raw search term (debounced value drives `debouncedSearch`) */
  setSearch: (search: string) => void;
  /** Debounced search term — use this when building the fetch URL */
  debouncedSearch: string;
  filters: Record<string, string>;
  /**
   * Update a filter. Resets the page back to 1 so filter changes never leave
   * the user stranded on a now-empty page.
   */
  setFilter: (key: string, value: string) => void;
}

/**
 * Companion hook for list/table pages: manages page + filters + a debounced
 * search term, and resets the page to 1 whenever a filter or the search term
 * changes. Pair the returned `debouncedSearch`/`filters`/`page` into the URL
 * passed to `fetchData` (which already handles abort + races).
 */
export function useAdminList(
  initialFilters: Record<string, string> = {},
  options?: UseAdminListOptions,
): UseAdminListReturn {
  const debounceMs = options?.debounceMs ?? 350;
  const [page, setPage] = useState(options?.initialPage ?? 1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(
    initialFilters,
  );
  // Skip the page-reset on the very first debounce settle so an initial empty
  // search doesn't fight a caller that set a non-1 initial page.
  const firstDebounce = useRef(true);

  // Debounce the search term and reset to page 1 when it actually changes.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch((prev) => {
        if (prev !== search && !firstDebounce.current) {
          setPage(1);
        }
        firstDebounce.current = false;
        return search;
      });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [search, debounceMs]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => {
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
    setPage(1);
  }, []);

  return {
    page,
    setPage,
    search,
    setSearch,
    debouncedSearch,
    filters,
    setFilter,
  };
}
