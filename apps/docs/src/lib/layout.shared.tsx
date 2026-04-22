import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/** Public source for these docs; used in the docs sidebar. */
export const GITHUB_REPO_URL = "https://github.com/Badbird5907/better-s3";
export const GITHUB_REPO_BRANCH = "master";
export const DOCS_CONTENT_PATH = "apps/docs/content/docs";
export const GITHUB_DOCS_CONTENT_URL = `${GITHUB_REPO_URL}/blob/${GITHUB_REPO_BRANCH}/${DOCS_CONTENT_PATH}`;

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Silo Docs",
    },
  };
}
