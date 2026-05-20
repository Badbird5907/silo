"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Key, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

import { Badge } from "@silo-storage/ui/components/badge";
import { Button } from "@silo-storage/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@silo-storage/ui/components/dialog";
import { Input } from "@silo-storage/ui/components/input";
import { Label } from "@silo-storage/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@silo-storage/ui/components/select";

import { ApiKeySecretsSection } from "@/components/project-settings/api-key-secrets-section";
import { useTRPC } from "@/trpc/react";

interface CreateApiKeyDialogProps {
  projectId: string;
  organizationId: string;
  onCreated?: () => void;
}

export function CreateApiKeyDialog({
  projectId,
  organizationId,
  onCreated,
}: CreateApiKeyDialogProps) {
  const trpc = useTRPC();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [environmentId, setEnvironmentId] = React.useState<string>("");
  const [expirationOption, setExpirationOption] =
    React.useState<string>("never");
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [createdSigningSecret, setCreatedSigningSecret] = React.useState<
    string | null
  >(null);
  const [createdSiloToken, setCreatedSiloToken] = React.useState<string | null>(
    null,
  );
  const [copied, setCopied] = React.useState(false);
  const [copiedSecret, setCopiedSecret] = React.useState(false);
  const environmentsQuery = useQuery({
    ...trpc.apiKey.getEnvironments.queryOptions({ projectId, organizationId }),
    enabled: open && !!organizationId,
  });

  const createMutation = useMutation(
    trpc.apiKey.create.mutationOptions({
      onSuccess: (data) => {
        setCreatedKey(data.key);
        setCreatedSigningSecret(data.signingSecret);
        setCreatedSiloToken(data.siloToken);
        onCreated?.();
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to create API key");
      },
    }),
  );

  const debouncedCreateKey = useDebouncedCallback(
    (input: Parameters<typeof createMutation.mutate>[0]) => {
      createMutation.mutate(input);
    },
    300,
    { leading: true, trailing: false },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !environmentId) return;

    // Calculate expiration date based on selected option
    let expiresAt: Date | undefined;
    if (expirationOption !== "never") {
      const now = new Date();
      switch (expirationOption) {
        case "7d":
          expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case "30d":
          expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          break;
        case "60d":
          expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
          break;
        case "90d":
          expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
          break;
        case "1y":
          expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
          break;
      }
    }

    debouncedCreateKey({
      projectId,
      organizationId,
      name: name.trim(),
      environmentId,
      expiresAt,
    });
  };

  const handleCopyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySigningSecret = async () => {
    if (!createdSigningSecret) return;
    await navigator.clipboard.writeText(createdSigningSecret);
    setCopiedSecret(true);
    toast.success("Signing secret copied to clipboard");
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleClose = () => {
    debouncedCreateKey.cancel();
    setOpen(false);
    // Reset form after dialog closes
    setTimeout(() => {
      setName("");
      setEnvironmentId("");
      setExpirationOption("never");
      setCreatedKey(null);
      setCreatedSigningSecret(null);
      setCreatedSiloToken(null);
      setCopied(false);
      setCopiedSecret(false);
      createMutation.reset();
    }, 200);
  };

  const environments = React.useMemo(
    () => environmentsQuery.data ?? [],
    [environmentsQuery.data],
  );
  const hasEnvironments = environments.length > 0;
  const selectedEnvironment = environments.find(
    (env) => env.id === environmentId,
  );

  React.useEffect(() => {
    if (!open || !hasEnvironments || environmentId) return;
    const firstEnvironment = environments[0];
    if (!firstEnvironment) return;
    setEnvironmentId(firstEnvironment.id);
  }, [environmentId, environments, hasEnvironments, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleClose();
        } else {
          setOpen(true);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Key className="mr-2 h-4 w-4" />
          Create API Key
        </Button>
      </DialogTrigger>
      <DialogContent className={createdKey ? "gap-0 sm:max-w-xl" : undefined}>
        {createdKey ? (
          <>
            <DialogHeader className="space-y-2">
              <DialogTitle>API key created</DialogTitle>
              <DialogDescription>
                Copy what you need before closing. These values are only shown
                once.
              </DialogDescription>
            </DialogHeader>

            <div className="min-w-0 space-y-5 py-2">
              {selectedEnvironment ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-sm">
                    Environment
                  </span>
                  <Badge variant="secondary" className="font-normal">
                    {selectedEnvironment.name}
                  </Badge>
                </div>
              ) : null}

              <ApiKeySecretsSection
                siloToken={createdSiloToken}
                apiKey={createdKey}
                signingSecret={createdSigningSecret}
                apiKeyCopied={copied}
                signingSecretCopied={copiedSecret}
                onCopyApiKey={() => void handleCopyKey()}
                onCopySigningSecret={() => void handleCopySigningSecret()}
              />

              <p className="text-muted-foreground border-t pt-4 text-xs leading-relaxed">
                Treat these like passwords. Store them in a secrets manager or
                env files that are never committed.
              </p>
            </div>

            <DialogFooter className="mt-2 sm:justify-end">
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                Create an environment-scoped API key for programmatic uploads.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Production Server, CI/CD Pipeline"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <p className="text-muted-foreground text-xs">
                  A descriptive name to help you identify this key
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="environment">Environment Scope</Label>
                <Select
                  value={environmentId}
                  onValueChange={setEnvironmentId}
                  disabled={!hasEnvironments}
                >
                  <SelectTrigger id="environment">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    {environments.map((env) => (
                      <SelectItem key={env.id} value={env.id}>
                        {env.name}
                        <span className="text-muted-foreground ml-2 text-xs">
                          ({env.type})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  SDK upload tokens are environment-specific. Use one key per
                  deploy target (dev/staging/prod).
                </p>
                {!hasEnvironments ? (
                  <p className="text-xs text-amber-600">
                    Create an environment first, then create an API key.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expiration</Label>
                <Select
                  value={expirationOption}
                  onValueChange={setExpirationOption}
                >
                  <SelectTrigger id="expiresAt">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">7 days</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                    <SelectItem value="60d">60 days</SelectItem>
                    <SelectItem value="90d">90 days</SelectItem>
                    <SelectItem value="1y">1 year</SelectItem>
                    <SelectItem value="never">No expiration</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Choose when this API key should expire
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createMutation.isPending || !name.trim() || !environmentId
                }
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
