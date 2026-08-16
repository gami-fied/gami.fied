# Team Management & Members API

This guide covers organization member listing, role management, member removal, and audit logging.

## Member Management APIs

### 1. List Organization Members
`GET /api/organizations/:organizationId/members`

**Query Parameters:**
- `q`: Search string (filters by user name or email)
- `role`: Filter by role (`owner`, `admin`, `member`)
- `page`: Page number (default: 1)
- `limit`: Page limit (default: 20, max: 100)

### 2. Member Details & Access
`GET /api/organizations/:organizationId/members/:userId`

Returns member account details, organization role, joined date, and list of explicitly assigned projects.

### 3. Update Member Role
`PATCH /api/organizations/:organizationId/members/:userId`

**Body:**
```json
{
  "role": "admin"
}
```

**Security Guards:**
- Requires `owner` or `admin` role.
- Prevents members from modifying their own role.
- Prevents demoting the organization owner.
- Admins cannot promote members to `owner` (requires ownership transfer).

### 4. Remove Member
`DELETE /api/organizations/:organizationId/members/:userId`

**Security Guards:**
- Requires `owner` or `admin` role.
- Prevents removing the organization owner.
- Admins cannot remove other admins or owners.
- Automatically cleans up `member` and `project_members` records.
- Records audit log action `organization.member_removed`.
