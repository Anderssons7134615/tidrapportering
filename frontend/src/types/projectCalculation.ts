export interface CalculationLine {
  referenceId: string; category: string; workItem: string; referenceMinutesPerUnit: number | null;
  pipeDiameterMm: number | null; insulationMm: number | null;
  masterMomentId?: string; masterStatus?: string; masterNotes?: string;
  id: string; internalDescription: string; customerDescription: string; quantity: number; workUnit: string;
  referenceArticle: string; dimension: string; laborMinutesPerUnit: number; timeSource: string; materialCostExcluded: boolean;
  materials: Array<{ id: string; materialArticleId: string; materialImportId: string; supplierName: string; description: string; articleNumber: string; unit: string; unitCost: number; usagePerWorkUnit: number; sourceText: string }>;
}
export interface EditableCalculation {
  name: string; customerName: string; customerContact: string; quoteNumber: string; quoteDate: string; validUntil: string;
  scope: string; terms: string; manualBid: number; customerHourlyRate: number; internalHourlyCost: number;
  materialMarkupPercent: number; wastePercent: number; vatPercent: number; lines: CalculationLine[];
}
export interface CalculationPreview {
  fingerprint: string;
  document: EditableCalculation & {
    id: string; revision: number; name: string; customerName: string; quoteNumber: string;
    quoteDate: string; validUntil: string; scope: string; terms: string; manualBid: number;
    status: string; lines: CalculationLine[];
  };
  totals: { materialCostWithWaste: number; laborHours: number; internalLaborCost: number; directCost: number; calculatedPrice: number };
  rows: Array<{ id: string; laborHours: number; materialCost: number; calculatedPrice: number }>;
}
export interface SavedCalculation extends CalculationPreview { id: string; createdAt: string; importedBy: string }
export interface CalculationListItem { id: string; name: string; sourceId: string; sourceRevision: number; createdAt: string }
export interface CalculationDraft extends CalculationPreview { id: string; revision: number; updatedAt: string; lockedCalculationId: string | null }
export interface CalculationDraftListItem { id: string; name: string; revision: number; updatedAt: string }
