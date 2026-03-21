"use client";

import { useState, useMemo } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, UserMinus, Users } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@silo-storage/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@silo-storage/ui/components/table";

import type { Organization } from "./types";
import { authClient } from "@/auth/client";
import { useTRPC } from "@/trpc/react";
import { Tooltip,TooltipContent,TooltipTrigger } from "@silo-storage/ui/components/tooltip";

export function OrganizationsSettingsCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const activeOrg = authClient.useActiveOrganization();
  const organizationsQuery = authClient.useListOrganizations();
  const organizations = useMemo<Organization[]>(
    () =>
      Array.isArray(organizationsQuery.data)
        ? (organizationsQuery.data as Organization[])
        : [],
    [organizationsQuery.data],
  );

  const [leaveTarget, setLeaveTarget] = useState<Organization | null>(
    null,
  );

  const roleQueries = useQueries({
    queries: organizations.map((organization) =>
      trpc.organization.getMyRole.queryOptions({
        organizationId: organization.id,
      }),
    ),
  });

  const roleByOrgId = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < organizations.length; i += 1) {
      const organization = organizations[i];
      if (!organization) continue;
      map.set(organization.id, roleQueries[i]?.data?.role ?? "member");
    }
    return map;
  }, [organizations, roleQueries]);

  const deprovisionMutation = useMutation(
    trpc.organization.deprovisionMyPersonalEnvironments.mutationOptions({
      onError: () => {
        toast.error("Failed to deprovision personal environments");
      },
    }),
  );

  const leaveOrganizationMutation = useMutation({
    mutationFn: async (organization: Organization) => {
      const role = roleByOrgId.get(organization.id);
      if (role === "owner") {
        throw new Error("Owners cannot leave their own organization");
      }

      const deprovisionResult = await deprovisionMutation.mutateAsync({
        organizationId: organization.id,
      });

      const leaveResult = await authClient.organization.leave({
        organizationId: organization.id,
      });
      if (leaveResult.error) {
        throw new Error(
          leaveResult.error.message ?? "Failed to leave organization",
        );
      }

      return {
        deprovisionedCount: deprovisionResult.deprovisionedCount,
      };
    },
    onSuccess: async ({ deprovisionedCount }, organization) => {
      toast.success(
        deprovisionedCount > 0
          ? `Left organization and deprovisioned ${deprovisionedCount} personal dev environment${deprovisionedCount === 1 ? "" : "s"}`
          : "Left organization",
      );

      const remainingOrgs = organizations.filter(
        (org) => org.id !== organization.id,
      );
      const isLeavingActiveOrg = activeOrg.data?.id === organization.id;

      if (isLeavingActiveOrg) {
        const nextOrg = remainingOrgs[0];
        if (nextOrg) {
          await authClient.organization.setActive({
            organizationId: nextOrg.id,
          });
          window.location.assign(`/${nextOrg.slug}`);
          return;
        }

        await authClient.organization.setActive({ organizationId: null });
        window.location.assign("/");
        return;
      }

      setLeaveTarget(null);
      void organizationsQuery.refetch();
      void queryClient.invalidateQueries();
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message ?? "Failed to leave organization");
    },
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
          <CardDescription>
            Organizations you can access. Leaving an organization deprovisions
            all your personal development environments in that organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((organization) => {
                const isActive = activeOrg.data?.id === organization.id;
                const isLeavingThis =
                  leaveOrganizationMutation.isPending &&
                  leaveTarget?.id === organization.id;
                const role = roleByOrgId.get(organization.id) ?? "member";
                const isOwner = role === "owner";

                return (
                  <TableRow key={organization.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="text-muted-foreground h-4 w-4" />
                        <span className="font-medium">{organization.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {organization.slug}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isOwner ? "secondary" : "outline"}>
                        {role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isActive ? (
                        <Badge>
                          <Check className="mr-1 h-3 w-3" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline">Member</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isOwner ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setLeaveTarget(organization);
                          }}
                          disabled={isLeavingThis || isOwner}
                        >
                          {isLeavingThis ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <UserMinus className="mr-2 h-4 w-4" />
                          )}
                          Leave
                        </Button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            <Button variant="destructive" size="sm" disabled>
                              <UserMinus className="mr-2 h-4 w-4" />
                              Leave
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Owners cannot leave their own organization
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={!!leaveTarget}
        onOpenChange={(open) => !open && setLeaveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave organization?</DialogTitle>
            <DialogDescription>
              {leaveTarget
                ? `You are about to leave ${leaveTarget.name}. This also deprovisions all personal development environments you own in this organization.`
                : "You are about to leave this organization."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLeaveTarget(null)}
              disabled={leaveOrganizationMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!leaveTarget) return;
                leaveOrganizationMutation.mutate(leaveTarget);
              }}
              disabled={leaveOrganizationMutation.isPending}
            >
              {leaveOrganizationMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Leave and Deprovision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
