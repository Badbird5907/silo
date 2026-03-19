"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Key, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@silo-storage/ui/components/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@silo-storage/ui/components/dropdown-menu";
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
import { CreateApiKeyDialog } from "./create-api-key-dialog";

interface ApiKeysListProps {
  projectId: string;
  organizationId: string;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatKeyPrefix(prefix: string) {
  // Show prefix with masked suffix: sk-silo-xxxx****
  return `${prefix}${"*".repeat(8)}`;
}

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function ApiKeysList({ projectId, organizationId }: ApiKeysListProps) {
  const trpc = useTRPC();

  const apiKeysQuery = useQuery(
    trpc.apiKey.list.queryOptions({ projectId, organizationId }),
  );

  const deleteMutation = useMutation(
    trpc.apiKey.delete.mutationOptions({
      onSuccess: () => {
        toast.success("API key deleted successfully");
        void apiKeysQuery.refetch();
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to delete API key");
      },
    }),
  );

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ id, organizationId });
  };

  if (apiKeysQuery.isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys
          </CardTitle>
          <CardDescription>
            Manage API keys for programmatic access to this project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const apiKeys = apiKeysQuery.data ?? [];

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys
          </CardTitle>
          <CardDescription>
            Manage API keys for programmatic access to this project (
            {apiKeys.length} {apiKeys.length === 1 ? "key" : "keys"})
          </CardDescription>
          <p className="text-muted-foreground mt-2 text-xs">
            Deployment setup: create one key per environment and use its `SILO_TOKEN`
            in that environment only.
          </p>
        </div>
        <CreateApiKeyDialog
          projectId={projectId}
          organizationId={organizationId}
          onCreated={() => apiKeysQuery.refetch()}
        />
      </CardHeader>
      <CardContent>
        {apiKeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Key className="text-muted-foreground mb-4 h-12 w-12" />
            <h3 className="text-lg font-medium">No API keys yet</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Create an API key to access this project programmatically.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((apiKey) => {
                const expired = isExpired(apiKey.expiresAt);
                return (
                  <TableRow key={apiKey.id}>
                    <TableCell className="font-medium">{apiKey.name}</TableCell>
                    <TableCell>
                      <code className="bg-muted rounded px-2 py-1 text-xs">
                        {formatKeyPrefix(apiKey.keyPrefix)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          apiKey.environment.type === "production"
                            ? "default"
                            : apiKey.environment.type === "staging"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {apiKey.environment.name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {apiKey.createdBy ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage
                              src={apiKey.createdBy.user.image ?? undefined}
                            />
                            <AvatarFallback className="text-xs">
                              {getInitials(apiKey.createdBy.user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">
                            {apiKey.createdBy.user.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          Unknown
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(apiKey.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {apiKey.expiresAt ? (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-sm">
                            {new Date(apiKey.expiresAt).toLocaleDateString()}
                          </span>
                          {expired && (
                            <Badge variant="destructive">Expired</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          Never
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {apiKey.lastUsedAt
                        ? new Date(apiKey.lastUsedAt).toLocaleDateString()
                        : "Never"}
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
                            onClick={() => handleDelete(apiKey.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Key
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
