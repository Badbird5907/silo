"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Copy,
  Image,
  Info,
  Loader2,
  Save,
  Shield,
  Upload,
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
import { Input } from "@silo-storage/ui/components/input";
import { Label } from "@silo-storage/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@silo-storage/ui/components/select";
import { Separator } from "@silo-storage/ui/components/separator";
import { Switch } from "@silo-storage/ui/components/switch";

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
    auditLogRetentionDays: number;
    usageEventRetentionDays: number;
    auditLogDownloadPolicy: string;
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

function parseAuditLogDownloadPolicy(
  value: string,
): "disabled" | "always" | "signed_only" {
  switch (value) {
    case "always":
    case "signed_only":
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
  const [auditLogRetentionDays, setAuditLogRetentionDays] = React.useState(
    project.auditLogRetentionDays,
  );
  const [usageEventRetentionDays, setUsageEventRetentionDays] = React.useState(
    project.usageEventRetentionDays,
  );
  const initialAuditLogDownloadPolicy = React.useMemo(
    () => parseAuditLogDownloadPolicy(project.auditLogDownloadPolicy),
    [project.auditLogDownloadPolicy],
  );
  const [auditLogDownloadPolicy, setAuditLogDownloadPolicy] = React.useState(
    initialAuditLogDownloadPolicy,
  );

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
        void queryClient.invalidateQueries({
          queryKey: trpc.project.getBySlug.queryKey({
            slug: project.slug,
            organizationId,
          }),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.project.list.queryKey({
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
      pendingUploadFailAfterMinutes !== project.pendingUploadFailAfterMinutes ||
      auditLogRetentionDays !== project.auditLogRetentionDays ||
      usageEventRetentionDays !== project.usageEventRetentionDays ||
      auditLogDownloadPolicy !== initialAuditLogDownloadPolicy
    ) {
      updateMutation.mutate({
        id: project.id,
        organizationId,
        defaultFileAccess,
        imageDeliveryPolicy,
        defaultServeImage,
        preserveImageExif,
        pendingUploadFailAfterMinutes,
        auditLogRetentionDays,
        usageEventRetentionDays,
        auditLogDownloadPolicy,
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
    pendingUploadFailAfterMinutes !== project.pendingUploadFailAfterMinutes ||
    auditLogRetentionDays !== project.auditLogRetentionDays ||
    usageEventRetentionDays !== project.usageEventRetentionDays ||
    auditLogDownloadPolicy !== initialAuditLogDownloadPolicy;

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Project Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4" /> Project Information
          </CardTitle>
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

      {/* Upload & Access */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload & Access
          </CardTitle>
          <CardDescription>
            How new files are exposed and when stale uploads are cleared.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
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
                  <SelectItem value="private">
                    <div className="flex items-center gap-2">
                      <Shield className="text-muted-foreground h-3.5 w-3.5" />
                      Private
                    </div>
                  </SelectItem>
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
                Auto-fail Pending Uploads
              </Label>
              <div className="relative">
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
                  className="w-full pr-16"
                />
                <span className="text-muted-foreground pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                  minutes
                </span>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Pending uploads older than this are automatically marked as
                failed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Image CDN */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-4 w-4" /> Image CDN
          </CardTitle>
          <CardDescription>
            On-the-fly transforms and metadata for
            <code className="bg-muted mx-1 rounded px-1 py-0.5 text-xs">
              /i/...
            </code>
            URLs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="image-delivery-policy">Delivery Policy</Label>
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
              <SelectTrigger id="image-delivery-policy" className="w-full sm:max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="public_only">Public files only</SelectItem>
                <SelectItem value="public_and_private_opt_in">
                  Public + serve image opt-in
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Controls whether transformed image URLs from
              <code className="bg-muted mx-1 rounded px-1 py-0.5 text-xs">
                /i/...
              </code>
              are available.
            </p>
          </div>

          {imageDeliveryPolicy !== "disabled" && (
            <>
              <Separator />
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                  <div className="space-y-1">
                    <Label
                      htmlFor="default-serve-image"
                      className="text-sm font-medium"
                    >
                      Default Serve Image
                    </Label>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      Used only for private image uploads when the SDK request
                      does not explicitly set{" "}
                      <code className="bg-muted rounded px-1 py-0.5 text-xs">
                        serveImage
                      </code>
                      .
                    </p>
                  </div>
                  <Switch
                    id="default-serve-image"
                    checked={defaultServeImage}
                    onCheckedChange={setDefaultServeImage}
                  />
                </div>

                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                  <div className="space-y-1">
                    <Label
                      htmlFor="preserve-image-exif"
                      className="text-sm font-medium"
                    >
                      Preserve Image EXIF
                    </Label>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      Applies to transformed image responses when the chosen
                      output format supports metadata retention.
                    </p>
                  </div>
                  <Switch
                    id="preserve-image-exif"
                    checked={preserveImageExif}
                    onCheckedChange={setPreserveImageExif}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Audit & Retention */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Audit & Retention
          </CardTitle>
          <CardDescription>
            Control download auditing and how long raw event data is kept.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="audit-log-download-policy">
              Download Audit Policy
            </Label>
            <Select
              value={auditLogDownloadPolicy}
              onValueChange={(value) =>
                setAuditLogDownloadPolicy(
                  value as "disabled" | "always" | "signed_only",
                )
              }
            >
              <SelectTrigger
                id="audit-log-download-policy"
                className="w-full sm:max-w-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="always">Always log</SelectItem>
                <SelectItem value="signed_only">Signed URLs only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Controls whether file and image downloads are written to the
              audit log.
            </p>
            {auditLogDownloadPolicy === "always" && (
              <Badge variant="outline" className="border-orange-500/30 text-orange-500">
                Not recommended for high-traffic files
              </Badge>
            )}
          </div>

          <Separator />

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="audit-log-retention-days">
                Audit Log Retention
              </Label>
              <div className="relative">
                <Input
                  id="audit-log-retention-days"
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  value={auditLogRetentionDays}
                  onChange={(event) => {
                    const nextValue = Number.parseInt(
                      event.target.value,
                      10,
                    );
                    if (Number.isNaN(nextValue)) return;
                    setAuditLogRetentionDays(
                      Math.min(3650, Math.max(1, nextValue)),
                    );
                  }}
                  className="w-full pr-12"
                />
                <span className="text-muted-foreground pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                  days
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="usage-event-retention-days">
                Usage Event Retention
              </Label>
              <div className="relative">
                <Input
                  id="usage-event-retention-days"
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  value={usageEventRetentionDays}
                  onChange={(event) => {
                    const nextValue = Number.parseInt(
                      event.target.value,
                      10,
                    );
                    if (Number.isNaN(nextValue)) return;
                    setUsageEventRetentionDays(
                      Math.min(3650, Math.max(1, nextValue)),
                    );
                  }}
                  className="w-full pr-12"
                />
                <span className="text-muted-foreground pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                  days
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Floating save bar */}
      <div
        className={`bg-background fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-4 py-2 shadow-lg transition-all duration-300 ease-out ${
          hasChanges
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        }`}
      >
        <span className="text-muted-foreground text-sm">
          Unsaved changes
        </span>
        <div className="bg-border mx-1 h-4 w-px" />
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          size="sm"
        >
          {updateMutation.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
