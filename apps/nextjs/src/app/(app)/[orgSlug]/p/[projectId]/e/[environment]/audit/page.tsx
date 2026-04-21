"use client";

import AuditPage from "@/app/(app)/[orgSlug]/p/[projectId]/audit/page";

type AuditPageProps = Parameters<typeof AuditPage>[0];

export default function EnvironmentAuditPage(props: AuditPageProps) {
  return <AuditPage {...props} />;
}
