"use client";
import { UploadButton } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";

export default function ExamplePage() {
  const [progress, setProgress] = useState(0);
  return (
    <div>
      <h1 className="text-2xl font-bold">Silo SDK Example (Next.js)</h1>
      <UploadButton endpoint="powerpointThingy" onUploadProgress={(event) => setProgress(event.aggregatePercent)}>
        <Button>Upload</Button>
      </UploadButton>
      <div className="mt-4">
        <p className="text-sm text-gray-500">Progress: {progress}%</p>
        <Progress value={progress} />
      </div>
    </div>
  );
}

