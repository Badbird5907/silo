"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { useDebounce } from "use-debounce";

import {
  sanitizeForSlug,
  validateProjectSlug,
} from "@silo-storage/shared/slug";
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

function normalizeSlugInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/--+/g, "-");
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onSubmit?: (data: { name: string; slug: string }) => void | Promise<void>;
  isLoading?: boolean;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  organizationId,
  onSubmit,
  isLoading,
}: CreateProjectDialogProps) {
  const trpc = useTRPC();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = React.useState(false);
  const [debouncedSlug] = useDebounce(slug, 400);

  const slugValidation = React.useMemo(() => validateProjectSlug(slug), [slug]);

  const shouldCheckSlug =
    open && !!organizationId && !!debouncedSlug && slugValidation.valid;

  const slugCheckQuery = useQuery(
    trpc.project.checkSlug.queryOptions(
      {
        organizationId,
        slug: debouncedSlug,
      },
      {
        enabled: shouldCheckSlug,
      },
    ),
  );

  const slugStatus = React.useMemo<
    "idle" | "checking" | "available" | "taken" | "invalid" | "reserved"
  >(() => {
    if (!slug) return "idle";

    if (!slugValidation.valid) {
      if (slugValidation.error?.includes("reserved")) {
        return "reserved";
      }

      return "invalid";
    }

    if (slug !== debouncedSlug) {
      return "checking";
    }

    if (slugCheckQuery.isLoading || slugCheckQuery.isFetching) {
      return "checking";
    }

    if (!slugCheckQuery.data) {
      return "idle";
    }

    if (slugCheckQuery.data.available) {
      return "available";
    }

    return slugCheckQuery.data.reason;
  }, [
    debouncedSlug,
    slug,
    slugCheckQuery.data,
    slugCheckQuery.isFetching,
    slugCheckQuery.isLoading,
    slugValidation.error,
    slugValidation.valid,
  ]);

  const handleNameChange = (value: string) => {
    setName(value);

    if (!isSlugManuallyEdited) {
      setSlug(sanitizeForSlug(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setIsSlugManuallyEdited(true);
    setSlug(normalizeSlugInput(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && slug.trim() && slugStatus === "available") {
      await onSubmit?.({
        name: name.trim(),
        slug: slug.trim(),
      });
      setName("");
      setSlug("");
      setIsSlugManuallyEdited(false);
      onOpenChange(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setName("");
      setSlug("");
      setIsSlugManuallyEdited(false);
    }
    onOpenChange(newOpen);
  };

  const canSubmit =
    !!name.trim() && !!slug.trim() && slugStatus === "available" && !isLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Create a new project to organize your files and storage.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Project"
                autoComplete="off"
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="project-slug">Project slug</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="project-slug"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="my-project"
                  autoComplete="off"
                  disabled={isLoading}
                />
                {slugStatus === "checking" && (
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                )}
                {slugStatus === "available" && (
                  <Check className="h-4 w-4 text-green-500" />
                )}
                {(slugStatus === "taken" ||
                  slugStatus === "invalid" ||
                  slugStatus === "reserved") && (
                  <X className="h-4 w-4 text-red-500" />
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                This will be used for project lookups and public API scoping.
              </p>
              {slugStatus === "taken" && (
                <p className="text-xs text-red-500">
                  This slug is already taken
                </p>
              )}
              {slugStatus === "reserved" && (
                <p className="text-xs text-red-500">This slug is reserved</p>
              )}
              {slugStatus === "invalid" && (
                <p className="text-xs text-red-500">
                  Slug must be 3-63 characters and contain only lowercase
                  letters, numbers, and hyphens
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isLoading ? "Creating..." : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
