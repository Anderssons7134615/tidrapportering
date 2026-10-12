import type { QueryClient } from '@tanstack/react-query';
import { refreshProjectQueries } from './projectQueries';

/** Keep reporting, review and payroll consistent after a confirmed time change. */
export async function refreshTimeQueries(client: QueryClient, { projectDataChanged = true } = {}) {
  await Promise.all([
    ...['timeEntries', 'timeEntry', 'copy-yesterday', 'week', 'weekLocks', 'weekDetails', 'team-week-summary', 'report']
      .map((key) => client.invalidateQueries({ queryKey: [key] })),
    ...(projectDataChanged ? [refreshProjectQueries(client)] : []),
  ]);
}
