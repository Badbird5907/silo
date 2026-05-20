export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
}

export interface UserInvitation {
  id: string;
  email?: string;
  organizationId?: string;
  organizationName?: string;
  organizationSlug?: string;
  role?: string;
  status?: string;
  expiresAt?: string | Date;
}

export interface LinkedAccount {
  id?: string;
  accountId?: string;
  providerId?: string;
}
