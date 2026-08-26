import type { ResourceStatus } from "@/components/dashboard/types";

export interface DashboardResourceState<T = unknown> {
  status: ResourceStatus;
  data: T | null;
  error: string | null;
}

export type DashboardResourceAction<T> =
  | { type: "loading" }
  | { type: "loaded"; data: T }
  | { type: "failed"; error: string };

export const initialDashboardResourceState: DashboardResourceState = {
  status: "idle",
  data: null,
  error: null,
};

export function dashboardResourceReducer<T>(
  _state: DashboardResourceState<T>,
  action: DashboardResourceAction<T>,
): DashboardResourceState<T> {
  switch (action.type) {
    case "loading":
      return { status: "loading", data: null, error: null };
    case "loaded":
      return { status: "ready", data: action.data, error: null };
    case "failed":
      return { status: "error", data: null, error: action.error };
  }
}
