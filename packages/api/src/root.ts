import { analyticsRouter } from "./router/analytics";
import { apiKeyRouter } from "./router/apiKey";
import { auditRouter } from "./router/audit";
import { authRouter } from "./router/auth";
import { environmentRouter } from "./router/environment";
import { fileRouter } from "./router/file";
import { fileKeyRouter } from "./router/fileKey";
import { organizationRouter } from "./router/organization";
import { projectRouter } from "./router/project";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  analytics: analyticsRouter,
  audit: auditRouter,
  apiKey: apiKeyRouter,
  auth: authRouter,
  environment: environmentRouter,
  file: fileRouter,
  fileKey: fileKeyRouter,
  organization: organizationRouter,
  project: projectRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;
