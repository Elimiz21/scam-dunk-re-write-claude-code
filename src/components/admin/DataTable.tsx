"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pagination?: {
    page: number;
    pages: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  loading?: boolean;
  emptyMessage?: string;
}

export default function DataTable<T>({
  columns,
  data,
  pagination,
  loading,
  emptyMessage = "No data available",
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="animate-pulse">
          <div className="h-12 bg-secondary/50" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 border-t border-border flex items-center px-6">
              <div className="h-4 bg-secondary rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-secondary/50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider ${column.className || ""}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item, index) => (
                <tr key={index} className="hover:bg-secondary/50 transition-colors">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-6 py-4 whitespace-nowrap text-sm text-foreground ${column.className || ""}`}
                    >
                      {column.render
                        ? column.render(item)
                        : ((item as Record<string, unknown>)[column.key] as React.ReactNode) ?? "-"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination && pagination.pages > 1 && (
        <div className="bg-card px-4 py-3 flex items-center justify-between border-t border-border sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="relative inline-flex items-center px-4 py-2 border border-border text-sm font-medium rounded-xl text-foreground bg-card hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.pages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-border text-sm font-medium rounded-xl text-foreground bg-card hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Showing page <span className="font-medium text-foreground">{pagination.page}</span> of{" "}
                <span className="font-medium text-foreground">{pagination.pages}</span> (
                <span className="font-medium text-foreground">{pagination.total}</span> total)
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-xl shadow-sm -space-x-px">
                <button
                  onClick={() => pagination.onPageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-xl border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => pagination.onPageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.pages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-xl border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
