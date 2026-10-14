import { z } from 'zod';
import { calculateDocumentV1, calculationDocumentSchema, inspectCalculationV1, type CalculationDocument, CalculationError } from './projectCalculations.js';

// Editing uses the same v1 inputs; identity, totals and lifecycle are server-owned.
export const editableCalculationSchema = calculationDocumentSchema.innerType().omit({
  id: true, revision: true, totals: true, status: true, archived: true, createdAt: true, updatedAt: true,
}).strict();
export const editorBodySchema = z.object({
  expectedRevision: z.number().int().min(0).max(1_000_000),
  document: editableCalculationSchema,
}).strict();
export function editorPreview(id: string, input: unknown) {
  z.string().uuid().parse(id);
  const body = editorBodySchema.parse(input);
  const document = { ...body.document, id: `tidapp-${id}`, revision: body.expectedRevision + 1, status: 'draft', archived: false } as CalculationDocument;
  document.totals = calculateDocumentV1(document).totals;
  // Full parser also enforces duplicate line ids and all frozen v1 invariants.
  return inspectCalculationV1({ format: 'andersson-kalkyl-v1', document });
}
export function checkReadyToLock(document: CalculationDocument) {
  if (document.lines.some(line => !line.internalDescription.trim() || !line.workUnit.trim() || line.quantity <= 0
    || line.materials.some(material => !material.description.trim() || !material.unit.trim() || material.usagePerWorkUnit <= 0))) {
    throw new CalculationError('Fyll i beskrivning, enhet och mängd större än noll på alla rader före låsning.');
  }
}
