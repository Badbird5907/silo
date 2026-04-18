"use client";

import { Highlight, Prism, themes } from "prism-react-renderer"
import { useTheme } from "next-themes"

if (typeof globalThis !== "undefined") {
  (globalThis as typeof globalThis & { Prism: typeof Prism }).Prism = Prism
}

/* prism-react-renderer ships a slim Prism; load extra grammars onto the same instance (after Prism is global). */
/* eslint-disable @typescript-eslint/no-require-imports */
require("prismjs/components/prism-toml")
require("prismjs/components/prism-bash")
require("prismjs/components/prism-properties")
/* eslint-enable @typescript-eslint/no-require-imports */

// tell prism to highlight wrangler commands
Prism.languages.insertBefore("bash", "function", {
  wrangler: {
    pattern: /(^|[\s;|&]|[<>]\()wrangler(?=$|[)\s;|&])/,
    lookbehind: true,
    alias: "function",
  },
  wrangler_2: {
    pattern: /(^|[\s;|&]|[<>]\()(kv|r2|queues|secret)(?=$|[)\s;|&])/,
    lookbehind: true,
    alias: "keyword",
  },
})

Prism.languages.insertBefore("typescript", "keyword", {
  satisfies: {
    pattern: /(^|[\s;|&]|[<>]\()satisfies(?=$|[)\s;|&])/,
    lookbehind: true,
    alias: "keyword",
  }
})

const dark = { ...themes.oneDark, plain: { ...themes.oneDark.plain, backgroundColor: "var(--card)" } }
const light = { ...themes.oneLight, plain: { ...themes.oneLight.plain, backgroundColor: "var(--card)" } }
export function CodeHighlighter({ code, language = "typescript", showLineNumbers = true }: { code: string, language?: string, showLineNumbers?: boolean }) {
  const theme = useTheme()
  return (
    <Highlight theme={theme.resolvedTheme === "dark" ? dark : light} language={language} code={code}>
      {({ style, tokens, getLineProps, getTokenProps }) => {
        const lineNumWidthCh = String(tokens.length).length;
        return (
        <div
          className="h-full min-h-0 overflow-auto"
          style={{ backgroundColor: style.backgroundColor }}
        >
          <pre
            style={{ ...style, backgroundColor: "transparent" }}
            className="min-h-full px-4 py-3 m-0"
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {showLineNumbers && <span
                  className="inline-block shrink-0 text-right text-sm font-mono tabular-nums text-gray-500 mr-4 select-none align-top"
                  style={{ width: `${lineNumWidthCh}ch` }}
                >
                  {i + 1}
                </span>}
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        </div>
        );
      }}
    </Highlight>
  )
}
