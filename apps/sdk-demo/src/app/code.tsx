"use client";

import dynamic from "next/dynamic";

const CodeDemo = dynamic(() => import("@/components/code-demo").then((mod) => mod.CodeDemo), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full">Loading...</div>,
})

export default function CodeDemoStuff() {
  return <CodeDemo />
}