"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@silo-storage/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@silo-storage/ui/components/dialog";
import { Input } from "@silo-storage/ui/components/input";
import { Label } from "@silo-storage/ui/components/label";

import { useTRPC } from "@/trpc/react";

interface HeaderRow {
  key: string;
  value: string;
}

function headersToRows(headers: Record<string, string>): HeaderRow[] {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return [{ key: "", value: "" }];
  }
  return entries.map(([key, value]) => ({ key, value }));
}

function rowsToHeaders(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const k = row.key.trim();
    if (!k) continue;
    out[k] = row.value;
  }
  return out;
}

interface CallbackHeadersEnvironment {
  id: string;
  name: string;
  callbackHeaders: Record<string, string>;
}

interface CallbackHeadersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  environment: CallbackHeadersEnvironment | null;
  onUpdated?: () => void;
}

export function CallbackHeadersDialog({
  open,
  onOpenChange,
  organizationId,
  environment,
  onUpdated,
}: CallbackHeadersDialogProps) {
  const trpc = useTRPC();
  const [rows, setRows] = React.useState<HeaderRow[]>([{ key: "", value: "" }]);

  React.useEffect(() => {
    if (!open || !environment) return;
    setRows(headersToRows(environment.callbackHeaders));
  }, [environment, open]);

  const updateMutation = useMutation(
    trpc.environment.updateCallbackHeaders.mutationOptions({
      onSuccess: () => {
        toast.success("Callback headers saved");
        onUpdated?.();
        onOpenChange(false);
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to save callback headers");
      },
    }),
  );

  const addRow = () => {
    setRows((current) => [...current, { key: "", value: "" }]);
  };

  const removeRow = (index: number) => {
    setRows((current) => {
      const next = current.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ key: "", value: "" }];
    });
  };

  const updateRow = (index: number, field: "key" | "value", value: string) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!environment) return;
    const headers = rowsToHeaders(rows);
    await updateMutation.mutateAsync({
      organizationId,
      id: environment.id,
      headers,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Callback headers
            </DialogTitle>
            <DialogDescription>
              HTTP headers included whenb calling back to your application on
              environment
              <strong>{` ${environment?.name}`}</strong>. Silo signing headers
              always take precedence over duplicates.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Headers</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRow}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add header
              </Button>
            </div>

            <div className="max-h-[min(50vh,320px)] space-y-2 overflow-y-auto pr-1">
              <div className="text-muted-foreground grid grid-cols-[1fr_1fr_2.5rem] gap-2 text-xs font-medium">
                <span>Name</span>
                <span>Value</span>
                <span className="sr-only">Remove</span>
              </div>
              {rows.map((row, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_1fr_2.5rem] items-center gap-2"
                >
                  <Input
                    placeholder="Authorization"
                    value={row.key}
                    onChange={(e) => updateRow(index, "key", e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Input
                    placeholder="Bearer …"
                    value={row.value}
                    onChange={(e) => updateRow(index, "value", e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removeRow(index)}
                    aria-label="Remove header"
                  >
                    <Trash2 className="text-muted-foreground h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save headers
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
