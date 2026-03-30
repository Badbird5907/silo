import { CheckCircle2, ExternalLink, Terminal } from "lucide-react";
import { CodeHighlighter } from "./code";
import { ExternalTextLink } from "./ui/external-text-link";
import { SectionLabel, SectionHeading } from "./ui/section";
import { Divider } from "./ui/divider";
import { Button } from "./ui/button";
import Link from "next/link";

function StepBadge({ n }: { n: number }) {
  return (
    <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
      {n}
    </span>
  );
}

function CodeBlock({
  code,
  language = "bash",
  collapsible = false,
}: {
  code: string;
  language?: string;
  collapsible?: boolean;
}) {
  if (!collapsible) {
    return (
      <div className="border-border mt-3 overflow-hidden rounded-md border">
        <CodeHighlighter code={code} language={language} showLineNumbers={false} />
      </div>
    );
  }

  return (
    <details className="group mt-3">
      <summary className="list-none [&::-webkit-details-marker]:hidden">
        <div className="border-border relative overflow-hidden rounded-md border group-open:hidden">
          <div className="max-h-48 overflow-hidden">
            <CodeHighlighter code={code} language={language} showLineNumbers={false} />
          </div>
          <div className="from-card/95 pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t to-transparent" />
          <div className="hover:cursor-pointer absolute inset-x-0 bottom-4 z-10 mx-auto w-fit rounded-full border border-white/15 bg-black/70 px-5 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-sm transition group-hover:bg-black/80">
            View code
          </div>
        </div>
      </summary>
      <div className="border-border hidden overflow-hidden rounded-md border group-open:block">
        <CodeHighlighter code={code} language={language} showLineNumbers={false} />
      </div>
    </details>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
      {children}
    </code>
  );
}

