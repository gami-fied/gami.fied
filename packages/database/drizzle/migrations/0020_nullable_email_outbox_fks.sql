-- Make project_id, notification_id, user_id nullable on email_notification_outbox to support organization & system emails
ALTER TABLE "email_notification_outbox" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "email_notification_outbox" ALTER COLUMN "notification_id" DROP NOT NULL;
ALTER TABLE "email_notification_outbox" ALTER COLUMN "user_id" DROP NOT NULL;
