"use client";

import { Skeleton } from "@silo-storage/ui/components/skeleton";

import { authClient } from "@/auth/client";
import {
  AuthenticationSettingsCard,
  InvitationsSettingsCard,
  OAuthAccountsCard,
  OrganizationsSettingsCard,
  ProfileSettingsCard,
} from "@/components/user-settings";

export default function SettingsPage() {
  const session = authClient.useSession();
  const user = session.data?.user;

  if (session.isPending) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4">
        <p className="text-muted-foreground text-sm">
          You must be signed in to view settings.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <ProfileSettingsCard user={user} />
      <AuthenticationSettingsCard />
      <OAuthAccountsCard />
      <OrganizationsSettingsCard />
      <InvitationsSettingsCard />
    </div>
  );
}
