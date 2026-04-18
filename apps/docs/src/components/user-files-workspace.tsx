"use client";

import { UploadDemo } from "./upload-demo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Overview } from "./overview";
import { Deploy } from "./deploy";

export function UserFilesWorkspace() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <Tabs>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="demo">Demo</TabsTrigger>
          <TabsTrigger value="deploy">Deploy</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview />
        </TabsContent>
        <TabsContent value="demo">
          <UploadDemo />
        </TabsContent>
        <TabsContent value="deploy">
          <Deploy />
        </TabsContent>
      </Tabs>
    </div>
  );
}
