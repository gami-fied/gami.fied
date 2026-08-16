# Organization Management

Gami Community Edition provides full organization tenancy and team collaboration capabilities natively out of the box without external Cloud dependencies.

## Overview

Organizations serve as top-level multi-tenant containers. Every project, user, webhook, integration, and gamification entity belongs to an organization tenant.

## Organization Structure

- **Organization Record**: Contains `id`, `name`, `slug`, `status` (`active` | `suspended`), and timestamps.
- **Single-Owner Invariant**: Every organization must have **exactly 1 Owner**. Ownership can be transferred to any active organization member via atomic transaction.
- **Roles**:
  - `owner`: Full control over organization settings, members, roles, invitations, projects, ownership transfer, and deletion.
  - `admin`: Manage members, invitations, and projects. Cannot demote or remove the Owner, or transfer ownership.
  - `member`: Read access to assigned projects and dashboards according to project access rules.

## REST API Endpoints

- `POST /api/organizations` — Create organization
- `GET /api/organizations` — List organizations for authenticated user
- `GET /api/organizations/:id` — Get organization details
- `PATCH /api/organizations/:id` — Update organization (Owner or Admin)
- `DELETE /api/organizations/:id` — Delete organization (Owner only)
- `POST /api/organizations/:id/transfer-ownership` — Transfer ownership to an active member
