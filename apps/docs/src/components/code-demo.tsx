"use client";

import { useState } from "react";
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { ChevronDownIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { routeHandlerCode, uploadCode } from "@/lib/sdk-demo/code";
import { cn } from "@/lib/utils";
import TsLogo from "./ts-logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const files = [
  {
    id: "upload",
    shortName: "upload.ts",
    path: "src/upload.ts",
    code: uploadCode,
  },
  {
    id: "route-handler",
    shortName: "route.ts",
    path: "src/app/api/upload/route.ts",
    code: routeHandlerCode,
  },
] as const;

type FileId = (typeof files)[number]["id"];

export function CodeDemo() {
  const [activeId, setActiveId] = useState<FileId>(files[0].id);
  const activeFile = files.find((f) => f.id === activeId) ?? files[0];
  const theme = useTheme();

  return (
    <Card className="min-h-0 flex-1 overflow-hidden pb-0">
      <CardHeader>
        <CardTitle>SDK code</CardTitle>
        <CardDescription>
          Browse the upload setup and route handler used in this demo.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex w-full items-center p-3 font-mono text-xs select-none",
                theme.resolvedTheme === "dark"
                  ? "text-gray-400"
                  : "text-gray-600",
              )}
            >
              <TsLogo className="mr-2 h-4 w-4" />
              <span className="min-w-0 flex-1 truncate text-left">
                {activeFile.path}
              </span>
              <ChevronDownIcon className="ml-2 size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {files.map((file) => (
                <DropdownMenuItem
                  key={file.id}
                  onClick={() => setActiveId(file.id)}
                >
                  <TsLogo className="mr-2 h-4 w-4" />
                  {file.shortName}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <DynamicCodeBlock lang="typescript" code={activeFile.code} />
        </div>
      </CardContent>
    </Card>
  );
}
