import { z } from "zod";

import { createSiloUpload } from "./router";

const f = createSiloUpload<Request, { userId: string }>();

f(
  z.object({
    folder: z.string(),
  }),
)
  .middleware(({ context, input }) => ({
    userId: context.userId,
    folder: input.folder,
  }))
  .expects({
    image: {
      maxFileCount: 1,
      mimeTypes: ["image/png"],
    },
  })
  .public(false);

// @ts-expect-error middleware is not available after expects
f().expects({ image: { maxFileCount: 1 } }).middleware(() => ({
  userId: "123",
}));
