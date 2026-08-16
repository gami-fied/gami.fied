export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  projectId: string;
  externalId: string;
  name: string | null;
  email?: string | null;
  avatarUrl: string | null;
  metadata: Record<string, unknown> | null;
  active: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface UserListResponse {
  page: number;
  limit: number;
  total: number;
  users: User[];
}

export interface CreateUserInput {
  externalId: string;
  name?: string;
  email?: string | null;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateUserInput {
  name?: string;
  email?: string | null;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
  active?: boolean;
}
