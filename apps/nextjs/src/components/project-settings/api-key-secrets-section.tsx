"use client";

import { ChevronDown } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@silo-storage/ui/components/collapsible";

import {
  EnvironmentVariableRow,
  SiloEnvSnippetSection,
} from "@/components/project-settings/env-vars";

interface ApiKeySecretsSectionProps {
  siloToken: string | null;
  apiKey: string | null;
  signingSecret: string | null;
  apiKeyCopied: boolean;
  signingSecretCopied: boolean;
  onCopyApiKey: () => void | Promise<void>;
  onCopySigningSecret: () => void | Promise<void>;
}

export function ApiKeySecretsSection({
  siloToken,
  apiKey,
  signingSecret,
  apiKeyCopied,
  signingSecretCopied,
  onCopyApiKey,
  onCopySigningSecret,
}: ApiKeySecretsSectionProps) {
  return (
    <>
      {siloToken ? (
        <SiloEnvSnippetSection siloToken={siloToken} />
      ) : (
        <div className="space-y-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">No SDK token</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            SILO_TOKEN could not be generated. Delete this key and create a new
            one scoped to an environment.
          </p>
        </div>
      )}

      <Collapsible className="min-w-0">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group bg-muted/30 hover:bg-muted/50 flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors"
          >
            <span className="min-w-0">
              <span className="font-medium">HTTP API</span>
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                API key &amp; signing secret
              </span>
            </span>
            <ChevronDown
              className="text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          <EnvironmentVariableRow
            label="API key"
            value={apiKey}
            copied={apiKeyCopied}
            onCopy={() => void onCopyApiKey()}
            codeClassName="text-sm"
          />
          {signingSecret ? (
            <EnvironmentVariableRow
              label="Signing secret"
              value={signingSecret}
              copied={signingSecretCopied}
              onCopy={() => void onCopySigningSecret()}
              codeClassName="text-sm"
              description="Use to self-sign upload URLs from your server without calling the upload endpoint."
            />
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
