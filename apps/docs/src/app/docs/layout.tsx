import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export default function DocsLayoutPage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DocsLayout
      {...baseOptions()}
      tree={source.getPageTree()}
      containerProps={{
        className: "xl:[--fd-layout-width:100%]",
      }}
    >
      {children}
    </DocsLayout>
  );
}
