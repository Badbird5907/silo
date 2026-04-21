import { purgeExpiredRetentionRecords } from "@silo-storage/api/service/retention";
import { db } from "@silo-storage/db/client";

import { env } from "@/env";

export const dynamic = "force-dynamic";

function isCronAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization");
  return header === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return new Response(
      JSON.stringify({ error: "CRON_SECRET is not configured" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!isCronAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await purgeExpiredRetentionRecords(db);

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to purge expired retention records", { error });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
