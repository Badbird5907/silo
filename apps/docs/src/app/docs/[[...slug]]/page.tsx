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

import { getMDXComponents } from "@/components/mdx";
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

  return (
    <DocsPage
      toc={page.data.toc}
      tableOfContent={{
        style: "clerk",
      }}
      full={page.data.full}
    >
      {!page.data.full && (
        <>
          <DocsTitle>{page.data.title}</DocsTitle>
          <DocsDescription>{page.data.description}</DocsDescription>
        </>
      )}
      <DocsBody>
        <Mdx components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}
