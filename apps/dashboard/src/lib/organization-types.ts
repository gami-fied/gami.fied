/** Organization records returned by the dashboard API, which needs a signed-in person. */

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  role?: 'owner' | 'admin' | 'member';
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMemberRecord {
  id: string;
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface InviteMemberParams {
  email: string;
  role?: 'admin' | 'member';
}

export interface OrganizationInvitationRecord {
  id: string;
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
  expiresAt: string;
  inviterId: string;
  inviterName?: string;
  inviterEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  invitationUrl?: string;
  isExpired?: boolean;
}

export interface ProjectMemberRecord {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  createdAt: string;
  name: string | null;
  email: string;
  image: string | null;
}
