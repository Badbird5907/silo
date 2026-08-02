import { env as runtimeEnv } from "@/env";

export async function register(): Promise<void> {
  if (runtimeEnv.NODE_ENV !== "development") return;

  const [
    { getCloudflareContext },
    { configureApiRuntime },
    { setStateValueWithNamespace },
  ] = await Promise.all([
    import("@opennextjs/cloudflare"),
    import("@silo-storage/api/runtime"),
    import("@/cloudflare/state"),
  ]);
  const { env } = await getCloudflareContext({ async: true });
  configureApiRuntime({
    publishUploadEvent: (fileKeyId, event) =>
      setStateValueWithNamespace(
        env.COMPLETION_DO,
        `upload-event:${fileKeyId}`,
        event,
        5 * 60,
      ),
  });
}
