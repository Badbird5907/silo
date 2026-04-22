import defaultMdxComponents from "fumadocs-ui/mdx";
import {
  createFileSystemGeneratorCache,
  createGenerator,
} from "fumadocs-typescript";
import {
  AutoTypeTable
} from "fumadocs-typescript/ui";
import type { AutoTypeTableProps } from "fumadocs-typescript/ui";
import type { MDXComponents } from "mdx/types";
import { Nextjs } from "@/components/next-logo";
import { TanStack } from "@/components/tanstack-logo";
import { React } from "@/components/react-logo";
import { Boxes } from "lucide-react";

const generator = createGenerator({
  cache: createFileSystemGeneratorCache(".next/fumadocs-typescript"),
});

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    AutoTypeTable: (props: Partial<AutoTypeTableProps>) => (
      <AutoTypeTable {...props} generator={generator} />
    ),
    ...components,
    Nextjs,
    TanStack,
    React,
    Boxes,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
