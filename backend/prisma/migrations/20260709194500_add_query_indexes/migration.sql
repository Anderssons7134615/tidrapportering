CREATE INDEX "User_companyId_active_idx" ON "User"("companyId", "active");

CREATE INDEX "TimeEntry_userId_date_idx" ON "TimeEntry"("userId", "date");

CREATE INDEX "TimeEntry_projectId_date_idx" ON "TimeEntry"("projectId", "date");

CREATE INDEX "TimeEntry_status_date_idx" ON "TimeEntry"("status", "date");

CREATE INDEX "WeekLock_status_weekStartDate_idx" ON "WeekLock"("status", "weekStartDate");
