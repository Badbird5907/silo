"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  MoreHorizontal,
  Shield,
  ShieldCheck,
  User,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@silo-storage/ui/components/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@silo-storage/ui/components/dropdown-menu";
import { Skeleton } from "@silo-storage/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@silo-storage/ui/components/table";

import { authClient } from "@/auth/client";
import { useTRPC } from "@/trpc/react";
import { InviteMemberDialog } from "./invite-member-dialog";

interface MembersListProps {
  organizationId: string;
  currentUserId: string;
  currentUserRole: string;
  canEdit: boolean;
}

function getRoleBadgeVariant(role: string) {
  switch (role) {
    case "owner":
      return "default";
    case "admin":
      return "secondary";
    default:
      return "outline";
  }
}

function getRoleIcon(role: string) {
  switch (role) {
    case "owner":
      return ShieldCheck;
    case "admin":
      return Shield;
    default:
      return User;
  }
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function MembersList({
  organizationId,
  currentUserId,
  currentUserRole,
  canEdit,
}: MembersListProps) {
  const trpc = useTRPC();

  const membersQuery = useQuery(
    trpc.organization.getMembers.queryOptions({ organizationId }),
  );

  const removeMemberMutation = useMutation({
    mutationFn: async (memberIdOrEmail: string) => {
      const result = await authClient.organization.removeMember({
        memberIdOrEmail,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to remove member");
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Member removed successfully");
      void membersQuery.refetch();
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message ?? "Failed to remove member");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: string;
    }) => {
      const result = await authClient.organization.updateMemberRole({
        memberId,
        role: role as "admin" | "member",
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to update role");
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Role updated successfully");
      void membersQuery.refetch();
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message ?? "Failed to update role");
    },
  });

  const canManageMember = (memberRole: string, memberUserId: string) => {
    if (memberUserId === currentUserId) return false;
    if (memberRole === "owner") return false;
    if (!["owner", "admin"].includes(currentUserRole)) return false;
    if (currentUserRole === "admin" && memberRole === "admin") return false;
    return canEdit;
  };

  if (membersQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            People who have access to this organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const members = membersQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle>Members</CardTitle>
            <CardDescription>
              People who have access to this organization ({members.length}{" "}
              {members.length === 1 ? "member" : "members"})
            </CardDescription>
          </div>
          {canEdit && (
            <InviteMemberDialog
              organizationId={organizationId}
              onInvited={() => membersQuery.refetch()}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              {canEdit && <TableHead className="w-[50px]"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const RoleIcon = getRoleIcon(member.role);
              const canManage = canManageMember(member.role, member.user.id);

              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.user.image ?? undefined} />
                        <AvatarFallback>
                          {getInitials(member.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {member.user.name}
                          {member.user.id === currentUserId && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {member.user.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(member.role)}>
                      <RoleIcon className="mr-1 h-3 w-3" />
                      {member.role.charAt(0).toUpperCase() +
                        member.role.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {member.role === "member" &&
                              currentUserRole === "owner" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateRoleMutation.mutate({
                                      memberId: member.id,
                                      role: "admin",
                                    })
                                  }
                                >
                                  <Shield className="mr-2 h-4 w-4" />
                                  Make Admin
                                </DropdownMenuItem>
                              )}
                            {member.role === "admin" &&
                              currentUserRole === "owner" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    updateRoleMutation.mutate({
                                      memberId: member.id,
                                      role: "member",
                                    })
                                  }
                                >
                                  <User className="mr-2 h-4 w-4" />
                                  Make Member
                                </DropdownMenuItem>
                              )}
                            <DropdownMenuItem
                              onClick={() =>
                                removeMemberMutation.mutate(member.id)
                              }
                              className="text-red-600"
                            >
                              <UserMinus className="mr-2 h-4 w-4" />
                              Remove from Organization
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