const steps = [
  {
    label: "Prerequisites",
    heading: "What you'll need",
    content: (
      <ul className="space-y-2">
        {[
          <>
            A{" "}
            <ExternalTextLink href="https://dash.cloudflare.com/sign-up">
              Cloudflare account
            </ExternalTextLink>{" "}
            with Workers &amp; R2 enabled.
          </>,
          <>
            A{" "}
            <ExternalTextLink href="https://vercel.com/">Vercel account</ExternalTextLink>{" "}
            to host the frontend.
          </>,
          <>
            A Redis instance. You can get one for free from{" "}
            <ExternalTextLink href="https://upstash.com/">Upstash</ExternalTextLink>
          </>,
          <>
            A PostgreSQL database. You can get one for free from{" "}
            <ExternalTextLink href="https://supabase.com/">Supabase</ExternalTextLink>
            {" "}or{" "}
            <ExternalTextLink href="https://www.neon.com/">Neon</ExternalTextLink>
          </>,
          <>
            Node.js <InlineCode>v22.21.0+</InlineCode> and <InlineCode>pnpm</InlineCode>
          </>,
          <>
            The Wrangler CLI installed globally:{" "}
            <InlineCode>pnpm install -g wrangler</InlineCode>
          </>,
        ].map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="text-emerald-600 mt-0.5 size-4 shrink-0" />
            <span className="text-muted-foreground">{item}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    label: "Step 0",
    heading: "Fork the repository",
    content: (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm leading-relaxed">
          Fork the repository to your own GitHub account. (Also give it a star!)
        </p>
        <div className="flex justify-center">
          <Link href="https://github.com/Badbird5907/silo/fork" target="_blank" rel="noopener noreferrer">
            <Button style={{
              backgroundColor: "#347d39",
              borderColor: "#cdd9e526",
              color: "#ffffff",
              boxShadow: "0 1px 1px 0 #01040999,0 1px 3px 0 #01040999",
            }} size="xl">Fork the repo <ExternalLink className="size-4" /></Button>
          </Link>
        </div>
      </div>
    ),
  },
  {
    label: "Step 1",
    heading: "Clone & install dependencies",
    content: (
      <>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Clone the repository and install dependencies from the repo root.
          Replace <InlineCode>your-org</InlineCode> with your GitHub username or
          organization.
        </p>
        <CodeBlock
          code={`git clone https://github.com/your-org/silo.git
cd silo
pnpm install`}
        />
      </>
    ),
  },
  {
    label: "Step 2",
    heading: "Create Cloudflare resources",
    content: (
      <>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Silo needs an R2 bucket, a KV namespace, and two Queues. Run all of
          these before deploying — Wrangler will error at deploy time if any
          binding references a resource that doesn't exist yet.
        </p>
        <CodeBlock
          code={`# R2 buckets (one for prod, one for local dev)
wrangler r2 bucket create silo-uploads
wrangler r2 bucket create silo-uploads-preview

# KV namespace + a preview namespace for local dev
wrangler kv namespace create PROJECT_CACHE
wrangler kv namespace create PROJECT_CACHE --preview

# Queues (producer + dead-letter queue)
# If you are on the free plan, queues have a 24 hour message retention period.
# You must set the --message-retention-period-secs flag. Omit if you are on workers paid
wrangler queues create silo-delete-prefix --message-retention-period-secs 86400
wrangler queues create silo-delete-prefix-dlq --message-retention-period-secs 86400`}
        />
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Copy both KV namespace IDs that Wrangler prints (the regular one and
          the preview one). You'll need them in the next step. The queue names
          are referenced by name in <InlineCode>wrangler.toml</InlineCode> so no
          ID is needed for those.
        </p>
      </>
    ),
  },
  {
    label: "Step 3",
    heading: "Configure wrangler.toml",
    content: (
      <>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Open <InlineCode>apps/cf-worker/wrangler.toml</InlineCode> and fill in
          your values.
        </p>
        <CodeBlock
          language="toml"
          code={`[[kv_namespaces]]
binding = "PROJECT_CACHE"
id = "<your-kv-namespace-id>"          # ← from: wrangler kv namespace create PROJECT_CACHE
preview_id = "<your-kv-preview-id>"   # ← from: wrangler kv namespace create PROJECT_CACHE --preview

[vars]
WORKER_DOMAIN = "worker.your-domain.com"   # public hostname for the Worker
PROJECT_ROUTE_MODE = "subdomain"           # "subdomain" or "path"
PROJECT_ROUTE_PREFIX = "/p"                # used when PROJECT_ROUTE_MODE="path"

[env.production]
vars.WORKER_DOMAIN = "worker.your-domain.com"
vars.PROJECT_ROUTE_MODE = "subdomain"
vars.PROJECT_ROUTE_PREFIX = "/p"
vars.NEXTJS_CALLBACK_URL = "https://your-silo-app.com"  # where the nextjs app is hosted (vercel)
vars.ENV = "production"`}
        />
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Use <InlineCode>subdomain</InlineCode> mode for{" "}
          <InlineCode>project-slug.worker.your-domain.com</InlineCode> URLs (requires wildcard DNS),
          or <InlineCode>path</InlineCode> mode for{" "}
          <InlineCode>worker.your-domain.com/p/project-slug/*</InlineCode> URLs.
        </p>
      </>
    ),
  },
  {
    label: "Step 4",
    heading: "Set secrets",
    content: (
      <>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Three secrets are required for production. Keep them long, random,
          and out of source control. Generate each one with:
          <br />
          <InlineCode>openssl rand -base64 32</InlineCode>
        </p>
        <CodeBlock
          code={`# Secret used to authenticate internal callbacks
wrangler secret put CALLBACK_SECRET --env production

# Secret used to sign upload tokens (must match SIGNING_SECRET in your app)
wrangler secret put SIGNING_SECRET --env production

# Secret used by the Worker to bypass Vercel deployment protection
# Save this value; you'll add it in Vercel in Step 6.
wrangler secret put VERCEL_AUTOMATION_BYPASS_SECRET --env production`}
        />
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          For local development, create{" "}
          <InlineCode>apps/cf-worker/.dev.vars</InlineCode> (already in{" "}
          <InlineCode>.gitignore</InlineCode>):
        </p>
        <CodeBlock
          language="properties"
          code={`CALLBACK_SECRET=dev-callback-secret
SIGNING_SECRET=dev-signing-secret
VERCEL_AUTOMATION_BYPASS_SECRET=dev-vercel-bypass-secret`}
        />
      </>
    ),
  },
  {
    label: "Step 5",
    heading: "Deploy the Worker",
    content: (
      <>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Run the deploy command from the repo root. Wrangler will bundle and
          upload the Worker to Cloudflare's edge.
        </p>
        <CodeBlock
          code={`# Deploy to production
pnpm --filter cf-worker deploy --env production

# Or deploy from the worker directory directly
cd apps/cf-worker
wrangler deploy --env production`}
        />
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Wrangler will print the Worker's URL when the deploy succeeds. Set
          your custom domain (e.g. <InlineCode>files.your-domain.com</InlineCode>
          ) in the Cloudflare dashboard under Workers &rarr; your worker &rarr;
          Custom Domains.
        </p>
      </>
    ),
  },
  {
    label: "Step 6",
    heading: "Deploy Next.js on Vercel",
    content: (
      <>
        <p className="text-muted-foreground text-sm leading-relaxed">
          In the{" "}
          <ExternalTextLink href="https://vercel.com/new">
            Vercel dashboard
          </ExternalTextLink>
          , import your GitHub repository as a new project. This repo is a
          monorepo. Make sure to set the Root Directory to{" "}
          <InlineCode>apps/nextjs</InlineCode>.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          If install fails because
          workspace packages are missing, set Install Command to{" "}
          <InlineCode>cd ../.. && pnpm install</InlineCode> so pnpm links
          dependencies from the repository root.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Under Settings &rarr; Environment Variables, add the Silo-related
          values for Production (and Preview if you use preview deployments). For local dev, keep the same keys in{" "}
          <InlineCode>.env.local</InlineCode> at the repo root.
        </p>
        <CodeBlock
          collapsible={true}
          language="properties"
          code={`# This is the database URL for the local postgres server running via docker
POSTGRES_URL="postgresql://dev:devpass@localhost:5432/appdb"

# The Upstash URL is used to connect to your Upstash project.
# This is the preconfigured url for the local redis server running via docker
UPSTASH_REDIS_REST_URL="http://localhost:8079"
UPSTASH_REDIS_REST_TOKEN="dev_token"

# You can generate the secret via 'openssl rand -base64 32'
# @see https://www.better-auth.com/docs/installation
AUTH_SECRET='supersecret'

# Preconfigured GitHub OAuth provider, works out-of-the-box
# @see https://www.better-auth.com/docs/authentication/github
AUTH_GITHUB_ID=''
AUTH_GITHUB_SECRET=''

# Cloudflare Worker URL for file uploads/downloads
WORKER_URL="http://localhost:8787"
WORKER_DOMAIN="ingest.your-domain.com" # public hostname for the Worker
PROJECT_ROUTE_MODE="subdomain" # "subdomain" => {projectSlug}.{WORKER_DOMAIN}, "path" => {WORKER_DOMAIN}/p/{projectSlug}
PROJECT_ROUTE_PREFIX="/p" # only used when PROJECT_ROUTE_MODE="path"

# Signing secret for generating signed URLs (generate via 'openssl rand -hex 32')
SIGNING_SECRET="your-secure-random-secret-here"
CALLBACK_SECRET="your-secure-random-secret-here"

# Do we want to disable organization creation?
NEXT_PUBLIC_DISABLE_ORG_CREATION=false

# Do we want to disable signup?
DISABLE_SIGNUP="false"`}
        />
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          In Vercel, go to Settings &rarr; Deployment Protection &rarr;
          Protection Bypass for Automation and add the same token you set for{" "}
          <InlineCode>VERCEL_AUTOMATION_BYPASS_SECRET</InlineCode> in Step 4.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Deploy, then copy your production URL (e.g.{" "}
          <InlineCode>https://your-silo-app.vercel.app</InlineCode>). It must
          match <InlineCode>NEXTJS_CALLBACK_URL</InlineCode> in{" "}
          <InlineCode>wrangler.toml</InlineCode> for the Worker — update that
          value and redeploy the Worker if your Vercel URL changed.
        </p>
      </>
    ),
  },
  {
    label: "Step 7",
    heading: "You're done!",
    content: (
      <>
        <p className="text-muted-foreground text-sm leading-relaxed">
          You're done! You can now use Silo to upload files to your Cloudflare R2 bucket.
        </p>
      </>
    ),
  },
];

export function Deploy() {
  return (
    <div className="mx-auto max-w-3xl space-y-2 py-6">
      <section>
        <SectionLabel>Deploy</SectionLabel>
        <SectionHeading>Deploy your own Silo</SectionHeading>
        <p className="text-muted-foreground leading-relaxed">
          Silo runs on{" "}
          <ExternalTextLink href="https://workers.cloudflare.com/">
            Cloudflare Workers
          </ExternalTextLink>{" "}
          with{" "}
          <ExternalTextLink href="https://developers.cloudflare.com/r2/">R2</ExternalTextLink>{" "}
          as the storage backend. The frontend runs on{" "}
          <ExternalTextLink href="https://vercel.com">Vercel</ExternalTextLink>.
        </p>
      </section>

      <Divider />

      <section className="space-y-10">
        {steps.map(({ label, heading, content }, i) => (
          <div key={label} className="flex items-start gap-4">
            {label === "Prerequisites" ? (
              <Terminal className="text-muted-foreground mt-1 size-5 shrink-0" />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <StepBadge n={i-1} />
              </div>
            )}
            <div className="min-w-0 flex-1 pb-2">
              <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-widest uppercase">
                {label}
              </p>
              <p className="mb-3 text-lg font-semibold tracking-tight">{heading}</p>
              {content}
            </div>
          </div>
        ))}
      </section>

      <Divider />

      <section>
        <SectionLabel>Local development</SectionLabel>
        <SectionHeading>Running Silo locally</SectionHeading>
        <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
          Silo is set up to run locally using docker compose for the database and redis, wrangler for the worker, and nextjs for the frontend.
        </p>
        <CodeBlock
          code={`# Start the Next.js app + docker
pnpm run dev

# Start the Worker in local dev mode
pnpm run dev:worker`}
        />
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          The Worker binds to <InlineCode>http://lvh.me:8787</InlineCode> by
          default (configured via <InlineCode>WORKER_DOMAIN</InlineCode> in the{" "}
          <InlineCode>development</InlineCode> env). Your Next.js app should
          point <InlineCode>NEXT_PUBLIC_SILO_WORKER_URL</InlineCode> at that
          address.
        </p>
      </section>
    </div>
  );
}
