"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserCircle2 } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@silo-storage/ui/components/table";

import type { UserInvitation } from "./types";
import { authClient } from "@/auth/client";

function formatExpiration(value?: string | Date) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString();
}

export function InvitationsSettingsCard() {
  const queryClient = useQueryClient();

  const invitationsQuery = useQuery({
    queryKey: ["settings", "invitations"],
    queryFn: async () => {
      const result = await authClient.organization.listUserInvitations();
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to list invitations");
      }
      return result.data as UserInvitation[];
    },
  });

  const acceptInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to accept invitation");
      }
    },
    onSuccess: () => {
      toast.success("Invitation accepted");
      void invitationsQuery.refetch();
      void queryClient.invalidateQueries();
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message ?? "Failed to accept invitation");
    },
  });

  const rejectInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await authClient.organization.rejectInvitation({
        invitationId,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to decline invitation");
      }
    },
    onSuccess: () => {
      toast.success("Invitation declined");
      void invitationsQuery.refetch();
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message ?? "Failed to decline invitation");
    },
  });

  const pendingInvitations = invitationsQuery.data ?? [];
  if (pendingInvitations.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitations</CardTitle>
        <CardDescription>
          Accept or decline pending organization invitations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingInvitations.map((invitation) => {
              const accepting =
                acceptInvitationMutation.isPending &&
                acceptInvitationMutation.variables === invitation.id;
              const declining =
                rejectInvitationMutation.isPending &&
                rejectInvitationMutation.variables === invitation.id;

              return (
                <TableRow key={invitation.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserCircle2 className="text-muted-foreground h-4 w-4" />
                      <span className="font-medium">
                        {invitation.organizationName ??
                          invitation.organizationId ??
                          "Organization"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {invitation.role ?? "member"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatExpiration(invitation.expiresAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          rejectInvitationMutation.mutate(invitation.id)
                        }
                        disabled={accepting || declining}
                      >
                        {declining && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          acceptInvitationMutation.mutate(invitation.id)
                        }
                        disabled={accepting || declining}
                      >
                        {accepting && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Accept
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
