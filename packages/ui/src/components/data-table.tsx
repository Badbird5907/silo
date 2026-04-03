"use client";

import type { ColumnDef, Row } from "@tanstack/react-table";
import type { LucideIcon } from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileX,
} from "lucide-react";

import { cn } from "@silo-storage/ui/lib/utils";

import { Button } from "./button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Spinner } from "./spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

interface DataTablePaginationState {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface DataTablePaginationProps extends DataTablePaginationState {
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

function DataTablePagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: DataTablePaginationProps) {
  if (totalCount <= 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:contents">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <span>Rows:</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-muted-foreground text-sm tabular-nums">
          {page} / {totalPages} ({totalCount.toLocaleString()})
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 sm:justify-end sm:gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(1)}
          disabled={!hasPreviousPage}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={!hasPreviousPage}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNextPage}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(totalPages)}
          disabled={!hasNextPage}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  onRowClick?: (row: TData) => void;
  pagination?: DataTablePaginationProps | null;
}

function getColumnLayoutMeta(meta: unknown): {
  headerClassName?: string;
  cellClassName?: string;
} {
  if (meta && typeof meta === "object") {
    const m = meta as Record<string, unknown>;
    return {
      headerClassName:
        typeof m.headerClassName === "string" ? m.headerClassName : undefined,
      cellClassName:
        typeof m.cellClassName === "string" ? m.cellClassName : undefined,
    };
  }
  return {};
}

function DataTable<TData, TValue>({
  columns,
  data,
  loading = false,
  emptyMessage = "No results.",
  emptyIcon: EmptyIcon = FileX,
  onRowClick,
  pagination,
}: DataTableProps<TData, TValue>) {
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table requires this hook to create table instance for rendering.
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleRowClick = (row: Row<TData>) => {
    if (onRowClick) {
      onRowClick(row.original);
    }
  };

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const { headerClassName } = getColumnLayoutMeta(
                  header.column.columnDef.meta,
                );
                return (
                  <TableHead key={header.id} className={headerClassName}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-48">
                <div className="flex flex-col items-center justify-center gap-2">
                  <Spinner className="size-8" />
                  <span className="text-muted-foreground text-sm">
                    Loading...
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                onClick={() => handleRowClick(row)}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {row.getVisibleCells().map((cell) => {
                  const { cellClassName } = getColumnLayoutMeta(
                    cell.column.columnDef.meta,
                  );
                  return (
                    <TableCell key={cell.id} className={cellClassName}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-48">
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="bg-muted flex size-12 items-center justify-center rounded-full">
                    <EmptyIcon className="text-muted-foreground size-6" />
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {emptyMessage}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {pagination != null && pagination.totalCount > 0 ? (
        <div className="bg-background border-t px-4 py-4">
          <DataTablePagination {...pagination} />
        </div>
      ) : null}
    </div>
  );
}

export { DataTable, DataTablePagination };
export type { ColumnDef, DataTablePaginationProps, DataTablePaginationState };
