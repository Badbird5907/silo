"use client"

import { routeHandlerCode, uploadCode } from "@/lib/code"
import { CodeHighlighter } from "./code"
import TsLogo from "./ts-logo"
import { useState } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { ChevronDownIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const files = [
  { id: "upload", shortName: "upload.ts", path: "src/upload.ts", code: uploadCode },
  { id: "route-handler", shortName: "route.ts", path: "src/app/api/upload/route.ts", code: routeHandlerCode },
] as const

type FileId = (typeof files)[number]["id"]

export function CodeDemo() {
  const [activeId, setActiveId] = useState<FileId>(files[0].id)
  const activeFile = files.find((f) => f.id === activeId) ?? files[0]
  const theme = useTheme()

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className={cn("flex p-3 font-mono text-xs select-none", theme.resolvedTheme === "dark" ? "text-gray-400" : "text-gray-600")}>
              <TsLogo className="mr-2 h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">{activeFile.path}</span>
              <ChevronDownIcon className="size-4 ml-2" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {files.map((file) => (
              <DropdownMenuItem key={file.id} onClick={() => setActiveId(file.id)}>
                {file.shortName}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <CodeHighlighter code={activeFile.code} />
      </div>
    </div>
  )
}