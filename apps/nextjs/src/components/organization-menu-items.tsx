"use client";

import type { Organization } from "@/hooks/use-organization-switcher";
import Link from "next/link";
import { Building2, Check, Plus, Settings } from "lucide-react";

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@silo-storage/ui/components/dropdown-menu";

import { env } from "@/env";

interface OrganizationMenuItemsProps {
  organizations: Organization[];
  activeOrganization: Organization | null;
  onOrganizationChange: (org: Organization) => void;
  onCreateOrganization: () => void;
}

export function OrganizationMenuItems({
  organizations,
  activeOrganization,
  onOrganizationChange,
  onCreateOrganization,
}: OrganizationMenuItemsProps) {
  const canCreateOrg = !env.DISABLE_ORG_CREATION;

  return (
    <>
      <DropdownMenuLabel className="text-muted-foreground text-xs">
        Organizations
      </DropdownMenuLabel>
      {organizations.map((org) => (
        <DropdownMenuItem
          key={org.id}
          onClick={() => onOrganizationChange(org)}
          className="gap-2 p-2"
        >
          <div className="flex size-6 items-center justify-center rounded-md border">
            <Building2 className="size-3.5 shrink-0" />
          </div>
          <span className="flex-1 truncate">{org.name}</span>
          {org.id === activeOrganization?.id && (
            <Check className="text-primary size-4" />
          )}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild className="gap-2 p-2">
        <Link href={`/${activeOrganization?.slug}/settings`}>
          <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
            <Settings className="size-3.5" />
          </div>
          <span className="text-muted-foreground font-medium">
            Organization settings
          </span>
        </Link>
      </DropdownMenuItem>
      {canCreateOrg && (
        <DropdownMenuItem className="gap-2 p-2" onClick={onCreateOrganization}>
          <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
            <Plus className="size-4" />
          </div>
          <span className="text-muted-foreground font-medium">
            Create organization
          </span>
        </DropdownMenuItem>
      )}
    </>
  );
}
