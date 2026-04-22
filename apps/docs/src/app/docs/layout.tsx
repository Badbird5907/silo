import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { GitHubIcon } from "@/components/github-icon";
import { baseOptions, GITHUB_REPO_URL } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export default function DocsLayoutPage({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions()}
      links={[
        {
          type: "icon",
          url: GITHUB_REPO_URL,
          label: "github",
          text: "Github",
          icon: <GitHubIcon />,
          external: true,
        },
      ]}
      tree={source.getPageTree()}
      containerProps={{
        className: "xl:[--fd-layout-width:100%]",
      }}
    >
      {children}
    </DocsLayout>
  );
}
