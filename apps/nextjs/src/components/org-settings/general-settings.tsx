"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@silo-storage/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@silo-storage/ui/components/card";
import { Input } from "@silo-storage/ui/components/input";
import { Label } from "@silo-storage/ui/components/label";

import { authClient } from "@/auth/client";

interface GeneralSettingsProps {
  organization: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
  };
  canEdit: boolean;
  onUpdate?: () => void;
}

export function GeneralSettings({
  organization,
  canEdit,
  onUpdate,
}: GeneralSettingsProps) {
  const [name, setName] = React.useState(organization.name);
  const [slug, setSlug] = React.useState(organization.slug);
  const [slugStatus, setSlugStatus] = React.useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const slugCheckTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; slug?: string }) => {
      const result = await authClient.organization.update({
        data: {
          name: data.name,
          slug: data.slug,
        },
      });
      if (result.error) {
        throw new Error(
          result.error.message ?? "Failed to update organization",
        );
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Organization updated successfully");
      onUpdate?.();
      // If slug changed, we need to redirect
      if (slug !== organization.slug) {
        window.location.href = `/${slug}/settings`;
      }
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message ?? "Failed to update organization");
    },
  });

  const checkSlugAvailability = React.useCallback(
    async (newSlug: string) => {
      if (newSlug === organization.slug) {
        setSlugStatus("idle");
        return;
      }

      const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
      if (!slugRegex.test(newSlug) || newSlug.length < 3) {
        setSlugStatus("invalid");
        return;
      }

      setSlugStatus("checking");

      try {
        const result = await authClient.organization.checkSlug({
          slug: newSlug,
        });
        if (result.data?.status) {
          setSlugStatus("available");
        } else {
          setSlugStatus("taken");
        }
      } catch {
        setSlugStatus("taken");
      }
    },
    [organization.slug],
  );

  const handleSlugChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(sanitized);

    if (slugCheckTimeoutRef.current) {
      clearTimeout(slugCheckTimeoutRef.current);
    }

    slugCheckTimeoutRef.current = setTimeout(() => {
      void checkSlugAvailability(sanitized);
    }, 500);
  };

  const handleSave = () => {
    const updates: { name?: string; slug?: string } = {};

    if (name !== organization.name) {
      updates.name = name;
    }

    if (slug !== organization.slug && slugStatus === "available") {
      updates.slug = slug;
    }

    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    }
  };

  const hasChanges =
    name !== organization.name ||
    (slug !== organization.slug && slugStatus === "available");

  const canSave =
    hasChanges && !updateMutation.isPending && slugStatus !== "checking";

  return (
    <Card>
      <CardHeader>
        <CardTitle>General Settings</CardTitle>
        <CardDescription>
          Manage your organization&apos;s basic information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="org-name">Organization Name</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Organization"
            disabled={!canEdit}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-slug">Organization Slug</Label>
          <div className="flex items-center gap-2">
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="my-organization"
              disabled={!canEdit}
              className="flex-1"
            />
            {slugStatus === "checking" && (
              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
            )}
            {slugStatus === "available" && (
              <Check className="h-4 w-4 text-green-500" />
            )}
            {(slugStatus === "taken" || slugStatus === "invalid") && (
              <X className="h-4 w-4 text-red-500" />
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            URL: {typeof window !== "undefined" ? window.location.origin : ""}
            <span className="font-mono">/{slug}</span>
          </p>
          {slugStatus === "taken" && (
            <p className="text-xs text-red-500">This slug is already taken</p>
          )}
          {slugStatus === "invalid" && (
            <p className="text-xs text-red-500">
              Slug must be at least 3 characters and contain only lowercase
              letters, numbers, and hyphens
            </p>
          )}
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!canSave}>
              {updateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
