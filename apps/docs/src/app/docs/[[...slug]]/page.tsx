import type { TOCItemType } from "fumadocs-core/toc";
import type { MDXComponents } from "mdx/types";
import type { ComponentType } from "react";
import { notFound } from "next/navigation";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";

import { DocsPageActions } from "@/components/docs-page-actions";
import { getMDXComponents } from "@/components/mdx";
import { GITHUB_DOCS_CONTENT_URL } from "@/lib/layout.shared";
import { source } from "@/lib/source";

interface DocPageData {
  title: string;
  description?: string;
  full?: boolean;
  body: ComponentType<{ components?: MDXComponents }>;
  toc: TOCItemType[];
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const page = source.getPage(slug) as
    | (Omit<NonNullable<ReturnType<typeof source.getPage>>, "data"> & {
        data: DocPageData;
      })
    | null;

  if (!page) {
    notFound();
  }

  const Mdx = page.data.body;
  if (page.data.full) {
    return (
      <Mdx components={getMDXComponents()} />
    )
  }
  return (
    <DocsPage
      toc={page.data.toc}
      tableOfContent={{
        style: "clerk",
      }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <DocsTitle>{page.data.title}</DocsTitle>
          <DocsDescription>{page.data.description}</DocsDescription>
        </div>

        <DocsPageActions
          githubUrl={`${GITHUB_DOCS_CONTENT_URL}/${page.path}`}
          markdownPath={`${page.url}.mdx`}
        />
      </div>

      <DocsBody>
        <Mdx components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}
