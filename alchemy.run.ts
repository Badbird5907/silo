import alchemy from "alchemy";
import {
  DurableObjectNamespace,
  Hyperdrive,
  Nextjs,
  Queue,
  R2Bucket,
  Worker,
} from "alchemy/cloudflare";

const app = await alchemy("silo", {
  password: process.env.ALCHEMY_PASSWORD,
});

const isProduction = app.stage === "production" || app.stage === "prod";
const suffix = isProduction ? "" : `-${app.stage}`;
const attachProductionDomains =
  isProduction && process.env.ATTACH_PRODUCTION_DOMAINS === "true";

function value(name: string, fallback?: string): string {
  const resolved = process.env[name] ?? fallback;
  if (!resolved) throw new Error(`Missing ${name}`);
  return resolved;
}

function secret(name: string, fallback?: string) {
  const resolved = value(name, fallback);
  return app.local ? resolved : alchemy.secret(resolved);
}

const appDomain = value("APP_DOMAIN", "fs.evanyu.dev");
const docsDomain = value("DOCS_DOMAIN", "docs.evanyu.dev");
const workerDomain = value("WORKER_DOMAIN", "cdn.evanyu.dev");
const appUrl = app.local
  ? value("APP_URL", "http://localhost:3000")
  : value("APP_URL", `https://${appDomain}`);
const workerUrl = app.local
  ? value("WORKER_URL", "http://localhost:8787")
  : value("WORKER_URL", `https://${workerDomain}`);
const databaseOrigin = value(
  "POSTGRES_URL_DIRECT",
  value("POSTGRES_URL", "postgresql://dev:devpass@localhost:5432/appdb"),
);
const docsSiloUrl = value("SILO_URL", app.local ? appUrl : undefined);
const docsSiloToken = value(
  "SILO_TOKEN",
  app.local
    ? "eyJ2IjoxLCJhayI6ImxvY2FsLWFwaS1rZXkiLCJraWQiOiJsb2NhbC1rZXktaWQiLCJlaWQiOiJsb2NhbC1lbnYtaWQiLCJzcyI6ImxvY2FsLXNpZ25pbmctc2VjcmV0Iiwicm0iOiJwIiwicHMiOiJsb2NhbC1wcm9qZWN0In0"
    : undefined,
);

const uploads = await R2Bucket("uploads", {
  name: isProduction ? "silo-uploads" : `silo-uploads${suffix}`,
  adopt: isProduction,
  delete: !isProduction,
  empty: !isProduction,
});

const webhookDlq = await Queue("webhook-dlq", {
  name: `silo-upload-webhooks-dlq${suffix}`,
  adopt: isProduction,
  delete: !isProduction,
  settings: { messageRetentionPeriod: 14 * 24 * 60 * 60 },
});

const webhookQueue = await Queue("webhook-queue", {
  name: `silo-upload-webhooks${suffix}`,
  adopt: isProduction,
  delete: !isProduction,
  dlq: webhookDlq,
  settings: { messageRetentionPeriod: 4 * 24 * 60 * 60 },
});

const hyperdrive = await Hyperdrive("postgres", {
  name: `silo-postgres${suffix}`,
  adopt: isProduction,
  origin: app.local ? databaseOrigin : alchemy.secret(databaseOrigin),
  caching: { disabled: true },
  delete: !isProduction,
  dev: {
    origin: value(
      "POSTGRES_URL",
      "postgresql://dev:devpass@localhost:5432/appdb",
    ),
  },
});

const completionDo = DurableObjectNamespace("completion", {
  className: "CompletionDurableObject",
  sqlite: true,
});

export const controlPlane = await Nextjs("control-plane", {
  name: `silo-app${suffix}`,
  cwd: "apps/nextjs",
  entrypoint: "cloudflare-worker.ts",
  adopt: isProduction,
  delete: !isProduction,
  url: true,
  domains: attachProductionDomains
    ? [{ domainName: appDomain, adopt: true, overrideExistingOrigin: true }]
    : [],
  bindings: {
    HYPERDRIVE: hyperdrive,
    COMPLETION_DO: completionDo,
    WEBHOOK_QUEUE: webhookQueue,
    NODE_ENV: "production",
    APP_URL: appUrl,
    WORKER_URL: workerUrl,
    WORKER_DOMAIN: workerDomain,
    PROJECT_ROUTE_MODE: value("PROJECT_ROUTE_MODE", "subdomain"),
    NEXT_PUBLIC_SILO_CDN: value("NEXT_PUBLIC_SILO_CDN", workerDomain),
    NEXT_PUBLIC_DISABLE_ORG_CREATION: value(
      "NEXT_PUBLIC_DISABLE_ORG_CREATION",
      "false",
    ),
    DISABLE_SIGNUP: value("DISABLE_SIGNUP", "false"),
    WEBHOOK_DELIVERY_ENABLED: value("WEBHOOK_DELIVERY_ENABLED", "true"),
    UPLOADS_ENABLED: value("UPLOADS_ENABLED", "true"),
    DEV_UPLOAD_SSE_ENABLED: value("DEV_UPLOAD_SSE_ENABLED", "true"),
    AUTH_SECRET: secret("AUTH_SECRET", "local-development-auth-secret"),
    AUTH_GITHUB_ID: secret("AUTH_GITHUB_ID", "local-github-client"),
    AUTH_GITHUB_SECRET: secret(
      "AUTH_GITHUB_SECRET",
      "local-github-client-secret",
    ),
    CALLBACK_SECRET: secret(
      "CALLBACK_SECRET",
      "local-callback-secret-at-least-32-characters",
    ),
    SIGNING_SECRET: secret(
      "SIGNING_SECRET",
      "local-signing-secret-at-least-32-characters",
    ),
    ...(process.env.BETTER_AUTH_API_KEY
      ? { BETTER_AUTH_API_KEY: secret("BETTER_AUTH_API_KEY") }
      : {}),
  },
  build: {
    command: "pnpm opennextjs-cloudflare build",
    env: {
      APP_URL: appUrl,
      NEXT_PUBLIC_SILO_CDN: value("NEXT_PUBLIC_SILO_CDN", workerDomain),
      NEXT_PUBLIC_DISABLE_ORG_CREATION: value(
        "NEXT_PUBLIC_DISABLE_ORG_CREATION",
        "false",
      ),
    },
  },
  dev: {
    command: "pnpm dev",
    domain: "localhost:3000",
  },
  crons: ["0 3 * * *"],
  eventSources: [
    {
      queue: webhookQueue,
      settings: {
        batchSize: 1,
        maxConcurrency: 1,
        maxRetries: 8,
        maxWaitTimeMs: 1_000,
        retryDelay: 30,
        deadLetterQueue: webhookDlq,
      },
    },
  ],
  observability: { enabled: true },
});

