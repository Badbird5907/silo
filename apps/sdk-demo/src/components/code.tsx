"use client";

import { Highlight, themes } from "prism-react-renderer"
import { useTheme } from "next-themes"

const dark = { ...themes.oneDark, plain: { ...themes.oneDark.plain, backgroundColor: "var(--card)" } }
const light = { ...themes.oneLight, plain: { ...themes.oneLight.plain, backgroundColor: "var(--card)" } }
export function CodeHighlighter({ code }: { code: string }) {
  const theme = useTheme()
  return (
    <Highlight theme={theme.resolvedTheme === "dark" ? dark : light} language="typescript" code={code}>
      {({ style, tokens, getLineProps, getTokenProps }) => {
        const lineNumWidthCh = String(tokens.length).length;
        return (
        <div
          className="h-full min-h-0 overflow-auto"
          style={{ backgroundColor: style.backgroundColor }}
        >
          <pre
            style={{ ...style, backgroundColor: "transparent" }}
            className="min-h-full px-4 pt-3 m-0"
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                <span
                  className="inline-block shrink-0 text-right text-sm font-mono tabular-nums text-gray-500 mr-4 select-none align-top"
                  style={{ width: `${lineNumWidthCh}ch` }}
                >
                  {i + 1}
                </span>
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
