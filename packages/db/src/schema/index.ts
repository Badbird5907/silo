import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum as pgEnumCore,
  pgTableCreator,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

import * as auth from "./auth";

const pgTable = pgTableCreator((name) => `silo_${name}`);
const pgEnum = <TValues extends [string, ...string[]]>(
  name: string,
  values: TValues,
) => pgEnumCore(`silo_${name}`, values);

export const fileAccessTypes = pgEnum("file_access_types", [
  "public",
  "private",
]);

export const imageDeliveryPolicy = pgEnum("image_delivery_policy", [
  "disabled",
  "public_only",
  "public_and_private_opt_in",
]);

export const fileKeyStatus = pgEnum("file_key_status", [
  "pending",
  "completed",
  "failed",
  "deleted",
]);

export const fileLifecycleJobKinds = pgEnum("file_lifecycle_job_kind", [
  "delete_object",
  "abort_multipart",
  "finalize_failed_filekey",
  "repair_missing_object",
]);

export const fileLifecycleJobStates = pgEnum("file_lifecycle_job_state", [
  "pending",
  "leased",
  "retry",
  "done",
  "dead",
]);

export const resourceLifecycleState = pgEnum("resource_lifecycle_state", [
  "active",
  "deleting",
]);

export const projects = pgTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  defaultFileAccess: fileAccessTypes("default_file_access")
    .notNull()
    .default("private"),
  imageDeliveryPolicy: imageDeliveryPolicy("image_delivery_policy")
    .notNull()
    .default("public_and_private_opt_in"),
  preserveImageExif: boolean("preserve_image_exif").notNull().default(false),
  lifecycleState: resourceLifecycleState("lifecycle_state")
    .notNull()
    .default("active"),
  pendingUploadFailAfterMinutes: integer("pending_upload_fail_after_minutes")
    .notNull()
    .default(24 * 60),
  parentOrganizationId: text("parent_organization_id").references(
    () => auth.organizations.id,
    { onDelete: "cascade" },
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const projectEnvironmentTypes = pgEnum("project_environment_types", [
  "development",
  "staging",
  "production",
]);
export const webhookEventTypes = pgEnum("webhook_event_types", [
  "upload.completed",
  "upload.failed",
]);
export const projectEnvironments = pgTable("project_environments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  slug: text("slug").notNull(), // unique across project, but not globally
  type: projectEnvironmentTypes("type").notNull(),
  lifecycleState: resourceLifecycleState("lifecycle_state")
    .notNull()
    .default("active"),
  ownerUserId: text("owner_user_id").references(() => auth.users.id, {
    onDelete: "set null",
  }),
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret"),
  webhookEvents: webhookEventTypes("webhook_events")
    .array()
    .notNull()
    .default(sql`'{}'::silo_webhook_event_types[]`),
  callbackHeaders: jsonb("callback_headers")
    .notNull()
    .default("{}")
    .$type<Record<string, string>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// a unique file
export const files = pgTable("files", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid(16)),
  hash: text("hash"), // optional sha256 hash of the file (null if not computed)
  mimeType: text("mime_type").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  storageKey: text("storage_key").notNull(), // this is the file key in storage backend
  environmentId: text("environment_id")
    .references(() => projectEnvironments.id, { onDelete: "cascade" })
    .notNull(),
  projectId: text("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// this represents a upload/intent to upload a file
export const fileKeys = pgTable(
  "file_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid(16)),
    fileName: text("file_name").notNull(),
    accessKey: text("access_key").notNull(),
    fileId: text("file_id").references(() => files.id, {
      onDelete: "set null",
    }), // nullable - null means pending upload or deleted tombstone
    isPublic: boolean("is_public").notNull().default(false), // resolved from project.defaultFileAccess at creation if not explicitly set
    serveImage: boolean("serve_image"),
    environmentId: text("environment_id")
      .references(() => projectEnvironments.id, { onDelete: "cascade" })
      .notNull(),
    projectId: text("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    metadata: jsonb("metadata").notNull(),
    callbackMetadata: jsonb("callback_metadata"),

    // Claimed values from signed URL (for validation)
    claimedHash: text("claimed_hash"), // optional - if provided, worker validates against actual
    claimedMimeType: text("claimed_mime_type"), // optional - if provided, worker validates
    claimedSize: bigint("claimed_size", { mode: "number" }).notNull(), // required - for quota/validation

    // Upload state tracking
    status: fileKeyStatus("status").notNull().default("pending"),
    adapterData: jsonb("adapter_data"),
    expiresAt: timestamp("expires_at"),
    uploadCompletedAt: timestamp("upload_completed_at"),
    uploadFailedAt: timestamp("upload_failed_at"),
    deletedAt: timestamp("deleted_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("file_keys_project_access_key_idx").on(
      table.projectId,
      table.accessKey,
    ),
    index("file_keys_status_expires_at_idx").on(table.status, table.expiresAt),
    index("file_keys_metadata_gin_idx").using("gin", table.metadata),
  ],
);

export const fileLifecycleJobs = pgTable(
  "file_lifecycle_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid(16)),
    kind: fileLifecycleJobKinds("kind").notNull(),
    state: fileLifecycleJobStates("state").notNull().default("pending"),
    priority: integer("priority").notNull().default(100),

    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    environmentId: text("environment_id").references(
      () => projectEnvironments.id,
      {
        onDelete: "set null",
      },
    ),
    fileKeyId: text("file_key_id").references(() => fileKeys.id, {
      onDelete: "set null",
    }),
    fileId: text("file_id").references(() => files.id, {
      onDelete: "set null",
    }),

    adapterData: jsonb("adapter_data"),

    idempotencyKey: text("idempotency_key").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(10),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at"),

    lastError: text("last_error"),
    lastHttpStatus: integer("last_http_status"),
    lastErrorCode: text("last_error_code"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    completedAt: timestamp("completed_at"),
    deadAt: timestamp("dead_at"),
  },
  (table) => [
    uniqueIndex("file_lifecycle_jobs_idempotency_key_idx").on(
      table.idempotencyKey,
    ),
    index("file_lifecycle_jobs_state_next_attempt_idx").on(
      table.state,
      table.nextAttemptAt,
    ),
    index("file_lifecycle_jobs_lease_expires_idx").on(table.leaseExpiresAt),
    index("file_lifecycle_jobs_file_key_kind_idx").on(
      table.fileKeyId,
      table.kind,
    ),
  ],
);

// Relations
export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(auth.organizations, {
    fields: [projects.parentOrganizationId],
    references: [auth.organizations.id],
  }),
  environments: many(projectEnvironments),
  files: many(files),
  fileKeys: many(fileKeys),
  apiKeys: many(apiKeys),
}));

