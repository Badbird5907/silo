export interface Bindings {
  R2_BUCKET: R2Bucket;
  UPLOAD_STATE_DO: DurableObjectNamespace;

  WORKER_DOMAIN: string;
  CONTROL_PLANE_URL: string;
  ENV: string;
  CALLBACK_SECRET: string;
  SIGNING_SECRET: string;
  UPLOAD_MAX_SIZE: string;
  UPLOAD_MAX_PART_SIZE: string;
  UPLOAD_EXPIRATION_HOURS: string;
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
  imageDeliveryPolicy: "disabled" | "public_only" | "public_and_private_opt_in";
  preserveImageExif: boolean;
  projectLifecycleState: "active" | "deleting";
}
