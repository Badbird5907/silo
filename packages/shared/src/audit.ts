export const auditActorTypes = ["user", "api_key", "system"] as const;
export type AuditActorType = (typeof auditActorTypes)[number];

export const auditEventCategories = [
  "operational",
  "configuration",
  "security",
  "lifecycle",
] as const;
export type AuditEventCategory = (typeof auditEventCategories)[number];

export const auditResourceTypes = [
  "project",
  "environment",
  "api_key",
  "file",
  "file_key",
  "organization",
  "member",
  "invitation",
  "system",
] as const;
export type AuditResourceType = (typeof auditResourceTypes)[number];

export const auditStatuses = ["success", "failure"] as const;
export type AuditStatus = (typeof auditStatuses)[number];

export interface AuditChange {
  path: string;
  before: unknown;
  after: unknown;
}

export const auditEventCodes = {
  fileUploadStarted: "file.upload.started",
  fileUploadCompleted: "file.upload.completed",
  fileUploadFailed: "file.upload.failed",
  fileDownloaded: "file.downloaded",
  fileDeleted: "file.deleted",
  fileKeyAccessUpdated: "file_key.access.updated",
  projectSettingsUpdated: "project.settings.updated",
  projectDeleted: "project.deleted",
  environmentCreated: "environment.created",
  environmentUpdated: "environment.updated",
  environmentWebhookUpdated: "environment.webhook.updated",
  environmentCallbackHeadersUpdated: "environment.callback_headers.updated",
  environmentWebhookSecretRotated: "environment.webhook_secret.rotated",
  environmentDeleted: "environment.deleted",
  apiKeyCreated: "api_key.created",
  apiKeyDeleted: "api_key.deleted",
} as const;

export type AuditEventCode =
  (typeof auditEventCodes)[keyof typeof auditEventCodes];

export interface AuditEventDefinition {
  title: string;
  shortLabel: string;
  category: AuditEventCategory;
  resourceType: AuditResourceType;
  icon:
    | "upload"
    | "download"
    | "settings"
    | "key"
    | "folder"
    | "shield"
    | "delete";
  badgeTone: "blue" | "green" | "yellow" | "red" | "slate";
}

export const auditEventDefinitions: Record<
  AuditEventCode,
  AuditEventDefinition
> = {
  [auditEventCodes.fileUploadStarted]: {
    title: "Upload started",
    shortLabel: "Upload started",
    category: "operational",
    resourceType: "file",
    icon: "upload",
    badgeTone: "blue",
  },
  [auditEventCodes.fileUploadCompleted]: {
    title: "Upload completed",
    shortLabel: "Upload completed",
    category: "operational",
    resourceType: "file",
    icon: "upload",
    badgeTone: "green",
  },
  [auditEventCodes.fileUploadFailed]: {
    title: "Upload failed",
    shortLabel: "Upload failed",
    category: "operational",
    resourceType: "file",
    icon: "upload",
    badgeTone: "red",
  },
  [auditEventCodes.fileDownloaded]: {
    title: "File downloaded",
    shortLabel: "Downloaded",
    category: "operational",
    resourceType: "file",
    icon: "download",
    badgeTone: "blue",
  },
  [auditEventCodes.fileDeleted]: {
    title: "File deleted",
    shortLabel: "File deleted",
    category: "lifecycle",
    resourceType: "file",
    icon: "delete",
    badgeTone: "red",
  },
  [auditEventCodes.fileKeyAccessUpdated]: {
    title: "File key access updated",
    shortLabel: "File key access updated",
    category: "configuration",
    resourceType: "file_key",
    icon: "settings",
    badgeTone: "yellow",
  },
  [auditEventCodes.projectSettingsUpdated]: {
    title: "Project settings updated",
    shortLabel: "Project updated",
    category: "configuration",
    resourceType: "project",
    icon: "settings",
    badgeTone: "yellow",
  },
  [auditEventCodes.projectDeleted]: {
    title: "Project deleted",
    shortLabel: "Project deleted",
    category: "lifecycle",
    resourceType: "project",
    icon: "folder",
    badgeTone: "red",
  },
  [auditEventCodes.environmentCreated]: {
    title: "Environment created",
    shortLabel: "Environment created",
    category: "configuration",
    resourceType: "environment",
    icon: "folder",
    badgeTone: "green",
  },
  [auditEventCodes.environmentUpdated]: {
    title: "Environment updated",
    shortLabel: "Environment updated",
    category: "configuration",
    resourceType: "environment",
    icon: "settings",
    badgeTone: "yellow",
  },
  [auditEventCodes.environmentWebhookUpdated]: {
    title: "Webhook settings updated",
    shortLabel: "Webhook updated",
    category: "configuration",
    resourceType: "environment",
    icon: "settings",
    badgeTone: "yellow",
  },
  [auditEventCodes.environmentCallbackHeadersUpdated]: {
    title: "Callback headers updated",
    shortLabel: "Callback headers updated",
    category: "security",
    resourceType: "environment",
    icon: "shield",
    badgeTone: "yellow",
  },
  [auditEventCodes.environmentWebhookSecretRotated]: {
    title: "Webhook secret rotated",
    shortLabel: "Webhook secret rotated",
    category: "security",
    resourceType: "environment",
    icon: "shield",
    badgeTone: "red",
  },
  [auditEventCodes.environmentDeleted]: {
    title: "Environment deleted",
    shortLabel: "Environment deleted",
    category: "lifecycle",
    resourceType: "environment",
    icon: "folder",
    badgeTone: "red",
  },
  [auditEventCodes.apiKeyCreated]: {
    title: "API key created",
    shortLabel: "API key created",
    category: "security",
    resourceType: "api_key",
    icon: "key",
    badgeTone: "green",
  },
  [auditEventCodes.apiKeyDeleted]: {
    title: "API key deleted",
    shortLabel: "API key deleted",
    category: "security",
    resourceType: "api_key",
    icon: "key",
    badgeTone: "red",
  },
};

export const auditEventCodeOptions = Object.values(auditEventCodes);

export function getAuditEventDefinition(
  eventCode: string,
): AuditEventDefinition {
  if (eventCode in auditEventDefinitions) {
    return auditEventDefinitions[eventCode as AuditEventCode];
  }

  return {
    title: eventCode,
    shortLabel: eventCode,
    category: "configuration",
    resourceType: "system",
    icon: "settings",
    badgeTone: "slate",
  };
}

export function isOperationalAuditEventCode(eventCode: string): boolean {
  return getAuditEventDefinition(eventCode).category === "operational";
}

export function usageEventTypeToAuditEventCode(
  eventType:
    | "upload_started"
    | "upload_completed"
    | "upload_failed"
    | "download"
    | "file_deleted",
): AuditEventCode {
  switch (eventType) {
    case "upload_started":
      return auditEventCodes.fileUploadStarted;
    case "upload_completed":
      return auditEventCodes.fileUploadCompleted;
    case "upload_failed":
      return auditEventCodes.fileUploadFailed;
    case "download":
      return auditEventCodes.fileDownloaded;
    case "file_deleted":
      return auditEventCodes.fileDeleted;
  }
}

export const auditCategoryLabels: Record<AuditEventCategory, string> = {
  operational: "Operational",
  configuration: "Configuration",
  security: "Security",
  lifecycle: "Lifecycle",
};

export const auditResourceTypeLabels: Record<AuditResourceType, string> = {
  project: "Project",
  environment: "Environment",
  api_key: "API key",
  file: "File",
  file_key: "File key",
  organization: "Organization",
  member: "Member",
  invitation: "Invitation",
  system: "System",
};