export const projectEnvironmentsRelations = relations(
  projectEnvironments,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [projectEnvironments.projectId],
      references: [projects.id],
    }),
    owner: one(auth.users, {
      fields: [projectEnvironments.ownerUserId],
      references: [auth.users.id],
    }),
    files: many(files),
    fileKeys: many(fileKeys),
  }),
);

export const filesRelations = relations(files, ({ one, many }) => ({
  environment: one(projectEnvironments, {
    fields: [files.environmentId],
    references: [projectEnvironments.id],
  }),
  project: one(projects, {
    fields: [files.projectId],
    references: [projects.id],
  }),
  fileKeys: many(fileKeys),
  lifecycleJobs: many(fileLifecycleJobs),
}));

export const fileKeysRelations = relations(fileKeys, ({ one, many }) => ({
  file: one(files, {
    fields: [fileKeys.fileId],
    references: [files.id],
  }),
  environment: one(projectEnvironments, {
    fields: [fileKeys.environmentId],
    references: [projectEnvironments.id],
  }),
  project: one(projects, {
    fields: [fileKeys.projectId],
    references: [projects.id],
  }),
  lifecycleJobs: many(fileLifecycleJobs),
}));

export const fileLifecycleJobsRelations = relations(
  fileLifecycleJobs,
  ({ one }) => ({
    project: one(projects, {
      fields: [fileLifecycleJobs.projectId],
      references: [projects.id],
    }),
    environment: one(projectEnvironments, {
      fields: [fileLifecycleJobs.environmentId],
      references: [projectEnvironments.id],
    }),
    fileKey: one(fileKeys, {
      fields: [fileLifecycleJobs.fileKeyId],
      references: [fileKeys.id],
    }),
    file: one(files, {
      fields: [fileLifecycleJobs.fileId],
      references: [files.id],
    }),
  }),
);

