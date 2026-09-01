import type { DashboardActionItem } from '../types';

const stockholmWeekday = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm',
  weekday: 'short',
});

export function isFridayInStockholm(now: Date = new Date()) {
  return stockholmWeekday.format(now) === 'Fri';
}

export function getDashboardApprovalReminderCount(pendingCount: number, isManager: boolean, now: Date = new Date()) {
  return isManager && isFridayInStockholm(now) ? pendingCount : 0;
}

export function getDashboardPrimaryAction({
  isManager,
  pendingCount,
  riskCount,
  runningCount,
  now = new Date(),
}: {
  isManager: boolean;
  pendingCount: number;
  riskCount: number;
  runningCount: number;
  now?: Date;
}) {
  const approvalReminderCount = getDashboardApprovalReminderCount(pendingCount, isManager, now);

  if (!isManager) return { to: '/time-entry', label: 'Rapportera tid', approvalReminderCount };
  if (approvalReminderCount) return { to: '/approval', label: 'Öppna attest', approvalReminderCount };
  if (riskCount || runningCount) return { to: '/projects', label: 'Granska projekt', approvalReminderCount };
  return { to: '/team-week', label: 'Öppna teamvecka', approvalReminderCount };
}

export function buildDashboardActionRows({
  isManager,
  missingWeekdays,
  pendingWeeks,
  approvalReminderCount,
  riskCount,
  runningCount,
}: {
  isManager: boolean;
  missingWeekdays: string[];
  pendingWeeks: string[];
  approvalReminderCount: number;
  riskCount: number;
  runningCount: number;
}): DashboardActionItem[] {
  if (isManager) {
    const rows: DashboardActionItem[] = [];
    if (approvalReminderCount) {
      rows.push({
        id: 'pending-approvals',
        title: 'Veckor väntar på attest',
        description: 'Fredagens attestkontroll är redo.',
        tone: 'yellow',
        to: '/approval',
      });
    }
    if (riskCount) {
      rows.push({
        id: 'risk-projects',
        title: `${riskCount} projekt behöver följas upp`,
        description: 'Kontrollera budget och rapporterade timmar.',
        tone: 'red',
        to: '/projects',
      });
    }
    if (runningCount) {
      rows.push({
        id: 'projects-missing-budget',
        title: `${runningCount} löpande projekt saknar budget`,
        description: 'Bedöm om budget eller bevakning behövs.',
        tone: 'yellow',
        to: '/projects',
      });
    }

    return rows.length ? rows : [{
      id: 'manager-status',
      title: 'Inget akut just nu',
      description: 'Teamets tid och projekt ser stabila ut.',
      tone: 'green',
      to: '/team-week',
    }];
  }

  const rows: DashboardActionItem[] = [];
  if (missingWeekdays.length) {
    rows.push({
      id: 'employee-missing-time',
      title: 'Komplettera veckan',
      description: `Saknas: ${missingWeekdays.join(', ')}.`,
      tone: 'yellow',
      to: '/time-entry',
    });
  }
  if (pendingWeeks.length) {
    rows.push({
      id: 'employee-pending-week',
      title: `${pendingWeeks.length} äldre ${pendingWeeks.length === 1 ? 'vecka är' : 'veckor är'} inte inskickad`,
      description: 'Kontrollera och skicka in när tiden är komplett.',
      tone: 'yellow',
      to: '/week',
    });
  }

  return rows.length ? rows : [{
    id: 'employee-week-ok',
    title: 'Veckan är under kontroll',
    description: 'Alla vardagar hittills har rapporterad tid.',
    tone: 'green',
    to: '/week',
  }];
}
