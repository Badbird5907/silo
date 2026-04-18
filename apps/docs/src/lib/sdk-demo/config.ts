import { env } from "@/env";

export function getMissingClerkVars(): string[] {
  const missing: string[] = [];

  if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    missing.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  }

  if (!env.CLERK_SECRET_KEY) {
    missing.push("CLERK_SECRET_KEY");
  }

  return missing;
}

export function getMissingSiloVars(): string[] {
  const missing: string[] = [];

  if (!env.SILO_URL) {
    missing.push("SILO_URL");
  }

  if (!env.SILO_TOKEN) {
    missing.push("SILO_TOKEN");
  }

  if (!env.NEXT_PUBLIC_SILO_CDN) {
    missing.push("NEXT_PUBLIC_SILO_CDN");
  }

  return missing;
}

export function hasClerkDemoConfig(): boolean {
  return getMissingClerkVars().length === 0;
}

export function hasSiloDemoConfig(): boolean {
  return getMissingSiloVars().length === 0;
}
