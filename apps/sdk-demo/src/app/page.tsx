"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { UserFilesWorkspace } from "@/components/user-files-workspace";
import { useIsMobile } from "@/hooks/use-is-mobile";
import CodeDemoStuff from "./code";

export default function Home() {
  const isMobile = useIsMobile();
  return (
    <main className="h-[calc(100vh-70px)] w-full">
      <ResizablePanelGroup
        orientation={isMobile ? "vertical" : "horizontal"}
        className="h-full w-full"
      >
        <ResizablePanel defaultSize={"60%"}>
          <UserFilesWorkspace />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={"40%"} className="min-h-0">
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <CodeDemoStuff />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
}
