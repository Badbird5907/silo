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
    defaultFileAccess: string;
    imageDeliveryPolicy: string;
    defaultServeImage: boolean;
    preserveImageExif: boolean;
    pendingUploadFailAfterMinutes: number;
  };
  organizationId: string;
}

function parseDefaultFileAccess(value: string): "public" | "private" {
  return value === "public" ? "public" : "private";
}

function parseImageDeliveryPolicy(
  value: string,
): "disabled" | "public_only" | "public_and_private_opt_in" {
  switch (value) {
    case "public_only":
    case "public_and_private_opt_in":
      return value;
    default:
      return "disabled";
  }
}

export function ProjectGeneralSettings({
  project,
  organizationId,
}: ProjectGeneralSettingsProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const initialDefaultFileAccess = React.useMemo(
    () => parseDefaultFileAccess(project.defaultFileAccess),
    [project.defaultFileAccess],
  );
  const [defaultFileAccess, setDefaultFileAccess] = React.useState(
    initialDefaultFileAccess,
  );
  const initialImageDeliveryPolicy = React.useMemo(
    () => parseImageDeliveryPolicy(project.imageDeliveryPolicy),
    [project.imageDeliveryPolicy],
  );
  const [imageDeliveryPolicy, setImageDeliveryPolicy] = React.useState(
    initialImageDeliveryPolicy,
  );
  const [defaultServeImage, setDefaultServeImage] = React.useState(
    project.defaultServeImage,
  );
  const [preserveImageExif, setPreserveImageExif] = React.useState(
    project.preserveImageExif,
  );
  const [pendingUploadFailAfterMinutes, setPendingUploadFailAfterMinutes] =
    React.useState(project.pendingUploadFailAfterMinutes);

  const updateMutation = useMutation(
    trpc.project.update.mutationOptions({
      onSuccess: () => {
        toast.success("Project settings updated", {
          description: "Changes may take a few minutes to propagate",
        });
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
      defaultFileAccess !== initialDefaultFileAccess ||
      imageDeliveryPolicy !== initialImageDeliveryPolicy ||
      defaultServeImage !== project.defaultServeImage ||
      preserveImageExif !== project.preserveImageExif ||
      pendingUploadFailAfterMinutes !== project.pendingUploadFailAfterMinutes
    ) {
      updateMutation.mutate({
        id: project.id,
        organizationId,
        defaultFileAccess,
        imageDeliveryPolicy,
        defaultServeImage,
        preserveImageExif,
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
    defaultFileAccess !== initialDefaultFileAccess ||
    imageDeliveryPolicy !== initialImageDeliveryPolicy ||
    defaultServeImage !== project.defaultServeImage ||
    preserveImageExif !== project.preserveImageExif ||
    pendingUploadFailAfterMinutes !== project.pendingUploadFailAfterMinutes;

  return (
    <div className="flex w-full flex-col gap-6">
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Project Information</CardTitle>
          <CardDescription>
            Basic information about your project
          </CardDescription>
        </CardHeader>
        <CardContent className="flex w-full flex-col gap-4 md:flex-row">
          <div className="flex-1 space-y-2">
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

          <div className="flex-1 space-y-2">
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
          <CardTitle>Upload Settings</CardTitle>
          <CardDescription>
            Some settings related to file uploads and access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            <div className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Upload &amp; access</h3>
                <p className="text-muted-foreground text-xs">
                  How new files are exposed and when stale uploads are cleared.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default-access">Default Access Level</Label>
                <Select
                  value={defaultFileAccess}
                  onValueChange={(v) =>
                    setDefaultFileAccess(v as "public" | "private")
                  }
                >
                  <SelectTrigger id="default-access" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs leading-relaxed">
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
                  className="w-full"
                />
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Pending uploads older than this are automatically marked as
                  failed.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Image CDN</h3>
                <p className="text-muted-foreground text-xs">
                  On-the-fly transforms and metadata for
                  <span className="font-mono"> /i/...</span> URLs.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="image-delivery-policy">Enable Image CDN</Label>
                <Select
                  value={imageDeliveryPolicy}
                  onValueChange={(value) =>
                    setImageDeliveryPolicy(
                      value as
                        | "disabled"
                        | "public_only"
                        | "public_and_private_opt_in",
                    )
                  }
                >
                  <SelectTrigger id="image-delivery-policy" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="public_only">
                      Public files only
                    </SelectItem>
                    <SelectItem value="public_and_private_opt_in">
                      Public + serve image opt-in
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Controls whether transformed image URLs from
                  <span className="font-mono"> /i/...</span> are available.
                </p>
              </div>

              <div className="flex flex-col gap-2 md:flex-row">
                <div className="space-y-2">
                  <Label htmlFor="default-serve-image">
                    Default Serve Image
                  </Label>
                  <Select
                    value={defaultServeImage ? "true" : "false"}
                    onValueChange={(value) =>
                      setDefaultServeImage(value === "true")
                    }
                  >
                    <SelectTrigger id="default-serve-image" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">Disabled</SelectItem>
                      <SelectItem value="true">Enabled</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Used only for private image uploads when the SDK request
                    does not explicitly set{" "}
                    <span className="font-mono">serveImage</span>.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preserve-image-exif">
                    Preserve Image EXIF
                  </Label>
                  <Select
                    value={preserveImageExif ? "true" : "false"}
                    onValueChange={(value) =>
                      setPreserveImageExif(value === "true")
                    }
                  >
                    <SelectTrigger id="preserve-image-exif" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">Strip EXIF</SelectItem>
                      <SelectItem value="true">Preserve EXIF</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Applies to transformed image responses when the chosen
                    output format supports metadata retention.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
            {hasChanges ? (
              <p className="text-muted-foreground text-xs sm:mr-auto sm:text-left">
                You have unsaved changes.
              </p>
            ) : null}
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateMutation.isPending}
              className="shrink-0 sm:min-w-36"
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
