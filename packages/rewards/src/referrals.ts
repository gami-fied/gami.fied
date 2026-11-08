import crypto from 'crypto';
import { currencies, db, endUsers, isUniqueViolation, referralCodes, referralPrograms, referrals, type Referral } from '@gami/database';
import { createWebhookDelivery } from '@gami/webhooks';
import { and, count, eq } from 'drizzle-orm';
import { awardXp } from './award-xp.js';
import { creditWallet } from './wallet.js';

/** Invites only count for people who joined recently, so nobody claims old friends for a reward. */
export const REFERRAL_CLAIM_WINDOW_DAYS = 30;

export class ReferralError extends Error {
  constructor(
    public readonly code: 'NO_PROGRAM' | 'INVALID_CODE' | 'SELF_REFERRAL' | 'ALREADY_REFERRED' | 'TOO_LATE' | 'USER_NOT_FOUND',
    message: string,
    public readonly status = 409
  ) {
    super(message);
    this.name = 'ReferralError';
  }
}

// No 0/O or 1/I, so a code read aloud or typed from a screen works.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(): string {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

/** A person's invite code. It is made the first time it is asked for, and never changes. */
export async function referralCodeFor(projectId: string, userId: string): Promise<string> {
  const [existing] = await db.select({ code: referralCodes.code }).from(referralCodes).where(and(eq(referralCodes.projectId, projectId), eq(referralCodes.userId, userId)));
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [created] = await db
        .insert(referralCodes)
        .values({ id: `rfc_${crypto.randomUUID()}`, projectId, userId, code: newCode() })
        .onConflictDoNothing({ target: [referralCodes.projectId, referralCodes.userId] })
        .returning({ code: referralCodes.code });
      if (created) return created.code;
      const [winner] = await db.select({ code: referralCodes.code }).from(referralCodes).where(and(eq(referralCodes.projectId, projectId), eq(referralCodes.userId, userId)));
      if (winner) return winner.code;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // a code clash: try another
    }
  }
  throw new Error('Could not make a unique invite code');
}

export async function getReferralProgram(projectId: string) {
  const [program] = await db.select().from(referralPrograms).where(eq(referralPrograms.projectId, projectId));
  return program ?? null;
}

/**
 * Records that `refereeId` joined with someone's code. When the program has no qualifying event,
 * both are rewarded straight away; otherwise when the new player first sends that event.
 */
export async function claimReferral(projectId: string, refereeId: string, rawCode: string): Promise<Referral> {
  const program = await getReferralProgram(projectId);
  if (!program?.enabled) throw new ReferralError('NO_PROGRAM', 'Invites are not turned on for this project', 404);

  const code = rawCode.trim().toUpperCase();
  const [owner] = await db.select({ userId: referralCodes.userId }).from(referralCodes).where(and(eq(referralCodes.projectId, projectId), eq(referralCodes.code, code)));
  if (!owner) throw new ReferralError('INVALID_CODE', 'That invite code is not valid', 404);
  if (owner.userId === refereeId) throw new ReferralError('SELF_REFERRAL', 'You cannot use your own invite code');

  const [referee] = await db.select({ createdAt: endUsers.createdAt }).from(endUsers).where(and(eq(endUsers.projectId, projectId), eq(endUsers.id, refereeId)));
  if (!referee) throw new ReferralError('USER_NOT_FOUND', 'User not found', 404);
  if (Date.now() - referee.createdAt.getTime() > REFERRAL_CLAIM_WINDOW_DAYS * 86_400_000) {
    throw new ReferralError('TOO_LATE', `Invite codes can only be used in your first ${REFERRAL_CLAIM_WINDOW_DAYS} days`);
  }

  const [created] = await db
    .insert(referrals)
    .values({ id: `ref_${crypto.randomUUID()}`, projectId, referrerId: owner.userId, refereeId })
    .onConflictDoNothing()
    .returning();
  if (!created) throw new ReferralError('ALREADY_REFERRED', 'This person has already used an invite code');

  if (!program.qualifyingEvent) return (await rewardReferral(created.id)) ?? created;
  return created;
}

/** Rewards a pending invite once the new player sends the qualifying event. Called for every event. */
export async function qualifyReferral(projectId: string, refereeId: string, eventType: string): Promise<Referral | null> {
  const program = await getReferralProgram(projectId);
  if (!program?.enabled || !program.qualifyingEvent || program.qualifyingEvent !== eventType) return null;
  const [pending] = await db
    .select({ id: referrals.id })
    .from(referrals)
    .where(and(eq(referrals.projectId, projectId), eq(referrals.refereeId, refereeId), eq(referrals.status, 'pending')));
  if (!pending) return null;
  return rewardReferral(pending.id);
}

/**
 * Pays both sides once, in one transaction. If the inviter has reached the program's limit the
 * invite is still recorded, as `capped`, and only the new player is rewarded.
 */
async function rewardReferral(referralId: string): Promise<Referral | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(referrals).where(eq(referrals.id, referralId)).for('update');
    if (!row || row.status !== 'pending') return row ?? null;
    const [program] = await tx.select().from(referralPrograms).where(eq(referralPrograms.projectId, row.projectId));
    if (!program) return row;

    // Count under a lock on the inviter, so two invites finishing together cannot both slip under the cap.
    await tx.select({ id: endUsers.id }).from(endUsers).where(eq(endUsers.id, row.referrerId)).for('update');
    const [done] = await tx
      .select({ total: count() })
      .from(referrals)
      .where(and(eq(referrals.projectId, row.projectId), eq(referrals.referrerId, row.referrerId), eq(referrals.status, 'rewarded')));
    const capped = program.maxRewardsPerReferrer !== null && (done?.total ?? 0) >= program.maxRewardsPerReferrer;

    if (!capped && program.referrerXp > 0) {
      await awardXp(tx, { projectId: row.projectId, userId: row.referrerId, amount: program.referrerXp, reason: 'Invited a friend', idempotencyKey: `referral:${row.id}:referrer`, metadata: { referralId: row.id } });
    }
    if (program.refereeXp > 0) {
      await awardXp(tx, { projectId: row.projectId, userId: row.refereeId, amount: program.refereeXp, reason: 'Joined with an invite', idempotencyKey: `referral:${row.id}:referee`, metadata: { referralId: row.id } });
    }
    if (!capped && program.currencyKey && program.referrerCurrency > 0) {
      const [currency] = await tx.select().from(currencies).where(and(eq(currencies.projectId, row.projectId), eq(currencies.key, program.currencyKey)));
      if (currency?.enabled) {
        await creditWallet(tx, currency, { projectId: row.projectId, userId: row.referrerId, amount: program.referrerCurrency, reason: 'Invited a friend', kind: 'earn', metadata: { referralId: row.id }, idempotencyKey: `referral:${row.id}:currency` });
      }
    }

    const [updated] = await tx.update(referrals).set({ status: capped ? 'capped' : 'rewarded', qualifiedAt: new Date() }).where(eq(referrals.id, row.id)).returning();
    await createWebhookDelivery(tx, {
      projectId: row.projectId,
      eventId: `${row.id}:completed`,
      eventType: 'referral.completed',
      userId: row.referrerId,
      data: { referralId: row.id, referrerId: row.referrerId, refereeId: row.refereeId, rewarded: !capped },
    });
    return updated!;
  });
}
