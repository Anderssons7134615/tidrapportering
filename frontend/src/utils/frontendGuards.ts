export type FocusTrapAction = 'close' | 'focus-first' | 'focus-last' | null;

export function getFocusTrapAction(
  key: string,
  shiftKey: boolean,
  activeIndex: number,
  itemCount: number
): FocusTrapAction {
  if (key === 'Escape') return 'close';
  if (key !== 'Tab' || itemCount < 1) return null;
  if (shiftKey && activeIndex === 0) return 'focus-last';
  if (!shiftKey && activeIndex === itemCount - 1) return 'focus-first';
  return null;
}

export function getProjectQueryAccess({
  hasProjectId,
  isManager,
  hoursVisibleToCurrentUser,
  employeeCanSeeResults,
}: {
  hasProjectId: boolean;
  isManager: boolean;
  hoursVisibleToCurrentUser?: boolean;
  employeeCanSeeResults?: boolean;
}) {
  return {
    canLoadTimeEntries: hasProjectId && Boolean(hoursVisibleToCurrentUser || employeeCanSeeResults || isManager),
    canLoadManagerSummary: hasProjectId && isManager,
  };
}

export function canModifyProjectMaterial({
  projectActive,
  isManager,
  currentUserId,
  createdByUserId,
  invoiceStatus,
}: {
  projectActive: boolean;
  isManager: boolean;
  currentUserId?: string;
  createdByUserId?: string | null;
  invoiceStatus?: string;
}) {
  if (!projectActive || invoiceStatus === 'INVOICED') return false;
  return isManager || Boolean(currentUserId && createdByUserId === currentUserId);
}

export function getReportExportBlockReason({
  isFetching,
  isError,
  hasReviewData,
}: {
  isFetching: boolean;
  isError: boolean;
  hasReviewData: boolean;
}) {
  if (isFetching) return 'Vänta tills det valda rapportunderlaget har laddats klart.';
  if (isError || !hasReviewData) return 'Rapportunderlaget måste kunna granskas innan export.';
  return null;
}
