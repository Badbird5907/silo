"use client";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import CodeDemoStuff from "./code";
import { useIsMobile } from "@/hooks/use-is-mobile";

export default function Home() {
  const isMobile = useIsMobile()
  return (
    <main className="w-full h-[calc(100vh-70px)]">
      <ResizablePanelGroup orientation={isMobile ? "vertical" : "horizontal"} className="w-full h-full">
        <ResizablePanel defaultSize={"60%"}>
          <div className="w-full h-full">
            One
          </div>
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
