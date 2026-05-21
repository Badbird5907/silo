"use client";

import FileDetailsPage from "@/app/(app)/[orgSlug]/p/[projectSlug]/files/[fileId]/page";

type FileDetailsPageProps = Parameters<typeof FileDetailsPage>[0];

export default function EnvironmentFileDetailsPage(
  props: FileDetailsPageProps,
) {
  return <FileDetailsPage {...props} />;
}
