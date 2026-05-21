export interface DevSseConnectedEvent {
  event: "connected";
  data: {
    channel: string;
    fileKeyId: string;
    status: string;
  };
}

export interface DevSseChunkEvent {
  event: "chunk";
  data: {
    hook: string;
    signature: string;
    payload: string;
    parsedPayload: unknown;
  };
}

export interface DevSseKeepaliveEvent {
  event: "keepalive";
  data: {
    ts: number;
  };
}

export interface DevSseErrorEvent {
  event: "error";
  data: {
    message: string;
  };
}

export interface DevSseUnknownEvent {
  event: string;
  data: unknown;
}

export type DevSseEvent =
  | DevSseConnectedEvent
  | DevSseChunkEvent
  | DevSseKeepaliveEvent
  | DevSseErrorEvent
  | DevSseUnknownEvent;

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseFrame(frame: string): DevSseEvent | null {
  let eventName = "message";
  const dataParts: string[] = [];

  for (const rawLine of frame.split(/\r?\n/g)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataParts.push(line.slice(5).trimStart());
    }
  }

  if (dataParts.length === 0) return null;
  const parsedData = parseJson(dataParts.join("\n"));

  if (eventName === "chunk") {
    const chunk =
      parsedData && typeof parsedData === "object" && !Array.isArray(parsedData)
        ? (parsedData as Record<string, unknown>)
        : {};
    const payload = typeof chunk.payload === "string" ? chunk.payload : "";
    return {
      event: "chunk",
      data: {
        hook: typeof chunk.hook === "string" ? chunk.hook : "",
        signature: typeof chunk.signature === "string" ? chunk.signature : "",
        payload,
        parsedPayload: parseJson(payload),
      },
    };
  }

  if (eventName === "connected") {
    const connected =
      parsedData && typeof parsedData === "object" && !Array.isArray(parsedData)
        ? (parsedData as Record<string, unknown>)
        : {};
    return {
      event: "connected",
      data: {
        channel: typeof connected.channel === "string" ? connected.channel : "",
        fileKeyId:
          typeof connected.fileKeyId === "string" ? connected.fileKeyId : "",
        status: typeof connected.status === "string" ? connected.status : "",
      },
    };
  }

  if (eventName === "keepalive") {
    const keepalive =
      parsedData && typeof parsedData === "object" && !Array.isArray(parsedData)
        ? (parsedData as Record<string, unknown>)
        : {};
    return {
      event: "keepalive",
      data: {
        ts: typeof keepalive.ts === "number" ? keepalive.ts : Date.now(),
      },
    };
  }

  if (eventName === "error") {
    const errorPayload =
      parsedData && typeof parsedData === "object" && !Array.isArray(parsedData)
        ? (parsedData as Record<string, unknown>)
        : {};
    return {
      event: "error",
      data: {
        message:
          typeof errorPayload.message === "string"
            ? errorPayload.message
            : "Unknown SSE error",
      },
    };
  }

  return {
    event: eventName,
    data: parsedData,
  };
}

function getStream(
  input: Response | ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  if (input instanceof Response) {
    if (!input.body) {
      throw new Error("SSE response body is empty");
    }
    return input.body;
  }
  return input;
}

export async function* consumeDevRegisterSse(
  input: Response | ReadableStream<Uint8Array>,
): AsyncGenerator<DevSseEvent> {
  const stream = getStream(input);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const separatorMatch = /\r?\n\r?\n/.exec(buffer);
        if (!separatorMatch) break;
        const separatorIndex = separatorMatch.index;
        const separatorLength = separatorMatch[0].length;
        const frame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + separatorLength);
        const parsed = parseFrame(frame);
        if (parsed) {
          yield parsed;
        }
      }
    }

    const tail = buffer.trim();
    if (tail) {
      const parsed = parseFrame(tail);
      if (parsed) {
        yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
