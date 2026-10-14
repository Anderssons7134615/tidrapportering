import type { CalculationLine, EditableCalculation } from '../types/projectCalculation';
import type { MaterialArticle } from '../types';

export function newCalculationLine(): CalculationLine {
  return { id: crypto.randomUUID(), referenceId: '', category: '', referenceArticle: '', dimension: '', workItem: '', internalDescription: '', customerDescription: '',
    quantity: 1, workUnit: 'm', laborMinutesPerUnit: 0, timeSource: 'ownEstimate', referenceMinutesPerUnit: null,
    pipeDiameterMm: null, insulationMm: null, materialCostExcluded: true, materials: [] };
}
export function newCalculation(name: string, customerName: string, rate?: number | null): EditableCalculation {
  return { name, customerName, customerContact: '', quoteNumber: '', quoteDate: '', validUntil: '', scope: '', terms: '',
    manualBid: 0, customerHourlyRate: rate ?? 500, internalHourlyCost: 313, materialMarkupPercent: 25, wastePercent: 0, vatPercent: 25, lines: [newCalculationLine()] };
}
export function editableCalculation(document: EditableCalculation): EditableCalculation {
  const { name, customerName, customerContact, quoteNumber, quoteDate, validUntil, scope, terms, manualBid,
    customerHourlyRate, internalHourlyCost, materialMarkupPercent, wastePercent, vatPercent, lines } = document;
  return structuredClone({ name, customerName, customerContact, quoteNumber, quoteDate, validUntil, scope, terms, manualBid,
    customerHourlyRate, internalHourlyCost, materialMarkupPercent, wastePercent, vatPercent, lines });
}
export function calculationMaterial(article?: MaterialArticle): CalculationLine['materials'][number] {
  return { id: crypto.randomUUID(), materialArticleId: article?.id || '', materialImportId: '', supplierName: article?.supplier || '',
    description: article?.name || '', articleNumber: article?.articleNumber || '', unit: article?.unit || 'm',
    unitCost: article?.purchasePrice ?? NaN, usagePerWorkUnit: 1,
    sourceText: article ? `${article.priceSource || 'TidApps artikelregister'}${article.priceUpdatedAt ? ` · prisdatum ${article.priceUpdatedAt.slice(0, 10)}` : ' · prisdatum saknas'}` : 'Manuellt inmatat material' };
}
