"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@silo-storage/ui/components/card";

import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { Button } from "@silo-storage/ui/components/button";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { useRouter } from "next/navigation";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@silo-storage/ui/components/dialog";
import { Input } from "@silo-storage/ui/components/input";

export function DangerZone({ projectId, organizationId, orgSlug }: { projectId: string, organizationId: string, orgSlug: string }) {
  const router = useRouter();
  const { isLoading, hasPermission } = useOrganizationPermission({
    project: ["delete"],
  });

  const trpc = useTRPC();
  const deleteMutation = useMutation(
    trpc.project.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Project deleted successfully");
        router.push(`/${orgSlug}`);
      },
    }),
  );

  const str = "Delete my project including all files and data";
  const [confirmationText, setConfirmationText] = useState("");
  const allowDelete = confirmationText === str;
  if (isLoading || !hasPermission) {
    return null;
  }

  return (
    <Card className="w-full bg-destructive/10 border-destructive/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions for this project
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete this project</p>
              <p className="text-muted-foreground text-sm">
                Permanently delete this project and all associated data
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4" />
                  Delete Project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Project</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete this project? This action cannot be undone.
                    <br />
                    Please type <strong>{str}</strong> to confirm.
                  </DialogDescription>
                  <Input type="text" placeholder={str} value={confirmationText} onChange={(e) => setConfirmationText(e.target.value)} />
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button variant="destructive" onClick={() => deleteMutation.mutate({ id: projectId, organizationId })} disabled={!allowDelete || deleteMutation.isPending}>
                    <Trash2 className="h-4 w-4" />
                    {deleteMutation.isPending ? "Deleting..." : "Delete Project"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 