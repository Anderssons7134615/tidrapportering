export interface CalculationLine {
  id: string; internalDescription: string; customerDescription: string; quantity: number; workUnit: string;
  referenceArticle: string; dimension: string; laborMinutesPerUnit: number; timeSource: string; materialCostExcluded: boolean;
  materials: Array<{ id: string; description: string; articleNumber: string; unit: string; unitCost: number; usagePerWorkUnit: number; sourceText: string }>;
}
export interface CalculationPreview {
  fingerprint: string;
  document: {
    id: string; revision: number; name: string; customerName: string; quoteNumber: string;
    quoteDate: string; validUntil: string; scope: string; terms: string; manualBid: number;
    status: string; lines: CalculationLine[];
  };
  totals: { materialCostWithWaste: number; laborHours: number; internalLaborCost: number; directCost: number; calculatedPrice: number };
  rows: Array<{ id: string; laborHours: number; materialCost: number; calculatedPrice: number }>;
}
export interface SavedCalculation extends CalculationPreview { id: string; createdAt: string; importedBy: string }
export interface CalculationListItem { id: string; name: string; sourceId: string; sourceRevision: number; createdAt: string }
