import postgres from "postgres";

const databaseUrl = process.env.POSTGRES_URL_DIRECT ?? process.env.POSTGRES_URL;
if (!databaseUrl) {
  throw new Error(
    "Set POSTGRES_URL_DIRECT or POSTGRES_URL before running the audit",
  );
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

const [counts] = await sql<
  {
    pending_uploads: number;
    completed_uploads: number;
    completed_without_storage_key: number;
    active_lifecycle_jobs: number;
    dead_lifecycle_jobs: number;
    retrying_webhooks: number;
    retrying_callbacks: number;
  }[]
>`
  select
    (select count(*)::int from file_keys where status = 'pending') as pending_uploads,
    (select count(*)::int from file_keys where status = 'completed') as completed_uploads,
    (
      select count(*)::int
      from file_keys fk
      left join files f on f.id = fk.file_id
      where fk.status = 'completed' and (f.id is null or f.storage_key is null)
    ) as completed_without_storage_key,
    (
      select count(*)::int
      from file_lifecycle_jobs
      where state in ('pending', 'leased', 'retry')
    ) as active_lifecycle_jobs,
    (select count(*)::int from file_lifecycle_jobs where state = 'dead') as dead_lifecycle_jobs,
    (
      select count(*)::int
      from (
        select distinct on (event_id) status
        from webhook_attempts
        order by event_id, attempt_number desc
      ) latest
      where status = 'retry'
    ) as retrying_webhooks,
    (
      select count(*)::int
      from (
        select distinct on (event_id) status
        from callback_attempts
        order by event_id, attempt_number desc
      ) latest
      where status = 'retry'
    ) as retrying_callbacks
`;

const report = {
  generatedAt: new Date().toISOString(),
  ...counts,
};
console.log(JSON.stringify(report, null, 2));

const blockers = [
  ["pending uploads", counts?.pending_uploads ?? 0],
  [
    "completed uploads without a storage key",
    counts?.completed_without_storage_key ?? 0,
  ],
  ["active lifecycle jobs", counts?.active_lifecycle_jobs ?? 0],
  ["webhook events still marked for retry", counts?.retrying_webhooks ?? 0],
  ["callback events still marked for retry", counts?.retrying_callbacks ?? 0],
] as const;
const activeBlockers = blockers.filter(([, count]) => count > 0);

await sql.end();

if (activeBlockers.length > 0) {
  console.error(
    `Cutover is not ready: ${activeBlockers
      .map(([name, count]) => `${count} ${name}`)
      .join(", ")}.`,
  );
  process.exitCode = 1;
} else {
  console.log("Cloudflare cutover database gate passed.");
}
