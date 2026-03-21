"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Github, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@silo-storage/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@silo-storage/ui/components/card";

import type { LinkedAccount } from "./types";
import { authClient } from "@/auth/client";

export function OAuthAccountsCard() {
  const [isSocialRedirectPending, setIsSocialRedirectPending] =
    React.useState(false);

  const accountsQuery = useQuery({
    queryKey: ["settings", "accounts"],
    queryFn: async () => {
      const result = await authClient.listAccounts();
      if ("error" in result && result.error) {
        throw new Error(result.error.message ?? "Failed to list accounts");
      }
      return result.data as LinkedAccount[];
    },
  });

  const unlinkGithubMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.unlinkAccount({ providerId: "github" });
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to unlink GitHub");
      }
    },
    onSuccess: () => {
      toast.success("GitHub account unlinked");
      void accountsQuery.refetch();
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message ?? "Failed to unlink GitHub");
    },
  });

  const linkedAccounts = accountsQuery.data ?? [];
  const githubAccount = linkedAccounts.find(
    (account) => account.providerId === "github",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>OAuth Accounts</CardTitle>
        <CardDescription>
          Link or unlink social sign-in providers for your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex items-center gap-3">
            <Github className="h-5 w-5" />
            <div>
              <p className="text-sm font-medium">GitHub</p>
              <p className="text-muted-foreground text-xs">
                {githubAccount ? "Connected" : "Not connected"}
              </p>
            </div>
          </div>
          {githubAccount ? (
            <Button
              variant="outline"
              onClick={() => unlinkGithubMutation.mutate()}
              disabled={unlinkGithubMutation.isPending}
            >
              {unlinkGithubMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="mr-2 h-4 w-4" />
              )}
              Unlink
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={async () => {
                setIsSocialRedirectPending(true);
                const result = await authClient.linkSocial({
                  provider: "github",
                  callbackURL: "/settings",
                });
                if (result.error) {
                  setIsSocialRedirectPending(false);
                  toast.error(result.error.message ?? "Failed to link GitHub");
                }
              }}
              disabled={isSocialRedirectPending}
            >
              {isSocialRedirectPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Link GitHub
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
