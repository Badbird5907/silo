import { Highlight, themes } from "prism-react-renderer"
import TsLogo from "./ts-logo";

export function CodeHighlighter({ fileName, code }: { fileName: string, code: string }) {
  return (
    <Highlight theme={themes.vsDark} language="typescript" code={code}>
      {({ style, tokens, getLineProps, getTokenProps }) => {
        const lineNumWidthCh = String(tokens.length).length;
        return (
        <div className="h-full overflow-auto" style={{ backgroundColor: style.backgroundColor }}>
          <div className="px-4 pt-3 pb-2 text-xs font-mono text-gray-400 select-none border-b border-white/10 flex">
            <TsLogo className="w-4 h-4 mr-2" />
            {fileName}
          </div>
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
