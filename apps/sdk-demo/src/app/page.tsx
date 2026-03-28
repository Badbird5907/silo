import { CodeDemo } from "@/components/code-demo";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

export default function Home() {

  return (
    <main className="w-full h-[calc(100vh-70px)]">
      <ResizablePanelGroup orientation="horizontal" className="w-full h-full">
        <ResizablePanel defaultSize={"60%"}>
          <div className="w-full h-full">
            One
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={"40%"}>
          <div className="w-full h-full">
            <CodeDemo />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
}
