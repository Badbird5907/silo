"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@silo-storage/ui/components/avatar";
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

function getInitials(name?: string) {
  if (!name) return "U";
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ProfileSettingsCard({
  user,
}: {
  user: { name: string; email: string; image?: string | null };
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(user.name);
  const [image, setImage] = React.useState(user.image ?? "");

  React.useEffect(() => {
    setName(user.name);
    setImage(user.image ?? "");
  }, [user.image, user.name]);

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.updateUser({
        name: name.trim(),
        image: image.trim() || undefined,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to update profile");
      }
    },
    onSuccess: () => {
      toast.success("Profile updated");
      void queryClient.invalidateQueries();
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message ?? "Failed to update profile");
    },
  });

  const hasChanges =
    name.trim() !== user.name || image.trim() !== user.image;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your personal information.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={image !== "" ? image : user.image ?? undefined} />
            <AvatarFallback>{getInitials(name || user.name)}</AvatarFallback>
          </Avatar>
          <div className="text-sm">
            <p className="font-medium">{user.email}</p>
            <p className="text-muted-foreground">
              Your account email cannot be changed here.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="settings-name">Display name</Label>
            <Input
              id="settings-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-avatar">Avatar URL</Label>
            <Input
              id="settings-avatar"
              value={image}
              onChange={(event) => setImage(event.target.value)}
              placeholder="https://example.com/avatar.png"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => updateProfileMutation.mutate()}
            disabled={!hasChanges || updateProfileMutation.isPending}
          >
            {updateProfileMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save Profile
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
