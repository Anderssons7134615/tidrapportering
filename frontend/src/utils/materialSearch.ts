import type { MaterialArticle } from '../types';

function normalize(value: string) {
  return value
    .toLocaleLowerCase('sv-SE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function searchableArticle(article: MaterialArticle) {
  const text = normalize([
    article.name,
    article.articleNumber,
    article.category,
    article.supplier,
    article.manufacturer,
    article.originalDescription,
    article.searchTerms,
    article.pipeDimensionMm,
    article.insulationThicknessMm,
  ].filter((value) => value != null && value !== '').join(' '));

  return {
    text,
    compact: text.replace(/\s/g, ''),
    name: normalize(article.name),
    articleNumber: normalize(article.articleNumber || ''),
  };
}

export function searchMaterialArticles(articles: MaterialArticle[], query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return articles;

  const words = normalizedQuery.split(' ').filter(Boolean);
  const compactQuery = normalizedQuery.replace(/\s/g, '');

  return articles
    .map((article, index) => {
      const searchable = searchableArticle(article);
      const matches = words.every((word) => searchable.text.includes(word))
        || searchable.compact.includes(compactQuery);

      if (!matches) return null;

      let score = 4;
      if (searchable.articleNumber === normalizedQuery || searchable.name === normalizedQuery) score = 0;
      else if (searchable.articleNumber.startsWith(normalizedQuery) || searchable.name.startsWith(normalizedQuery)) score = 1;
      else if (searchable.compact.startsWith(compactQuery)) score = 2;
      else if (searchable.text.includes(normalizedQuery)) score = 3;

      return { article, index, score };
    })
    .filter((match): match is { article: MaterialArticle; index: number; score: number } => Boolean(match))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((match) => match.article);
}
