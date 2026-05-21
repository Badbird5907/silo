"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, WebhookIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@silo-storage/ui/components/button";
import { Checkbox } from "@silo-storage/ui/components/checkbox";
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
import { Switch } from "@silo-storage/ui/components/switch";

import { useTRPC } from "@/trpc/react";

const WEBHOOK_EVENT_OPTIONS = ["upload.completed", "upload.failed"] as const;
type WebhookEvent = (typeof WEBHOOK_EVENT_OPTIONS)[number];

interface WebhookEnvironment {
  id: string;
  name: string;
  webhookEnabled: boolean;
  webhookUrl: string | null;
  webhookEvents: WebhookEvent[];
  webhookSecretSet: boolean;
}

interface ManageEnvironmentWebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  environment: WebhookEnvironment | null;
  onUpdated?: () => void;
}

export function ManageEnvironmentWebhookDialog({
  open,
  onOpenChange,
  organizationId,
  environment,
  onUpdated,
}: ManageEnvironmentWebhookDialogProps) {
  const trpc = useTRPC();
  const [enabled, setEnabled] = React.useState(false);
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [webhookEvents, setWebhookEvents] = React.useState<WebhookEvent[]>([
    ...WEBHOOK_EVENT_OPTIONS,
  ]);
  const [webhookSecretSet, setWebhookSecretSet] = React.useState(false);
  const [generatedSecret, setGeneratedSecret] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    if (!open || !environment) return;
    setEnabled(environment.webhookEnabled);
    setWebhookUrl(environment.webhookUrl ?? "");
    setWebhookEvents(
      environment.webhookEvents.length > 0
        ? environment.webhookEvents
        : [...WEBHOOK_EVENT_OPTIONS],
    );
    setWebhookSecretSet(environment.webhookSecretSet);
    setGeneratedSecret(null);
  }, [environment, open]);

  const updateWebhookMutation = useMutation(
    trpc.environment.updateWebhook.mutationOptions({
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to update webhook configuration");
      },
    }),
  );
  const rotateSecretMutation = useMutation(
    trpc.environment.rotateWebhookSecret.mutationOptions({
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to rotate webhook secret");
      },
    }),
  );

  const toggleEvent = (event: WebhookEvent) => {
    setWebhookEvents((current) => {
      if (current.includes(event)) {
        if (current.length === 1) return current;
        return current.filter((entry) => entry !== event);
      }
      return [...current, event];
    });
  };

  const handleRotateSecret = async (options?: { silent?: boolean }) => {
    if (!environment) return;
    const result = await rotateSecretMutation.mutateAsync({
      id: environment.id,
      organizationId,
    });
    setWebhookSecretSet(true);
    setGeneratedSecret(result.webhookSecret);
    if (!options?.silent) {
      onUpdated?.();
      toast.success("Webhook signing secret generated");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!environment) return;

    const trimmedUrl = webhookUrl.trim();
    if (enabled && !trimmedUrl) {
      toast.error("Webhook URL is required when webhooks are enabled");
      return;
    }

    if (webhookEvents.length === 0) {
      toast.error("Select at least one webhook event");
      return;
    }

    try {
      await updateWebhookMutation.mutateAsync({
        id: environment.id,
        organizationId,
        enabled,
        webhookUrl: trimmedUrl.length > 0 ? trimmedUrl : null,
        webhookEvents,
      });

      let generatedOnSave = false;
      if (enabled && !webhookSecretSet) {
        await handleRotateSecret({ silent: true });
        generatedOnSave = true;
      }

      onUpdated?.();
      toast.success(
        generatedOnSave
          ? "Webhook updated and signing secret generated"
          : "Webhook configuration updated",
      );

      if (!generatedOnSave) {
        onOpenChange(false);
      }
    } catch {
      // Errors are handled by mutation callbacks.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WebhookIcon className="h-4 w-4" />
              Manage Webhook
            </DialogTitle>
            <DialogDescription>
              Configure webhook delivery for{" "}
              <strong>{environment?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-enabled">Webhook Status</Label>
              <div className="flex items-center gap-3 rounded-md border p-3">
                <Switch
                  id="webhook-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
                <span className="text-sm">
                  {enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-url">Webhook URL</Label>
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://example.com/webhooks/silo"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Events will be sent as signed POST requests to this endpoint.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Events</Label>
              <div className="space-y-2 rounded-md border p-3">
                {WEBHOOK_EVENT_OPTIONS.map((event) => (
                  <label
                    key={event}
                    className="flex items-center gap-3 text-sm"
                  >
                    <Checkbox
                      checked={webhookEvents.includes(event)}
                      onCheckedChange={() => toggleEvent(event)}
                      className="h-4 w-4"
                    />
                    <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                      {event}
                    </code>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Signing Secret</Label>
              <div className="space-y-3 rounded-md border p-3">
                <div className="text-sm">
                  Status:{" "}
                  <span
                    className={
                      webhookSecretSet ? "text-green-600" : "text-amber-600"
                    }
                  >
                    {webhookSecretSet ? "Configured" : "Not configured"}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleRotateSecret()}
                  disabled={rotateSecretMutation.isPending}
                >
                  {rotateSecretMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {webhookSecretSet ? "Rotate Secret" : "Generate Secret"}
                </Button>
                {generatedSecret && (
                  <div className="bg-muted/40 space-y-2 rounded-md border p-2">
                    <p className="text-xs font-medium">
                      New secret (shown once):
                    </p>
                    <code className="bg-background block rounded px-2 py-1 text-xs break-all">
                      {generatedSecret}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(generatedSecret);
                          toast.success("Secret copied to clipboard");
                        } catch {
                          toast.error("Failed to copy secret");
                        }
                      }}
                    >
                      Copy secret
                    </Button>
                  </div>
                )}
              </div>
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
            <Button
              type="submit"
              disabled={
                updateWebhookMutation.isPending ||
                rotateSecretMutation.isPending
              }
            >
              {(updateWebhookMutation.isPending ||
                rotateSecretMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Webhook
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
