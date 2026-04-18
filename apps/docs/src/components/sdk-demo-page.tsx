import { ClerkProvider } from "@clerk/nextjs";
import { extractRouterConfig } from "@silo-storage/sdk-server";

import { SdkDemoPageClient } from "@/components/sdk-demo-page-client";
import { fileRouter } from "@/lib/sdk-demo/file-router";
import {
  getMissingClerkVars,
  getMissingSiloVars,
  hasClerkDemoConfig,
  hasSiloDemoConfig,
} from "@/lib/sdk-demo/config";

export function SdkDemoPage() {
  const missingClerkVars = getMissingClerkVars();
  const missingSiloVars = getMissingSiloVars();

  if (!hasClerkDemoConfig()) {
    return (
      <SdkDemoPageClient
        missingClerkVars={missingClerkVars}
        missingSiloVars={missingSiloVars}
      />
    );
  }

  const routerConfig = hasSiloDemoConfig()
    ? extractRouterConfig(fileRouter)
    : null;

  return (
    <ClerkProvider>
      <SdkDemoPageClient
        missingClerkVars={missingClerkVars}
        missingSiloVars={missingSiloVars}
        routerConfig={routerConfig}
      />
    </ClerkProvider>
  );
}
