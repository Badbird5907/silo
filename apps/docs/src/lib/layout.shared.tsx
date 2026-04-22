import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/** Public source for these docs; used in the docs sidebar. */
export const GITHUB_REPO_URL = "https://github.com/Badbird5907/better-s3";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Silo Docs",
    },
  };
}
