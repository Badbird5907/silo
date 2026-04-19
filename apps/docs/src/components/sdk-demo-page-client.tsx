"use client";

import type { AppFileRouter } from "@/lib/sdk-demo/file-router";
import type { RouterConfig } from "@silo-storage/sdk-server";
import * as React from "react";
import {
  ClerkLoaded,
  ClerkLoading,
  Show,
  UserButton,
} from "@clerk/nextjs";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@silo-storage/ui/components/card";

import { SdkUploadDemo } from "@/components/sdk-upload-demo";
import { SiloRouterConfigProvider } from "@/lib/sdk-demo/upload";
import { CodeDemo } from "./code-demo";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./ui/resizable";
import { Skeleton } from "./ui/skeleton";

interface SdkDemoPageClientProps {
  missingClerkVars: string[];
  missingSiloVars: string[];
  routerConfig?: RouterConfig<AppFileRouter> | null;
}

function DemoPanels({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <>
      <div className="grid gap-6 lg:hidden">
        <div className="min-w-0">{left}</div>
        <div className="min-w-0">{right}</div>
      </div>
      <div className="hidden lg:block">
        <ResizablePanelGroup orientation="horizontal" className="min-w-0">
          <ResizablePanel defaultSize={"60%"}>
            <div className="min-w-0">{left}</div>
          </ResizablePanel>
          <ResizableHandle className="mx-4" />
          <ResizablePanel defaultSize={"40%"}>
            <div className="min-w-0">{right}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );
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
        <ul className="text-fd-muted-foreground list-disc space-y-1 ps-5 text-sm">
          {vars.map((value) => (
            <li key={value}>
              <code className="break-all">{value}</code>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SdkDemoPageSkeleton() {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <h1 className="text-2xl font-bold">SDK Demo</h1>
        <Skeleton className="size-9 shrink-0 rounded-full" aria-hidden />
      </div>
      <DemoPanels
        left={
          <div className="not-prose grid gap-6">
            <Skeleton className="h-36 w-full rounded-xl" aria-hidden />
            <Card>
              <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-40" aria-hidden />
                <Skeleton className="h-4 w-56" aria-hidden />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-24 w-full rounded-lg" aria-hidden />
                <Skeleton className="h-24 w-full rounded-lg" aria-hidden />
              </CardContent>
            </Card>
          </div>
        }
        right={
          <div className="flex min-h-0 flex-col lg:h-full lg:min-h-88">
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-28" aria-hidden />
                <Skeleton className="h-4 w-full max-w-sm" aria-hidden />
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-3 pt-0">
                <Skeleton className="h-9 w-full shrink-0" aria-hidden />
                <Skeleton
                  className="min-h-48 w-full flex-1 rounded-md"
                  aria-hidden
                />
              </CardContent>
            </Card>
          </div>
        }
      />
    </div>
  );
}

function SdkDemoPageLoadedBody({
  siloConfigured,
  missingSiloVars,
  routerConfig,
}: {
  siloConfigured: boolean;
  missingSiloVars: string[];
  routerConfig?: RouterConfig<AppFileRouter> | null;
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <h1 className="text-2xl font-bold">SDK Demo</h1>

        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>
      <DemoPanels
        left={
          siloConfigured && routerConfig ? (
            <SiloRouterConfigProvider routerConfig={routerConfig}>
              <SdkUploadDemo />
            </SiloRouterConfigProvider>
          ) : (
            <MissingConfigCard
              title="Silo env is not configured for uploads"
              description="Auth is available, but the upload route and file listing APIs need these values."
              vars={missingSiloVars}
            />
          )
        }
        right={<CodeDemo />}
      />
    </div>
  );
}

function SdkDemoPageInner({
  siloConfigured,
  missingSiloVars,
  routerConfig,
}: {
  siloConfigured: boolean;
  missingSiloVars: string[];
  routerConfig?: RouterConfig<AppFileRouter> | null;
}) {
  return (
    <div className="min-w-0 px-4 py-6 sm:px-6">
      <ClerkLoading>
        <SdkDemoPageSkeleton />
      </ClerkLoading>
      <ClerkLoaded>
        <SdkDemoPageLoadedBody
          siloConfigured={siloConfigured}
          missingSiloVars={missingSiloVars}
          routerConfig={routerConfig}
        />
      </ClerkLoaded>
    </div>
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
      <SdkDemoPageInner
        siloConfigured={Boolean(siloConfigured)}
        missingSiloVars={missingSiloVars}
        routerConfig={routerConfig}
      />
    </QueryClientProvider>
  );
}
