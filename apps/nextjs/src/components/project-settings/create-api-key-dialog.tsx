"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, Key, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

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
  const [copiedBothVars, setCopiedBothVars] = React.useState(false);

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

  const handleCopyBothVars = async () => {
    if (!createdSiloToken) return;
    const snippet = `SILO_URL=${window.location.origin}\nSILO_TOKEN=${createdSiloToken}`;
    await navigator.clipboard.writeText(snippet);
    setCopiedBothVars(true);
    toast.success("SILO_URL and SILO_TOKEN copied to clipboard");
    setTimeout(() => setCopiedBothVars(false), 2000);
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
      setCopiedBothVars(false);
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
      <DialogContent>
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>API Key Created</DialogTitle>
              <DialogDescription>
                Your new API key has been created. Make sure to copy it now -
                you won&apos;t be able to see it again!
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="space-y-4">
                {selectedEnvironment ? (
                  <p className="text-muted-foreground text-xs">
                    This key is scoped to{" "}
                    <strong>{selectedEnvironment.name}</strong>.
                  </p>
                ) : null}
                <div className="space-y-2">
                  <Label>Your API Key</Label>
                  <div className="flex items-center gap-2">
                    <code className="bg-muted flex-1 rounded-md border px-3 py-2 font-mono text-sm break-all">
                      {createdKey}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyKey}
                      className="shrink-0"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                {createdSigningSecret && (
                  <div className="space-y-2">
                    <Label>Signing Secret</Label>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted flex-1 rounded-md border px-3 py-2 font-mono text-sm break-all">
                        {createdSigningSecret}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopySigningSecret}
                        className="shrink-0"
                      >
                        {copiedSecret ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Use this to self-sign upload URLs from your server without
                      calling the /upload endpoint.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Environment Snippet</Label>
                  {createdSiloToken ? (
                    <>
                      <pre className="bg-muted rounded-md border px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">
                        {`SILO_URL=${typeof window === "undefined" ? "" : window.location.origin}\nSILO_TOKEN=${createdSiloToken}`}
                      </pre>
                      <Button
                        variant="outline"
                        onClick={handleCopyBothVars}
                        className="w-full"
                      >
                        {copiedBothVars ? (
                          <>
                            <Check className="mr-2 h-4 w-4 text-green-500" />
                            Copied both vars
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy both vars
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      SILO_TOKEN could not be generated. Delete this key and
                      create a new key scoped to an environment.
                    </p>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  Store these securely. They will not be shown again.
                </p>
              </div>
            </div>
            <DialogFooter>
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
