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

  const content = !hasClerkDemoConfig() ? (
    <SdkDemoPageClient
      missingClerkVars={missingClerkVars}
      missingSiloVars={missingSiloVars}
    />
  ) : (
    <ClerkProvider>
      <SdkDemoPageClient
        missingClerkVars={missingClerkVars}
        missingSiloVars={missingSiloVars}
        routerConfig={
          hasSiloDemoConfig() ? extractRouterConfig(fileRouter) : null
        }
      />
    </ClerkProvider>
  );

  return (
    <article className="mx-auto w-full max-w-[1168px] [grid-area:main]">
      {content}
    </article>
  );
}
