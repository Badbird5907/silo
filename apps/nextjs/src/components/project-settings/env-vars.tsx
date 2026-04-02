"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@silo-storage/ui/components/button";
import { Label } from "@silo-storage/ui/components/label";
import { Tabs, TabsList, TabsTrigger } from "@silo-storage/ui/components/tabs";
import { cn } from "@silo-storage/ui/lib/utils";
import { env } from "@/env";

export type SiloEnvFramework = "next" | "vite" | "generic";

export function siloEnvSnippet(
  siloToken: string,
  framework: SiloEnvFramework = "generic",
): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const cdn = env.SILO_CDN.endsWith("/") ? env.SILO_CDN.substring(0, env.SILO_CDN.length - 1) : env.SILO_CDN;
  // return `${keys.url}=${origin}\n${keys.cdn}=${cdn}\n${keys.token}=${siloToken}`;
  let cdnPrefix = "";
  if (framework === "next") {
    cdnPrefix = "NEXT_PUBLIC_";
  } else if (framework === "vite") {
    cdnPrefix = "VITE_";
  }
  return `SILO_URL=${origin}\n${cdnPrefix}SILO_CDN=${cdn}\nSILO_TOKEN=${siloToken}`;
}

export interface EnvironmentVariableRowProps {
  label: string;
  value: string | null;
  copied: boolean;
  onCopy: () => void;
  codeClassName?: string;
  description?: ReactNode;
}

export function EnvironmentVariableRow({
  label,
  value,
  copied,
  onCopy,
  codeClassName = "text-xs",
  description,
}: EnvironmentVariableRowProps) {
  return (
    <div className="min-w-0 space-y-2">
      <Label>{label}</Label>
      <div className="flex min-w-0 items-center gap-2">
        <code
          className={cn(
            "bg-muted max-w-full min-w-0 flex-1 overflow-x-auto rounded-md border px-3 py-2 font-mono text-xs whitespace-pre wrap-normal",
            codeClassName,
          )}
        >
          {value}
        </code>
        <Button variant="outline" size="icon" onClick={onCopy} className="shrink-0">
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
      {description ? (
        <div className="text-muted-foreground text-xs">{description}</div>
      ) : null}
    </div>
  );
}

export interface SiloEnvVarsPanelProps {
  label: string;
  showLabel?: boolean;
  framework?: SiloEnvFramework;
  siloToken: string;
  copied: boolean;
  onCopy: () => void;
  buttonClassName?: string;
  preClassName?: string;
}

export function SiloEnvVarsPanel({
  label,
  showLabel = true,
  framework = "generic",
  siloToken,
  copied,
  onCopy,
  buttonClassName,
  preClassName,
}: SiloEnvVarsPanelProps) {
  return (
    <div className="min-w-0 space-y-2">
      {showLabel ? <Label>{label}</Label> : null}
      <pre
        className={cn(
          "bg-muted max-h-[min(40vh,260px)] max-w-full overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed whitespace-pre",
          preClassName,
        )}
      >
        {siloEnvSnippet(siloToken, framework)}
      </pre>
      <Button
        variant="outline"
        onClick={() => void onCopy()}
        className={buttonClassName}
      >
        {copied ? (
          <>
            <Check className="mr-2 h-4 w-4 text-green-500" />
            Copied
          </>
        ) : (
          <>
            <Copy className="mr-2 h-4 w-4" />
            Copy env snippet
          </>
        )}
      </Button>
    </div>
  );
}

export interface SiloEnvSnippetSectionProps {
  siloToken: string;
}

export function SiloEnvSnippetSection({ siloToken }: SiloEnvSnippetSectionProps) {
  const [envFramework, setEnvFramework] = React.useState<SiloEnvFramework>(
    "next",
  );
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(
      siloEnvSnippet(siloToken, envFramework),
    );
    setCopied(true);
    toast.success("Environment snippet copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="bg-muted/40 space-y-3 rounded-lg border p-4">
      <div className="flex gap-3">
        <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
          <Terminal className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 space-y-1 flex items-center justify-center">
          <h3 className="text-sm font-medium leading-snug">
            Add to your environment
          </h3>
        </div>
      </div>
      <Tabs
        value={envFramework}
        onValueChange={(v: string) => {
          setEnvFramework(v as SiloEnvFramework);
          setCopied(false);
        }}
        className="w-full gap-3"
      >
        <TabsList className="grid h-auto w-full min-w-0 grid-cols-3 p-[3px]">
          <TabsTrigger value="next" className="text-xs sm:text-sm">
            Next.js
          </TabsTrigger>
          <TabsTrigger value="vite" className="text-xs sm:text-sm">
            Vite
          </TabsTrigger>
          <TabsTrigger value="generic" className="px-1 text-xs sm:text-sm">
            Node / other
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {envFramework === "generic" && (
        <div className="text-muted-foreground text-xs leading-relaxed">
          It is safe to expose <code className="bg-background/80 rounded px-1 py-0.5 text-[0.7rem]">SILO_CDN</code> to the client.
        </div>
      )}
      <SiloEnvVarsPanel
        label="Environment snippet"
        showLabel={false}
        framework={envFramework}
        siloToken={siloToken}
        copied={copied}
        onCopy={() => void handleCopy()}
        buttonClassName="w-full"
      />
    </section>
  );
}
