-- Opt-in per user. Existing users retain the full-week requirement.
ALTER TABLE "User" ADD COLUMN "allowIncompleteWeekApproval" BOOLEAN NOT NULL DEFAULT false;