const uploadStateDo = DurableObjectNamespace("upload-state", {
  className: "UploadStateDO",
  sqlite: true,
});

export const ingest = await Worker("ingest", {
  name: isProduction ? "silo-worker" : `silo-worker${suffix}`,
  cwd: "apps/cf-worker",
  entrypoint: "src/index.ts",
  adopt: isProduction,
  delete: !isProduction,
  url: true,
  domains: attachProductionDomains
    ? [{ domainName: workerDomain, adopt: true, overrideExistingOrigin: true }]
    : [],
  compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
  dev: { port: 8787 },
  bindings: {
    R2_BUCKET: uploads,
    UPLOAD_STATE_DO: uploadStateDo,
    WORKER_DOMAIN: workerDomain,
    CONTROL_PLANE_URL: appUrl,
    ENV: isProduction ? "production" : "development",
    CALLBACK_SECRET: secret(
      "CALLBACK_SECRET",
      "local-callback-secret-at-least-32-characters",
    ),
    SIGNING_SECRET: secret(
      "SIGNING_SECRET",
      "local-signing-secret-at-least-32-characters",
    ),
    UPLOAD_MAX_SIZE: value("UPLOAD_MAX_SIZE", "106300440576"),
    UPLOAD_MAX_PART_SIZE: value("UPLOAD_MAX_PART_SIZE", "106300440576"),
    UPLOAD_EXPIRATION_HOURS: value("UPLOAD_EXPIRATION_HOURS", "24"),
    EXPIRY_CLEANUP_BATCH_SIZE: value("EXPIRY_CLEANUP_BATCH_SIZE", "100"),
    EXPIRY_CLEANUP_MAX_BATCHES: value("EXPIRY_CLEANUP_MAX_BATCHES", "10"),
    PENDING_UPLOAD_CLEANUP_BATCH_SIZE: value(
      "PENDING_UPLOAD_CLEANUP_BATCH_SIZE",
      "100",
    ),
    PENDING_UPLOAD_CLEANUP_MAX_BATCHES: value(
      "PENDING_UPLOAD_CLEANUP_MAX_BATCHES",
      "10",
    ),
    LIFECYCLE_JOB_BATCH_SIZE: value("LIFECYCLE_JOB_BATCH_SIZE", "100"),
    LIFECYCLE_JOB_MAX_BATCHES: value("LIFECYCLE_JOB_MAX_BATCHES", "10"),
    LIFECYCLE_JOB_LEASE_SECONDS: value("LIFECYCLE_JOB_LEASE_SECONDS", "60"),
  },
  crons: ["*/5 * * * *"],
  observability: { enabled: true },
});

export const docs = await Nextjs("docs", {
  name: `silo-docs${suffix}`,
  cwd: "apps/docs",
  adopt: isProduction,
  delete: !isProduction,
  url: true,
  domains: attachProductionDomains
    ? [{ domainName: docsDomain, adopt: true, overrideExistingOrigin: true }]
    : [],
  bindings: {
    NODE_ENV: "production",
    NEXT_PUBLIC_SILO_CDN: value("NEXT_PUBLIC_SILO_CDN", workerDomain),
    ...(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
      ? {
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: value(
            "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
          ),
        }
      : {}),
    ...(process.env.CLERK_SECRET_KEY
      ? { CLERK_SECRET_KEY: secret("CLERK_SECRET_KEY") }
      : {}),
    SILO_TOKEN: app.local ? docsSiloToken : alchemy.secret(docsSiloToken),
    SILO_URL: docsSiloUrl,
  },
  build: {
    command: "pnpm opennextjs-cloudflare build",
    env: {
      NEXT_PUBLIC_SILO_CDN: value("NEXT_PUBLIC_SILO_CDN", workerDomain),
      ...(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
        ? {
            NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: value(
              "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
            ),
          }
        : {}),
    },
  },
  dev: {
    command: "pnpm dev",
    domain: "localhost:8345",
  },
  observability: { enabled: true },
});

console.log({
  controlPlane: controlPlane.url,
  ingest: ingest.url,
  docs: docs.url,
});

await app.finalize();
