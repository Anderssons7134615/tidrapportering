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
  now = new Date(),
}: {
  isManager: boolean;
  pendingCount: number;
  now?: Date;
}) {
  const approvalReminderCount = getDashboardApprovalReminderCount(pendingCount, isManager, now);

  if (!isManager) return { to: '/time-entry', label: 'Rapportera tid', approvalReminderCount };
  if (approvalReminderCount) return { to: '/approval', label: 'Öppna attest', approvalReminderCount };
  return { to: '/projects', label: 'Öppna projekt', approvalReminderCount };
}

export function buildDashboardActionRows({
  isManager,
  missingWeekdays,
  pendingWeeks,
  approvalReminderCount,
}: {
  isManager: boolean;
  missingWeekdays: string[];
  pendingWeeks: string[];
  approvalReminderCount: number;
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
    return [...rows, {
      id: 'manager-projects',
      title: 'Mina projekt',
      description: 'Öppna, redigera och arkivera projekt.',
      tone: 'gray',
      to: '/projects',
    }, {
      id: 'manager-economy',
      title: 'Projektekonomi',
      description: 'Se timmar, budget och resultat när du behöver.',
      tone: 'gray',
      to: '/project-economy',
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
