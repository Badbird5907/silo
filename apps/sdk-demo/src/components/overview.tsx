import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ServerCrash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ExternalTextLink } from "./ui/external-text-link";
import { SectionLabel, SectionHeading } from "./ui/section";
import { Divider } from "./ui/divider";

function StepBadge({ n }: { n: number }) {
  return (
    <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
      {n}
    </span>
  );
}

export function Overview() {
  return (
    <div className="mx-auto max-w-3xl space-y-2 py-6">
      <section>
        <SectionLabel>Introduction</SectionLabel>
        <SectionHeading>What is Silo?</SectionHeading>
        <p className="text-muted-foreground leading-relaxed">
          Silo is an open-source file upload solution built on Cloudflare R2 and
          Workers. It uses the{" "}
          <ExternalTextLink href="https://tus.io/">TUS protocol</ExternalTextLink>{" "}
          to stream files directly to R2 through a Worker, which gets you
          resumable uploads and server-side completion tracking out of the box.
        </p>
      </section>

      <Divider />

      <section>
        <SectionLabel>The problem</SectionLabel>
        <SectionHeading>Why not just use S3 / R2 directly?</SectionHeading>
        <p className="text-muted-foreground mb-6 leading-relaxed">
          S3 is a solid storage primitive (Silo is built on top of it via R2),
          but it's old. It wasn't designed with browser uploads in mind, so
          every team ends up solving the same set of problems from scratch. The
          typical flow looks like this:
        </p>

        <ol className="space-y-3">
          {[
            "Client requests a pre-signed upload URL from your server.",
            "Client uploads the file directly to S3 using that signed URL.",
            <>
              Client notifies your server that the upload is done.{" "}
              <span className="text-destructive font-semibold">
                ← This is where it breaks
              </span>
            </>,
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <StepBadge n={i + 1} />
              <p className="text-muted-foreground leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>

        <Card className="border-destructive/40 bg-destructive/5 mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive mt-0.5 size-5 shrink-0" /> Orphaned files
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground leading-relaxed">
                Step 3 is client-controlled, meaning the browser has to
                voluntarily tell your server the upload finished. What if the
                user closes the tab right after it completes? What if they're
                on a flaky connection? What if someone intentionally skips the
                callback? You get an orphaned file: an object sitting in your
                bucket that your app doesn't know about, costing you money
                indefinitely.
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-muted-foreground mt-6 leading-relaxed">
          This isn't hypothetical. I used this exact issue to permanently store{" "}
          <ExternalTextLink href="https://github.com/NationalSecurityAgency/ghidra/assets/118324883/b8209e95-1bb7-4c1c-875b-8cceed44c3a1">
            a file on GitHub's S3 infrastructure
          </ExternalTextLink>{" "}
          two years ago. It's still there today. Essentially, you request a signed URL
          for a file attachment, upload the file, then never post the
          comment. GitHub never learns the upload "completed", so it doesn't know the
          object exists.
        </p>

        <div className="mt-6 overflow-hidden rounded-lg">
          <iframe
            width="100%"
            height="450"
            src="https://www.youtube.com/embed/LLaVhYZbmTU?si=RkSh6zmDu10q90Mg"
            title="Hosting screenshots on GitHub's S3 for free"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="rounded-lg"
          />
          <p className="text-muted-foreground mt-2 text-xs">
            I wrote a tool to automatically host my screenshots on GitHub's S3
            bucket by exploiting this exact pattern.
          </p>
        </div>
      </section>

      <Divider />

      <section>
        <SectionLabel>Existing workarounds</SectionLabel>
        <SectionHeading>How do people solve this with S3?</SectionHeading>
        <p className="text-muted-foreground mb-6 leading-relaxed">
          There are a couple of established approaches, but none of them are
          particularly clean:
        </p>

        <div className="space-y-4 mb-2">
          {[
            {
              icon: <ServerCrash className="text-muted-foreground size-5 shrink-0 mt-0.5" />,
              title: "S3 Event Notifications + Lambda",
              body: "Wire up an S3 bucket to fire an event when an object is created, trigger a Lambda, post to SQS. It works, but it's a lot of provider-specific infrastructure to set up and maintain, and it can still fire for incomplete multipart uploads.",
            },
            {
              icon: <ServerCrash className="text-muted-foreground size-5 shrink-0 mt-0.5" />,
              title: "Cron-based reconciliation",
              body: "Run a periodic job that scans recent uploads and reconciles them against your database. Orphans get deleted on the next pass. Simpler to reason about, but still a bunch of extra code you have to write and keep running.",
            },
          ].map(({ icon, title, body }) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle>
              </CardHeader>
              <CardContent className="flex ">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        <span className="text-muted-foreground text-sm">
          I know there are more approaches than the two I've listed here, but none of them are particularly clean.
        </span>
      </section>

      <Divider />

      <section>
        <SectionLabel>The Solution</SectionLabel>
        <SectionHeading>How does Silo solve this?</SectionHeading>
        <p className="text-muted-foreground mb-6 leading-relaxed">
          Rather than patching around the problem with more infra, Silo fixes it
          at the protocol level:
        </p>

        <ol className="space-y-4">
          {[
            {
              title: "Server-side registration",
              body: "Before bytes are transferred, your server registers the upload with the Silo Worker. The Worker records the expected file metadata and issues an upload token. The client never touches your storage credentials.",
            },
            {
              title: "TUS-based streaming to R2",
              body: "The client uploads using the TUS protocol directly to the Silo Worker, which streams data into R2. TUS is resumable by design: if the connection drops, the client can resume exactly where it left off without re-uploading anything.",
            },
            {
              title: "Worker-authoritative completion",
              body: "When the final byte lands, the Worker marks the upload as complete and fires your callback. The browser never self-reports success. The server knows the upload finished because it received the bytes.",
            },
            {
              title: "Automatic expiry for incomplete uploads",
              body: "Any upload that doesn't complete within the configured window is expired and cleaned up by the Worker. No Lambda, no SQS, no cron job needed."
            },
          ].map(({ title, body }, i) => (
            <li key={title} className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-1">
                <StepBadge n={i + 1} />
                {i < 3 && <div className="bg-border w-px flex-1" />}
              </div>
              <div className="pb-4">
                <p className="mb-1 font-semibold">{title}</p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <Card className="border-emerald-500/40 bg-emerald-500/5 mt-2">
          <CardHeader>
            <CardTitle>The result</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[
                "Upload completion is server-authoritative. The browser cannot lie.",
                "Resumable uploads via TUS, no extra code required.",
                "No extra infrastructure: no Lambda, no SQS, no cron jobs.",
                "Your callback fires exactly once per completed upload.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="text-emerald-600 mt-0.5 size-4 shrink-0" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <Divider />

      <section>
        <SectionHeading>Isn't this just UploadThing?</SectionHeading>
        <p className="text-muted-foreground leading-relaxed">
          Yes, it's essentially a UploadThing clone, except it's built on top of R2 and Cloudflare Workers.
          Sue me :) <br /> <br />

          If you don't want to deploy this yourself, consider using UploadThing. It's mostly the same thing, with hosted infra.{" "}
          <ExternalTextLink href="https://uploadthing.com">UploadThing</ExternalTextLink>
        </p>
      </section>

      <Divider />

      <div className="mt-4 flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          Try the demo above to see it in action.
        </span>
        <ChevronRight className="text-muted-foreground size-4" />
      </div>
    </div>
  );
}
