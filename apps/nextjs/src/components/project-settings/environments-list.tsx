"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  KeyRound,
  Layers,
  MoreHorizontal,
  Pencil,
  Trash2,
  WebhookIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@silo-storage/ui/components/badge";
import { Button } from "@silo-storage/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@silo-storage/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@silo-storage/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@silo-storage/ui/components/dropdown-menu";
import { Input } from "@silo-storage/ui/components/input";
import { Label } from "@silo-storage/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@silo-storage/ui/components/select";
import { Skeleton } from "@silo-storage/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@silo-storage/ui/components/table";

import { useTRPC } from "@/trpc/react";
import { CallbackHeadersDialog } from "./callback-headers-dialog";
import { CreateEnvironmentDialog } from "./create-environment-dialog";
import { ManageEnvironmentWebhookDialog } from "./manage-environment-webhook-dialog";
import { Tooltip,TooltipContent,TooltipTrigger } from "@silo-storage/ui/components/tooltip";

interface EnvironmentsListProps {
  projectId: string;
  organizationId: string;
}

type EnvironmentType = "development" | "staging" | "production";
type WebhookEvent = "upload.completed" | "upload.failed";

function parseEnvironmentType(value: string): EnvironmentType {
  if (value === "development" || value === "staging" || value === "production") {
    return value;
  }
  return "development";
}

function parseWebhookEvents(values: string[]): WebhookEvent[] {
  const parsed = values.filter(
    (value): value is WebhookEvent =>
      value === "upload.completed" || value === "upload.failed",
  );
  return parsed.length > 0 ? parsed : ["upload.completed", "upload.failed"];
}

function normalizeCallbackHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === "string" && typeof v === "string") {
      out[k] = v;
    }
  }
  return out;
}

function getTypeBadgeVariant(
  type: string,
): "default" | "secondary" | "outline" {
  switch (type) {
    case "production":
      return "default";
    case "staging":
      return "secondary";
    default:
      return "outline";
  }
}

export function EnvironmentsList({
  projectId,
  organizationId,
}: EnvironmentsListProps) {
  const trpc = useTRPC();
  const [deleteTarget, setDeleteTarget] = React.useState<{
    id: string;
    name: string;
  } | null>(null);
  const [editTarget, setEditTarget] = React.useState<{
    id: string;
    name: string;
    type: EnvironmentType;
  } | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editType, setEditType] = React.useState<
    EnvironmentType
  >("development");
  const [webhookTarget, setWebhookTarget] = React.useState<{
    id: string;
    name: string;
    webhookEnabled: boolean;
    webhookUrl: string | null;
    webhookEvents: WebhookEvent[];
    webhookSecretSet: boolean;
  } | null>(null);
  const [callbackHeadersTarget, setCallbackHeadersTarget] = React.useState<{
    id: string;
    name: string;
    callbackHeaders: Record<string, string>;
  } | null>(null);
  const environmentsQuery = useQuery(
    trpc.environment.list.queryOptions(
      { projectId, organizationId },
      { enabled: !!organizationId },
    ),
  );

  const deleteMutation = useMutation(
    trpc.environment.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Environment deleted successfully");
        setDeleteTarget(null);
        void environmentsQuery.refetch();
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to delete environment");
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.environment.update.mutationOptions({
      onSuccess: () => {
        toast.success("Environment updated successfully");
        setEditTarget(null);
        void environmentsQuery.refetch();
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to update environment");
      },
    }),
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ id: deleteTarget.id, organizationId });
  };

  const handleEdit = (env: {
    id: string;
    name: string;
    type: EnvironmentType;
  }) => {
    setEditTarget(env);
    setEditName(env.name);
    setEditType(env.type);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !editName.trim()) return;
    updateMutation.mutate({
      id: editTarget.id,
      organizationId,
      name: editName.trim(),
      type: editType,
    });
  };

  if (environmentsQuery.isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Environments
          </CardTitle>
          <CardDescription>
            Manage environments for this project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const environments = environmentsQuery.data ?? [];

  return (
    <>
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Environments
            </CardTitle>
            <CardDescription>
              Manage environments for this project ({environments.length}{" "}
              {environments.length === 1 ? "environment" : "environments"})
            </CardDescription>
          </div>
          <CreateEnvironmentDialog
            projectId={projectId}
            organizationId={organizationId}
            onCreated={() => environmentsQuery.refetch()}
          />
        </CardHeader>
        <CardContent>
          {environments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Layers className="text-muted-foreground mb-4 h-12 w-12" />
              <h3 className="text-lg font-medium">No environments yet</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Create an environment to organize your files and API keys.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {environments.map((env) => (
                  <TableRow key={env.id}>
                    <TableCell className="font-medium">
                      {env.name}
                      {env.webhookEnabled && !env.webhookSecretSet ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge className="ml-2 border-yellow-500 text-yellow-500 bg-yellow-500/10">!</Badge>
                          </TooltipTrigger>
                          <TooltipContent className="text-center">
                            Webhook secret not set.<br />
                            Webhook delivery will not work until a secret is set.
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getTypeBadgeVariant(env.type)}>
                        {env.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={env.ownerUserId ? "secondary" : "outline"}>
                        {env.ownerUserId ? "Personal" : "Shared"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="bg-muted rounded px-2 py-1 text-xs">
                        {env.slug}
                      </code>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(env.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              handleEdit({
                                id: env.id,
                                name: env.name,
                                type: parseEnvironmentType(env.type),
                              })
                            }
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setWebhookTarget({
                                id: env.id,
                                name: env.name,
                                webhookEnabled: env.webhookEnabled,
                                webhookUrl: env.webhookUrl,
                                webhookEvents: parseWebhookEvents(
                                  env.webhookEvents,
                                ),
                                webhookSecretSet: env.webhookSecretSet,
                              })
                            }
                          >
                            <WebhookIcon className="mr-2 h-4 w-4" />
                            Manage Webhook
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setCallbackHeadersTarget({
                                id: env.id,
                                name: env.name,
                                callbackHeaders: normalizeCallbackHeaders(
                                  env.callbackHeaders,
                                ),
                              })
                            }
                          >
                            <KeyRound className="mr-2 h-4 w-4" />
                            Callback headers
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              setDeleteTarget({ id: env.id, name: env.name })
                            }
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Environment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the environment{" "}
              <strong>{deleteTarget?.name}</strong>? This will permanently
              delete all files, file keys, and API keys associated with this
              environment. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Environment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent>
          <form onSubmit={handleUpdate}>
            <DialogHeader>
              <DialogTitle>Edit Environment</DialogTitle>
              <DialogDescription>
                Update the name or type of this environment.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-type">Type</Label>
                <Select
                  value={editType}
                  onValueChange={(v) =>
                    setEditType(v as "development" | "staging" | "production")
                  }
                >
                  <SelectTrigger id="edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending || !editName.trim()}
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ManageEnvironmentWebhookDialog
        open={!!webhookTarget}
        onOpenChange={(open) => {
          if (!open) setWebhookTarget(null);
        }}
        organizationId={organizationId}
        environment={webhookTarget}
        onUpdated={() => void environmentsQuery.refetch()}
      />

      <CallbackHeadersDialog
        open={!!callbackHeadersTarget}
        onOpenChange={(open) => {
          if (!open) setCallbackHeadersTarget(null);
        }}
        organizationId={organizationId}
        environment={callbackHeadersTarget}
        onUpdated={() => void environmentsQuery.refetch()}
      />
    </>
  );
}
