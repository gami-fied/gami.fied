import { account, db, users } from '@gami/database';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuthSession } from '../authorization/index.js';

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  image: z.string().url('Invalid image URL').optional().nullable(),
  subscribedToSystemEmails: z.boolean().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export async function userProfileRoutes(fastify: FastifyInstance) {
  // GET /api/user/profile - Fetch authenticated user profile & preferences
  fastify.get('/api/user/profile', async (request, reply) => {
    const authResult = await requireAuthSession(request, reply);
    if (!authResult) return;

    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.id, authResult.user.id));

    if (!userRow) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    }

    return reply.send({
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      emailVerified: userRow.emailVerified,
      image: userRow.image || null,
      isPlatformAdmin: userRow.isPlatformAdmin,
      subscribedToSystemEmails:
        userRow.subscribedToSystemEmails === null || userRow.subscribedToSystemEmails === undefined
          ? true
          : Boolean(userRow.subscribedToSystemEmails),
      createdAt: userRow.createdAt,
      updatedAt: userRow.updatedAt,
    });
  });

  // PUT /api/user/profile - Update authenticated user profile & subscription preferences
  fastify.put('/api/user/profile', async (request, reply) => {
    const authResult = await requireAuthSession(request, reply);
    if (!authResult) return;

    const parseResult = updateProfileSchema.safeParse(request.body);
    if (!parseResult.success) {
      const issueMsgs = parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      return reply.status(400).send({
        error: 'Bad Request',
        message: `Invalid profile payload (${issueMsgs})`,
        details: parseResult.error.format(),
      });
    }

    const { name, image, subscribedToSystemEmails, password } = parseResult.data;

    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateFields.name = name;
    if (image !== undefined) updateFields.image = image;
    if (subscribedToSystemEmails !== undefined) {
      updateFields.subscribedToSystemEmails = subscribedToSystemEmails;
    }

    await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, authResult.user.id));

    // Update password in account table if provided
    if (password) {
      await db
        .update(account)
        .set({
          password,
          updatedAt: new Date(),
        })
        .where(eq(account.userId, authResult.user.id));
    }

    const [updatedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, authResult.user.id));

    if (!updatedUser) {
      return reply.status(404).send({ error: 'Not Found', message: 'User profile not found' });
    }

    return reply.send({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified,
        image: updatedUser.image || null,
        isPlatformAdmin: updatedUser.isPlatformAdmin,
        subscribedToSystemEmails:
          updatedUser.subscribedToSystemEmails === null || updatedUser.subscribedToSystemEmails === undefined
            ? true
            : Boolean(updatedUser.subscribedToSystemEmails),
        updatedAt: updatedUser.updatedAt,
      },
    });
  });
}
