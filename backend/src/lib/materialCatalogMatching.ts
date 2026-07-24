export type MaterialArticleIdentity = {
  articleNumber?: string | null;
  supplier?: string | null;
  name: string;
  unit: string;
};

export type MaterialArticleLookup<T extends MaterialArticleIdentity> = {
  bySupplierArticle: Map<string, T>;
  legacyByArticleNumber: Map<string, T>;
  byNameAndUnit: Map<string, T>;
};

export function articleNumberKey(value: string | null | undefined) {
  return value?.trim().toLocaleUpperCase('sv-SE') || null;
}

function supplierArticleKey(supplier: string | null | undefined, articleNumber: string | null | undefined) {
  const numberKey = articleNumberKey(articleNumber);
  if (!numberKey) return null;
  return `${supplier?.trim().toLocaleUpperCase('sv-SE') || ''}|${numberKey}`;
}

function materialNameKey(name: string, unit: string) {
  return `${name.trim().toLocaleLowerCase('sv-SE')}|${unit.trim().toLocaleLowerCase('sv-SE')}`;
}

export function createMaterialArticleLookup<T extends MaterialArticleIdentity>(
  articles: T[],
): MaterialArticleLookup<T> {
  const lookup: MaterialArticleLookup<T> = {
    bySupplierArticle: new Map(),
    legacyByArticleNumber: new Map(),
    byNameAndUnit: new Map(),
  };

  for (const article of articles) {
    registerMaterialArticle(lookup, article);
  }

  return lookup;
}

export function findMaterialArticleMatch<T extends MaterialArticleIdentity>(
  lookup: MaterialArticleLookup<T>,
  incoming: MaterialArticleIdentity,
) {
  const numberKey = articleNumberKey(incoming.articleNumber);
  if (numberKey) {
    const supplierNumberKey = supplierArticleKey(incoming.supplier, incoming.articleNumber);
    return (supplierNumberKey ? lookup.bySupplierArticle.get(supplierNumberKey) : undefined)
      || lookup.legacyByArticleNumber.get(numberKey);
  }

  return lookup.byNameAndUnit.get(materialNameKey(incoming.name, incoming.unit));
}

export function registerMaterialArticle<T extends MaterialArticleIdentity>(
  lookup: MaterialArticleLookup<T>,
  article: T,
) {
  const supplierNumberKey = supplierArticleKey(article.supplier, article.articleNumber);
  if (supplierNumberKey) lookup.bySupplierArticle.set(supplierNumberKey, article);

  const numberKey = articleNumberKey(article.articleNumber);
  if (numberKey && !article.supplier) lookup.legacyByArticleNumber.set(numberKey, article);

  lookup.byNameAndUnit.set(materialNameKey(article.name, article.unit), article);
}
