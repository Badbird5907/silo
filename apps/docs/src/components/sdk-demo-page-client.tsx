"use client";

import * as React from "react";
import type { RouterConfig } from "@silo-storage/sdk-server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SdkUploadDemo } from "@/components/sdk-upload-demo";
import type { AppFileRouter } from "@/lib/sdk-demo/file-router";
import { SiloRouterConfigProvider } from "@/lib/sdk-demo/upload";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@silo-storage/ui/components/card";

interface SdkDemoPageClientProps {
  missingClerkVars: string[];
  missingSiloVars: string[];
  routerConfig?: RouterConfig<AppFileRouter> | null;
}

function MissingConfigCard({
  title,
  description,
  vars,
}: {
  title: string;
  description: string;
  vars: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 ps-5 text-sm text-fd-muted-foreground">
          {vars.map((value) => (
            <li key={value}>
              <code>{value}</code>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function SdkDemoPageClient({
  missingClerkVars,
  missingSiloVars,
  routerConfig,
}: SdkDemoPageClientProps) {
  const [queryClient] = React.useState(() => new QueryClient());
  const siloConfigured = missingSiloVars.length === 0 && routerConfig;

  if (missingClerkVars.length > 0) {
    return (
      <div className="my-8 grid gap-6">
        <MissingConfigCard
          title="Clerk is not configured for the SDK demo"
          description="Add the missing Clerk keys before the embedded auth flow can render."
          vars={missingClerkVars}
        />
        {missingSiloVars.length > 0 ? (
          <MissingConfigCard
            title="Silo upload env is also missing"
            description="The upload part of the demo depends on these server/client Silo values."
            vars={missingSiloVars}
          />
        ) : null}
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="my-8">
        {siloConfigured ? (
          <SiloRouterConfigProvider routerConfig={routerConfig}>
            <SdkUploadDemo />
          </SiloRouterConfigProvider>
        ) : (
          <MissingConfigCard
            title="Silo env is not configured for uploads"
            description="Auth is available, but the upload route and file listing APIs need these values."
            vars={missingSiloVars}
          />
        )}
      </div>
    </QueryClientProvider>
  );
}
