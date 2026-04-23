"use client";

import FilesPage from "@/app/(app)/[orgSlug]/p/[projectSlug]/files/page";

type FilesPageProps = Parameters<typeof FilesPage>[0];

export default function EnvironmentFilesPage(props: FilesPageProps) {
  return <FilesPage {...props} />;
}
