import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import {
  organizationAccessControl,
  organizationRoles,
} from "@silo-storage/auth/permissions";

const organizationPluginOptions =
  {
    ac: organizationAccessControl,
    roles: organizationRoles,
  } as Parameters<typeof organizationClient>[0];

export const authClient = createAuthClient({
  plugins: [
    organizationClient(organizationPluginOptions),
  ],
});
