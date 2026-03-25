"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@silo-storage/ui/components/select";

import { useTRPC } from "@/trpc/react";

interface ProjectGeneralSettingsProps {
  project: {
    id: string;
    name: string;
    slug: string;
    defaultFileAccess: "public" | "private";
    pendingUploadFailAfterMinutes: number;
  };
  organizationId: string;
}

export function ProjectGeneralSettings({
  project,
  organizationId,
}: ProjectGeneralSettingsProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [defaultFileAccess, setDefaultFileAccess] = React.useState(
    project.defaultFileAccess,
  );
  const [pendingUploadFailAfterMinutes, setPendingUploadFailAfterMinutes] =
    React.useState(project.pendingUploadFailAfterMinutes);

  const updateMutation = useMutation(
    trpc.project.update.mutationOptions({
      onSuccess: () => {
        toast.success("Project settings updated");
        void queryClient.invalidateQueries({
          queryKey: trpc.project.getById.queryKey({
            id: project.id,
            organizationId,
          }),
        });
      },
      onError: (error: { message?: string }) => {
        toast.error(error.message ?? "Failed to update project");
      },
    }),
  );

  const handleSave = () => {
    if (
      defaultFileAccess !== project.defaultFileAccess ||
      pendingUploadFailAfterMinutes !== project.pendingUploadFailAfterMinutes
    ) {
      updateMutation.mutate({
        id: project.id,
        organizationId,
        defaultFileAccess,
        pendingUploadFailAfterMinutes,
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied to clipboard`);
    });
  };

  const hasChanges =
    defaultFileAccess !== project.defaultFileAccess ||
    pendingUploadFailAfterMinutes !== project.pendingUploadFailAfterMinutes;

  return (
    <div className="flex w-full flex-row gap-6">
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Project Information</CardTitle>
          <CardDescription>
            Basic information about your project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-id">Project ID</Label>
            <div className="flex items-center gap-2">
              <Input
                id="project-id"
                value={project.id}
                readOnly
                className="bg-muted font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(project.id, "Project ID")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-slug">Project Slug</Label>
            <div className="flex items-center gap-2">
              <Input
                id="project-slug"
                value={project.slug}
                readOnly
                className="bg-muted font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(project.slug, "Project Slug")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Used in file URLs and API requests
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Upload Defaults</CardTitle>
          <CardDescription>
            Configure default access and pending upload timeout behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="default-access">Default Access Level</Label>
            <Select
              value={defaultFileAccess}
              onValueChange={(v) =>
                setDefaultFileAccess(v as "public" | "private")
              }
            >
              <SelectTrigger id="default-access" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {defaultFileAccess === "private"
                ? "Files require a signed URL to access"
                : "Files can be accessed directly without authentication"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pending-upload-fail-after-minutes">
              Auto-fail Pending Uploads (minutes)
            </Label>
            <Input
              id="pending-upload-fail-after-minutes"
              type="number"
              min={5}
              max={43200}
              step={1}
              value={pendingUploadFailAfterMinutes}
              onChange={(event) => {
                const nextValue = Number.parseInt(event.target.value, 10);
                if (Number.isNaN(nextValue)) return;
                setPendingUploadFailAfterMinutes(
                  Math.min(43200, Math.max(5, nextValue)),
                );
              }}
              className="w-[200px]"
            />
            <p className="text-muted-foreground text-xs">
              Pending uploads older than this are automatically marked as
              failed.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