// API Keys - project-scoped keys for external API access
export const apiKeys = pgTable("api_keys", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid(16)),
  name: text("name").notNull(), // user-provided name for the key
  keyPrefix: text("key_prefix").notNull(), // first 11 chars for display (sk-silo-xxxx)
  keyHash: text("key_hash").notNull().unique(), // SHA-256 hash of full key
  projectId: text("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  organizationId: text("organization_id")
    .references(() => auth.organizations.id, { onDelete: "cascade" })
    .notNull(),
  environmentId: text("environment_id")
    .references(() => projectEnvironments.id, {
      onDelete: "cascade",
    })
    .notNull(),
  createdById: text("created_by_id").references(() => auth.members.id, {
    onDelete: "set null",
  }), // nullable in case member is removed
  expiresAt: timestamp("expires_at"), // optional expiration
  lastUsedAt: timestamp("last_used_at"), // track usage
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  project: one(projects, {
    fields: [apiKeys.projectId],
    references: [projects.id],
  }),
  organization: one(auth.organizations, {
    fields: [apiKeys.organizationId],
    references: [auth.organizations.id],
  }),
  environment: one(projectEnvironments, {
    fields: [apiKeys.environmentId],
    references: [projectEnvironments.id],
  }),
  createdBy: one(auth.members, {
    fields: [apiKeys.createdById],
    references: [auth.members.id],
  }),
}));

// Extended organizations relation to include projects and apiKeys
export const organizationsRelationsExtended = relations(
  auth.organizations,
  ({ many }) => ({
    projects: many(projects),
    apiKeys: many(apiKeys),
  }),
);

// Extended members relation to include apiKeys
export const membersRelationsExtended = relations(auth.members, ({ many }) => ({
  apiKeys: many(apiKeys),
}));

// Analytics: Event Types
export const usageEventTypes = pgEnum("usage_event_types", [
  "upload_started",
  "upload_completed",
  "upload_failed",
  "download",
]);

export const webhookAttemptStatus = pgEnum("webhook_attempt_status", [
  "success",
  "retry",
  "failed",
]);

