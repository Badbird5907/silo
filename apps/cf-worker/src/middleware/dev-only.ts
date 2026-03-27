import type { MiddlewareHandler } from "hono";

import type { Bindings, Variables } from "../types/bindings";
import { HTTP_STATUS } from "../utils/constants";

export const requireDevelopment: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (c, next) => {
  if (c.env.ENV !== "development") {
    return c.json(
      { error: "This endpoint is only available in local development" },
      HTTP_STATUS.FORBIDDEN,
    );
  }

  await next();
};
