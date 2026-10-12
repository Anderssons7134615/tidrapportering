export type InventoryKind = 'RECEIPT' | 'ISSUE' | 'RETURN' | 'COUNT';
export interface InventoryItem {
  id: string; articleId: string; unit: string; shelf: string; revision: number; balance: number;
  article: { id: string; name: string; articleNumber: string | null; category: string; active: boolean; unit: string; pipeDimensionMm: number | null; insulationThicknessMm: number | null };
}
export interface InventoryMovement {
  id: string; itemId: string; kind: InventoryKind; quantityDelta: number; balanceAfter: number;
  articleName: string; unit: string; note: string; createdAt: string; returnableQuantity: number;
  createdByUser: { id: string; name: string }; project: { id: string; code: string; name: string } | null;
}
export interface InventoryMovementInput {
  kind: InventoryKind; quantity: number; revision: number; requestKey: string; note: string;
  projectId?: string; sourceIssueId?: string;
}
export type PendingInventoryMovement = { itemId: string; item: InventoryItem; input: InventoryMovementInput };
