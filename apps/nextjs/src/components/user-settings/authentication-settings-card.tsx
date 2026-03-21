"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { Switch } from "@silo-storage/ui/components/switch";

import { authClient } from "@/auth/client";

export function AuthenticationSettingsCard() {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [revokeOtherSessions, setRevokeOtherSessions] = React.useState(true);

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to change password");
      }
    },
    onSuccess: () => {
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message ?? "Failed to change password");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authentication</CardTitle>
        <CardDescription>
          Change your password and secure your active sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Current password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
              minLength={8}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Revoke other sessions</p>
            <p className="text-muted-foreground text-xs">
              Sign out all your other devices after changing password.
            </p>
          </div>
          <Switch
            checked={revokeOtherSessions}
            onCheckedChange={setRevokeOtherSessions}
          />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => changePasswordMutation.mutate()}
            disabled={
              !currentPassword ||
              !newPassword ||
              newPassword.length < 8 ||
              changePasswordMutation.isPending
            }
          >
            {changePasswordMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Update Password
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
