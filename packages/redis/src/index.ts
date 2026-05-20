import "server-only";

import { Redis } from "@upstash/redis";

import { env } from "./env";

declare global {
  var redis: Redis | undefined;
}

export const redis =
  globalThis.redis ??
  new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.redis = redis;
}

export interface Message {
  channel: string;
  data: string;
}

interface SubscriberMessageEvent {
  channel: string;
  message: unknown;
}

export const asyncWaitForMessage = async (
  channel: string,
  timeout: number = 60 * 1000,
): Promise<Message> => {
  return new Promise<Message>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      void subscriber.unsubscribe();
      reject(new Error("Timeout waiting for message"));
    }, timeout);

    const subscriber = redis.subscribe(channel);

    const handleMessage = (event: SubscriberMessageEvent) => {
      clearTimeout(timeoutId);
      void subscriber.unsubscribe();
      resolve({
        channel: event.channel || channel,
        data:
          typeof event.message === "string"
            ? event.message
            : JSON.stringify(event.message),
      });
    };

    subscriber.on("message", handleMessage);

    const handleError = (error: Error) => {
      clearTimeout(timeoutId);
      void subscriber.unsubscribe();
      reject(error);
    };

    subscriber.on("error", handleError);
  });
};

/**
 * Publish a message to a Redis channel
 */
export const publishMessage = async (
  channel: string,
  data: unknown,
): Promise<void> => {
  const message = typeof data === "string" ? data : JSON.stringify(data);
  await redis.publish(channel, message);
};
