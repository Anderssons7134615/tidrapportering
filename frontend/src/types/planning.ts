export type PlanningWeek = { startDate: string; note: string; people: { name: string; days: string[]; assignments?: string[][] }[] };
export type PlanningDocument = { weeks: PlanningWeek[]; jobs: { name: string; details: string; deadline: string }[]; issues: string };
export type PlanningBoard = { id: string; document: PlanningDocument; revision: number; updatedAt: string };
export type PlanningComment = { id: string; content: string; createdAt: string; author: { id: string; name: string } };
