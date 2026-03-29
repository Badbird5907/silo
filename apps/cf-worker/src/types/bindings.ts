import type { DeletePrefixQueueMessage } from "../services/r2/delete-prefix";

export interface Bindings {
  R2_BUCKET: R2Bucket;
  PROJECT_CACHE: KVNamespace;
  TUS_STATE_DO: DurableObjectNamespace;
  DELETE_PREFIX_QUEUE: {
    send(message: DeletePrefixQueueMessage): Promise<void>;
  };

  WORKER_DOMAIN: string;
  PROJECT_ROUTE_MODE: "subdomain" | "path";
  PROJECT_ROUTE_PREFIX: string;
  NEXTJS_CALLBACK_URL: string;
  ENV: string;
  CALLBACK_SECRET: string;
  SIGNING_SECRET: string;
  TUS_MAX_SIZE: string;
  TUS_MAX_PATCH_SIZE: string;
  TUS_EXPIRATION_HOURS: string;
  EXPIRY_CLEANUP_BATCH_SIZE: string;
  EXPIRY_CLEANUP_MAX_BATCHES: string;
  PENDING_UPLOAD_CLEANUP_BATCH_SIZE: string;
  PENDING_UPLOAD_CLEANUP_MAX_BATCHES: string;
  LIFECYCLE_JOB_BATCH_SIZE: string;
  LIFECYCLE_JOB_MAX_BATCHES: string;
  LIFECYCLE_JOB_LEASE_SECONDS: string;
}

export interface Variables {
  projectSlug: string | null;
  projectId: string;
  defaultFileAccess: "public" | "private";
  projectLifecycleState: "active" | "deleting";
}
