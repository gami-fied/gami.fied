import type { HttpClient } from './http.js';
import type {
  OrganizationRecord,
  OrganizationMemberRecord,
  OrganizationInvitationRecord,
  ProjectMemberRecord,
  InviteMemberParams,
} from './types.js';

export class OrganizationsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List organizations user belongs to.
   */
  async list(): Promise<OrganizationRecord[]> {
    return this.http.request<OrganizationRecord[]>({
      method: 'GET',
      path: '/api/organizations',
    });
  }

  /**
   * Get organization by ID.
   */
  async get(organizationId: string): Promise<OrganizationRecord> {
    return this.http.request<OrganizationRecord>({
      method: 'GET',
      path: `/api/organizations/${organizationId}`,
    });
  }

  /**
   * Create a new organization.
   */
  async create(name: string, slug: string): Promise<OrganizationRecord> {
    return this.http.request<OrganizationRecord>({
      method: 'POST',
      path: '/api/organizations',
      body: { name, slug },
    });
  }

  /**
   * Update organization details.
   */
  async update(organizationId: string, data: { name?: string; slug?: string }): Promise<OrganizationRecord> {
    return this.http.request<OrganizationRecord>({
      method: 'PATCH',
      path: `/api/organizations/${organizationId}`,
      body: data,
    });
  }

  /**
   * Delete organization.
   */
  async delete(organizationId: string): Promise<{ success: boolean; message: string }> {
    return this.http.request<{ success: boolean; message: string }>({
      method: 'DELETE',
      path: `/api/organizations/${organizationId}`,
    });
  }

  /**
   * List organization members.
   */
  async listMembers(
    organizationId: string,
    params?: { q?: string; role?: string; page?: number; limit?: number }
  ): Promise<{ members: OrganizationMemberRecord[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    return this.http.request({
      method: 'GET',
      path: `/api/organizations/${organizationId}/members`,
      query: {
        q: params?.q,
        role: params?.role,
        page: params?.page,
        limit: params?.limit,
      },
    });
  }

  /**
   * Get organization member details.
   */
  async getMember(organizationId: string, userId: string): Promise<{ member: OrganizationMemberRecord; projects: Array<{ id: string; name: string; slug: string }> }> {
    return this.http.request({
      method: 'GET',
      path: `/api/organizations/${organizationId}/members/${userId}`,
    });
  }

  /**
   * Update organization member role.
   */
  async updateMemberRole(organizationId: string, userId: string, role: 'owner' | 'admin' | 'member'): Promise<OrganizationMemberRecord> {
    return this.http.request<OrganizationMemberRecord>({
      method: 'PATCH',
      path: `/api/organizations/${organizationId}/members/${userId}`,
      body: { role },
    });
  }

  /**
   * Remove member from organization.
   */
  async removeMember(organizationId: string, userId: string): Promise<{ success: boolean; message: string }> {
    return this.http.request<{ success: boolean; message: string }>({
      method: 'DELETE',
      path: `/api/organizations/${organizationId}/members/${userId}`,
    });
  }

  /**
   * Invite member to organization by email.
   */
  async inviteMember(organizationId: string, params: InviteMemberParams): Promise<OrganizationInvitationRecord> {
    return this.http.request<OrganizationInvitationRecord>({
      method: 'POST',
      path: `/api/organizations/${organizationId}/invitations`,
      body: params,
    });
  }

  /**
   * List invitations for organization.
   */
  async listInvitations(organizationId: string): Promise<{ invitations: OrganizationInvitationRecord[] }> {
    return this.http.request<{ invitations: OrganizationInvitationRecord[] }>({
      method: 'GET',
      path: `/api/organizations/${organizationId}/invitations`,
    });
  }

  /**
   * Resend invitation.
   */
  async resendInvitation(organizationId: string, invitationId: string): Promise<OrganizationInvitationRecord> {
    return this.http.request<OrganizationInvitationRecord>({
      method: 'POST',
      path: `/api/organizations/${organizationId}/invitations/${invitationId}/resend`,
    });
  }

  /**
   * Revoke invitation.
   */
  async revokeInvitation(organizationId: string, invitationId: string): Promise<{ success: boolean; message: string }> {
    return this.http.request<{ success: boolean; message: string }>({
      method: 'DELETE',
      path: `/api/organizations/${organizationId}/invitations/${invitationId}`,
    });
  }

  /**
   * Public details query for invitation token.
   */
  async getInvitation(token: string): Promise<OrganizationInvitationRecord> {
    return this.http.request<OrganizationInvitationRecord>({
      method: 'GET',
      path: `/api/invitations/${token}`,
    });
  }

  /**
   * Accept invitation with token.
   */
  async acceptInvitation(token: string): Promise<{ success: boolean; message: string; organizationId: string }> {
    return this.http.request<{ success: boolean; message: string; organizationId: string }>({
      method: 'POST',
      path: `/api/invitations/${token}/accept`,
    });
  }

  /**
   * Decline invitation with token.
   */
  async declineInvitation(token: string): Promise<{ success: boolean; message: string }> {
    return this.http.request<{ success: boolean; message: string }>({
      method: 'POST',
      path: `/api/invitations/${token}/decline`,
    });
  }

  /**
   * Transfer organization ownership.
   */
  async transferOwnership(organizationId: string, targetUserId: string): Promise<{ success: boolean; message: string; previousOwnerRole: string; newOwnerId: string }> {
    return this.http.request({
      method: 'POST',
      path: `/api/organizations/${organizationId}/transfer-ownership`,
      body: { targetUserId },
    });
  }

  /**
   * List project members.
   */
  async listProjectMembers(projectId: string): Promise<{ members: ProjectMemberRecord[] }> {
    return this.http.request<{ members: ProjectMemberRecord[] }>({
      method: 'GET',
      path: `/api/projects/${projectId}/members`,
    });
  }

  /**
   * Add organization member to a project.
   */
  async addProjectMember(projectId: string, userId: string, role?: string): Promise<ProjectMemberRecord> {
    return this.http.request<ProjectMemberRecord>({
      method: 'POST',
      path: `/api/projects/${projectId}/members`,
      body: { userId, role },
    });
  }

  /**
   * Remove member from a project.
   */
  async removeProjectMember(projectId: string, userId: string): Promise<{ success: boolean; message: string }> {
    return this.http.request<{ success: boolean; message: string }>({
      method: 'DELETE',
      path: `/api/projects/${projectId}/members/${userId}`,
    });
  }
}
