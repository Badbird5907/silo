import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { remarkSteps } from 'fumadocs-core/mdx-plugins/remark-steps';

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig({
  mdxOptions: {
    providerImportSource: "@/components/mdx",
    remarkPlugins: [remarkSteps]
  },
});
