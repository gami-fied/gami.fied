# Centralized Project Authorization & RBAC

Gami enforces centralized project authorization through `requireProjectAccess(request, reply, projectId)` and `checkUserProjectAccess(userId, projectId)`.

## Authorization Matrix

| User Role / Credentials | Project Access Rule | Suspended Org Behavior |
| :--- | :--- | :--- |
| **API Key (`x-api-key`)** | Scope & project ID check | Rejection `403 Forbidden` |
| **Platform Admin (`isPlatformAdmin: true`)** | Unrestricted access across all projects | Rejection `403 Forbidden` |
| **Organization Owner** | Unrestricted access to all projects in org | Rejection `403 Forbidden` |
| **Organization Admin** | Full access to all projects in org | Rejection `403 Forbidden` |
| **Organization Member** | Allowed if explicitly assigned in `project_members` (or if no explicit restrictions set) | Rejection `403 Forbidden` |
| **Non-Member / Outsider** | Denied (`404 Not Found` for IDOR defense) | Rejection `403 Forbidden` |

## Project Membership APIs

- `GET /api/projects/:projectId/members` — List members assigned to project
- `POST /api/projects/:projectId/members` — Add organization member to project (target user **must** be an active organization member)
- `DELETE /api/projects/:projectId/members/:userId` — Remove member from project
