import { calculateDocumentV1, type CalculationDocument } from './projectCalculations.js';

// Synthetic fixture only; never a real customer's estimate.
export function calculationFixture() {
  const document = {
    id: 'synthetic-estimate', revision: 1, name: 'TEST Kalkyl', customerName: 'TEST Kund', customerContact: '',
    quoteNumber: 'TEST-01', quoteDate: '2026-10-13', validUntil: '2026-11-13', scope: 'Syntetiskt arbete', terms: '',
    status: 'draft', archived: false, manualBid: 90000, customerHourlyRate: 490, internalHourlyCost: 313,
    materialMarkupPercent: 25, wastePercent: 10, vatPercent: 25,
    lines: [{ id: 'line-1', referenceId: 'prisa-5', category: 'Lamell_kondens_Spiro', referenceArticle: 'Lamell 30mm',
      dimension: '160', workItem: 'Löpmeter', internalDescription: 'TEST montage', customerDescription: 'Isolering',
      quantity: 10, workUnit: 'm', laborMinutesPerUnit: 9, timeSource: 'historicalPrisa', referenceMinutesPerUnit: 9,
      pipeDiameterMm: 160, insulationMm: 20, materialCostExcluded: false,
      materials: [{ id: 'A', materialArticleId: 'article-A', articleNumber: 'A', description: 'TEST material', unit: 'm²',
        unitCost: 79, usagePerWorkUnit: 0.628, materialImportId: 'test-import', supplierName: 'TEST', sourceText: 'Syntetisk prislista' },
      { id: 'B', materialArticleId: 'article-B', articleNumber: 'B', description: 'TEST tejp', unit: 'st',
        unitCost: 10, usagePerWorkUnit: 1, materialImportId: 'test-import', supplierName: 'TEST', sourceText: 'Syntetisk prislista' }],
    }],
  } as CalculationDocument;
  document.totals = calculateDocumentV1(document).totals;
  return { format: 'andersson-kalkyl-v1' as const, document };
}
