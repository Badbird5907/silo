interface StoredValue {
  expiresAt: number;
  value: unknown;
}

type Waiter = (value: unknown) => void;

interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTime: number): Promise<void>;
}

interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
}

export class CompletionDurableObject {
  private readonly waiters = new Set<Waiter>();

  constructor(private readonly state: DurableObjectStateLike) {}

  private async read(): Promise<StoredValue | null> {
    const stored = await this.state.storage.get<StoredValue>("value");
    if (!stored) return null;
    if (stored.expiresAt > Date.now()) return stored;
    await this.state.storage.delete("value");
    return null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/value" && request.method === "GET") {
      const stored = await this.read();
      return stored
        ? Response.json(stored.value)
        : new Response(null, { status: 404 });
    }

    if (url.pathname === "/value" && request.method === "PUT") {
      const ttlSeconds = Number.parseInt(
        request.headers.get("X-Silo-TTL-Seconds") ?? "1",
        10,
      );
      const value: unknown = await request.json();
      const expiresAt =
        Date.now() +
        Math.max(1, Number.isFinite(ttlSeconds) ? ttlSeconds : 1) * 1000;
      await this.state.storage.put<StoredValue>("value", {
        expiresAt,
        value,
      });
      await this.state.storage.setAlarm(expiresAt);
      for (const resolve of this.waiters) resolve(value);
      this.waiters.clear();
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/wait" && request.method === "GET") {
      const stored = await this.read();
      if (stored) return Response.json(stored.value);

      const requestedTimeout = Number.parseInt(
        url.searchParams.get("timeoutMs") ?? "25000",
        10,
      );
      const timeoutMs = Math.min(
        30_000,
        Math.max(
          1,
          Number.isFinite(requestedTimeout) ? requestedTimeout : 25_000,
        ),
      );
      const timedOut = Symbol("timed-out");
      const value = await new Promise<unknown>((resolve) => {
        const waiter: Waiter = (next) => {
          clearTimeout(timeout);
          this.waiters.delete(waiter);
          resolve(next);
        };
        const timeout = setTimeout(() => {
          this.waiters.delete(waiter);
          resolve(timedOut);
        }, timeoutMs);
        this.waiters.add(waiter);
      });

      return value === timedOut
        ? new Response(null, { status: 404 })
        : Response.json(value);
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}
