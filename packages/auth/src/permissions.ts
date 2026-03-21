import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const permissionStatements = {
  ...defaultStatements,
  project: ["create", "read", "update", "delete"],
  environment: ["create", "read", "update", "delete"],
  personalEnvironment: ["create"],
  apiKey: ["create", "read", "delete"],
  fileKey: ["read", "update", "delete"],
  invitation: ["read"],
  analytics: ["read"],
} as const;

const accessControl = createAccessControl(permissionStatements);


const adminRole = accessControl.newRole({
  ...adminAc.statements,
  project: ["create", "read", "update", "delete"],
  environment: ["create", "read", "update", "delete"],
  personalEnvironment: ["create"],
  apiKey: ["create", "read", "delete"],
  fileKey: ["read", "update", "delete"],
  invitation: ["read"],
  analytics: ["read"],
});
const ownerRole = accessControl.newRole({
  ...ownerAc.statements,
  ...adminRole.statements,
});

const memberRole = accessControl.newRole({
  ...memberAc.statements,
  project: ["read"],
  environment: ["read"],
  personalEnvironment: ["create"],
  apiKey: [],
  fileKey: ["read"],
  invitation: [],
  analytics: ["read"],
});

export const organizationAccessControl = accessControl;
export const organizationRoles = {
  owner: ownerRole,
  admin: adminRole,
  member: memberRole,
} as const;

export type RoleName = keyof typeof organizationRoles;
export type PermissionStatement = typeof permissionStatements;
export type PermissionResource = keyof PermissionStatement;
export type PermissionAction<TResource extends PermissionResource> =
  PermissionStatement[TResource][number];
export type PermissionCheck = {
  [TResource in PermissionResource]?: PermissionAction<TResource>[];
};

export function roleHasPermissions(
  role: string,
  permissions: PermissionCheck,
): boolean {
  const resolvedRole =
    role in organizationRoles ? organizationRoles[role as RoleName] : memberRole;
  const roleStatements = resolvedRole.statements as Record<string, string[]>;

  return Object.entries(permissions).every(([resource, requiredActions]) => {
    if (requiredActions.length === 0) {
      return true;
    }
    const allowedActions = roleStatements[resource] ?? [];
    return requiredActions.every((action) => allowedActions.includes(action));
  });
}
