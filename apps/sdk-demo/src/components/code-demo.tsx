"use client"

import { routeHandlerCode, uploadCode } from "@/lib/code"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CodeHighlighter } from "./code"

const files = [
  { id: "upload", shortName: "upload.ts", path: "src/upload.ts", code: uploadCode },
  { id: "route-handler", shortName: "route.ts", path: "src/app/api/upload/route.ts", code: routeHandlerCode },
] as const

export function CodeDemo() {
  return (
    <Tabs defaultValue={files[0].id} className="h-full gap-0">
        <TabsList variant="line">
          {files.map((file) => (
            <TabsTrigger
              key={file.id}
              value={file.id}
            >
              {file.shortName}
            </TabsTrigger>
          ))}
        </TabsList>

      {files.map((file) => (
        <TabsContent key={file.id} value={file.id} className="min-h-0 flex-1 overflow-hidden">
          <CodeHighlighter fileName={file.path} code={file.code} />
        </TabsContent>
      ))}
    </Tabs>
  )
}