"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import type { Holding, Account } from "@/domain/types";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import { formatCurrency } from "@/utils/formatting";
import { Badge } from "@/components/ui/Badge";
import { QuoteTypeBadge } from "@/components/ui/SourceTag";
import { cn } from "@/utils/cn";

interface HoldingsTableProps {
  holdings: Holding[];
  accounts: Account[];
  reportingCurrency: string;
  onRowClick?: (h: Holding) => void;
}

export function HoldingsTable({ holdings, accounts, reportingCurrency, onRowClick }: HoldingsTableProps) {
  const accountById = React.useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "value", desc: true }]);
  const [filter, setFilter] = React.useState("");

  const columns = React.useMemo<ColumnDef<Holding>[]>(
    () => [
      {
        id: "asset",
        header: "Holding",
        accessorFn: (r) => r.assetName,
        cell: ({ row }) => {
          const h = row.original;
          return (
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink-900 truncate">{h.assetName}</div>
              <div className="text-2xs text-ink-500 truncate">
                {h.identifier?.value ?? "—"}{" "}
                <span className="text-ink-300">·</span>{" "}
                {ASSET_CLASS_LABELS[h.assetClass] ?? "—"}
              </div>
            </div>
          );
        },
      },
      {
        id: "account",
        header: "Account",
        accessorFn: (r) => accountById[r.accountId]?.name,
        cell: ({ row }) => {
          const a = accountById[row.original.accountId];
          return (
            <div className="min-w-0">
              <div className="text-[13px] text-ink-800 truncate">{a?.name ?? "—"}</div>
              <div className="text-2xs text-ink-500 truncate">{a?.institution}</div>
            </div>
          );
        },
      },
      {
        id: "qty",
        header: "Qty",
        accessorFn: (r) => r.quantity ?? 0,
        cell: ({ row }) =>
          row.original.quantity != null
            ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(row.original.quantity)
            : "—",
        meta: { numeric: true },
      },
      {
        id: "price",
        header: "Price",
        accessorFn: (r) => r.price ?? 0,
        cell: ({ row }) =>
          row.original.price != null
            ? formatCurrency(row.original.price, row.original.currency)
            : "—",
        meta: { numeric: true },
      },
      {
        id: "native",
        header: "Native Value",
        accessorFn: (r) => Math.abs(r.nativeMarketValue ?? 0),
        cell: ({ row }) => (
          <span className={cn(row.original.isLiability && "text-negative-600")}>
            {formatCurrency(row.original.nativeMarketValue, row.original.currency)}
          </span>
        ),
        meta: { numeric: true },
      },
      {
        id: "value",
        header: `Value (${reportingCurrency})`,
        accessorFn: (r) => r.reportingMarketValue ?? r.nativeMarketValue,
        cell: ({ row }) => {
          const v = row.original.reportingMarketValue ?? row.original.nativeMarketValue;
          return (
            <span className={cn("font-medium", row.original.isLiability && "text-negative-600")}>
              {formatCurrency(v, reportingCurrency)}
            </span>
          );
        },
        meta: { numeric: true },
      },
      {
        id: "source",
        header: "Source",
        accessorFn: (r) => r.quoteType ?? "manual",
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <QuoteTypeBadge type={row.original.quoteType ?? "manual"} />
            {row.original.advisorVerification === "advisor_approved" && (
              <Badge tone="positive">Approved</Badge>
            )}
            {row.original.advisorVerification === "unverified" && (
              <Badge tone="warning">Unverified</Badge>
            )}
          </div>
        ),
      },
    ],
    [accountById, reportingCurrency]
  );

  const table = useReactTable({
    data: holdings,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    globalFilterFn: (row, _id, value) => {
      const s = String(value).toLowerCase();
      const h = row.original;
      return [h.assetName, h.identifier?.value, h.assetClass, h.currency, h.country]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="rounded-lg border border-ink-100 bg-paper overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-ink-100">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter holdings…"
          className="h-8 w-64 max-w-full rounded-md border border-ink-200 bg-white px-3 text-[13px] focus:outline-none focus:border-navy-400 focus:ring-2 focus:ring-navy-200/60"
        />
        <div className="text-2xs uppercase tracking-widest text-ink-500">{holdings.length} rows</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-slatey-50/60">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const isNumeric = (h.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                  return (
                    <th
                      key={h.id}
                      className={cn(
                        "h-9 px-4 text-2xs uppercase tracking-widest text-ink-500 font-semibold whitespace-nowrap",
                        isNumeric ? "text-right" : "text-left",
                        h.column.getCanSort() && "cursor-pointer select-none"
                      )}
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc" && <span className="text-ink-400 ml-1">↑</span>}
                      {h.column.getIsSorted() === "desc" && <span className="text-ink-400 ml-1">↓</span>}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                className="border-t border-ink-100 hover:bg-slatey-50/50 cursor-pointer"
              >
                {row.getVisibleCells().map((cell) => {
                  const isNumeric = (cell.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-4 py-2.5 align-middle tabular",
                        isNumeric ? "text-right" : "text-left"
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