// for all types of webhooks (webhook/callback)
const deliveryAttemptSharedColumns = {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  eventId: text("event_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  queueMessageId: text("queue_message_id"),
  environmentId: text("environment_id")
    .references(() => projectEnvironments.id, { onDelete: "cascade" })
    .notNull(),
  projectId: text("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  status: webhookAttemptStatus("status").notNull(),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  error: text("error"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
};

export const webhookAttempts = pgTable(
  "webhook_attempts",
  {
    ...deliveryAttemptSharedColumns,
    webhookJobId: text("webhook_job_id"),
    requestUrl: text("request_url").notNull(),
  },
  (table) => [
    index("webhook_attempts_event_idx").on(table.eventId),
    index("webhook_attempts_idempotency_idx").on(table.idempotencyKey),
    uniqueIndex("webhook_attempts_event_attempt_idx").on(
      table.eventId,
      table.attemptNumber,
    ),
  ],
);

export const callbackAttempts = pgTable(
  "callback_attempts",
  {
    ...deliveryAttemptSharedColumns,
    callbackUrl: text("callback_url").notNull(),
  },
  (table) => [
    index("callback_attempts_event_idx").on(table.eventId),
    index("callback_attempts_idempotency_idx").on(table.idempotencyKey),
    uniqueIndex("callback_attempts_event_attempt_idx").on(
      table.eventId,
      table.attemptNumber,
    ),
  ],
);

// Analytics: Raw usage events
export const usageEvents = pgTable("usage_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  organizationId: text("organization_id")
    .references(() => auth.organizations.id, { onDelete: "cascade" })
    .notNull(),
  projectId: text("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  environmentId: text("environment_id")
    .references(() => projectEnvironments.id, { onDelete: "cascade" })
    .notNull(),
  eventType: usageEventTypes("event_type").notNull(),
  bytes: bigint("bytes", { mode: "number" }),
  fileId: text("file_id").references(() => files.id, { onDelete: "set null" }),
  apiKeyId: text("api_key_id").references(() => apiKeys.id, {
    onDelete: "set null",
  }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usageDaily = pgTable(
  "usage_daily",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    organizationId: text("organization_id")
      .references(() => auth.organizations.id, { onDelete: "cascade" })
      .notNull(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    environmentId: text("environment_id").references(
      () => projectEnvironments.id,
      { onDelete: "cascade" },
    ),
    date: date("date").notNull(),
    uploadsStarted: integer("uploads_started").notNull().default(0),
    uploadsCompleted: integer("uploads_completed").notNull().default(0),
    uploadsFailed: integer("uploads_failed").notNull().default(0),
    downloads: integer("downloads").notNull().default(0),
    bytesUploaded: bigint("bytes_uploaded", { mode: "number" })
      .notNull()
      .default(0),
    bytesDownloaded: bigint("bytes_downloaded", { mode: "number" })
      .notNull()
      .default(0),
    storageBytes: bigint("storage_bytes", { mode: "number" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("usage_daily_org_project_env_date_idx").on(
      table.organizationId,
      table.projectId,
      table.environmentId,
      table.date,
    ),
  ],
);

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  organization: one(auth.organizations, {
    fields: [usageEvents.organizationId],
    references: [auth.organizations.id],
  }),
  project: one(projects, {
    fields: [usageEvents.projectId],
    references: [projects.id],
  }),
  environment: one(projectEnvironments, {
    fields: [usageEvents.environmentId],
    references: [projectEnvironments.id],
  }),
  file: one(files, {
    fields: [usageEvents.fileId],
    references: [files.id],
  }),
  apiKey: one(apiKeys, {
    fields: [usageEvents.apiKeyId],
    references: [apiKeys.id],
  }),
}));

export const usageDailyRelations = relations(usageDaily, ({ one }) => ({
  organization: one(auth.organizations, {
    fields: [usageDaily.organizationId],
    references: [auth.organizations.id],
  }),
  project: one(projects, {
    fields: [usageDaily.projectId],
    references: [projects.id],
  }),
  environment: one(projectEnvironments, {
    fields: [usageDaily.environmentId],
    references: [projectEnvironments.id],
  }),
}));

export const webhookAttemptsRelations = relations(
  webhookAttempts,
  ({ one }) => ({
    environment: one(projectEnvironments, {
      fields: [webhookAttempts.environmentId],
      references: [projectEnvironments.id],
    }),
    project: one(projects, {
      fields: [webhookAttempts.projectId],
      references: [projects.id],
    }),
  }),
);

export const callbackAttemptsRelations = relations(
  callbackAttempts,
  ({ one }) => ({
    environment: one(projectEnvironments, {
      fields: [callbackAttempts.environmentId],
      references: [projectEnvironments.id],
    }),
    project: one(projects, {
      fields: [callbackAttempts.projectId],
      references: [projects.id],
    }),
  }),
);

export * from "./auth";
