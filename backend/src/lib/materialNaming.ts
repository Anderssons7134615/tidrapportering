export type DerivedMaterialIdentity = {
  displayName: string;
  category: 'Armaflex' | 'Rörskål' | 'Övrigt';
  productFamily: string | null;
  manufacturer: string | null;
  pipeDimensionMm: number | null;
  insulationThicknessMm: number | null;
  outerDiameterMm: number | null;
  searchTerms: string;
};

type MaterialIdentityInput = {
  description: string;
  articleNumber?: string | null;
};

const armaflexThicknessByClass: Record<string, number> = {
  '2': 13,
  '4': 19,
};

export function deriveMaterialIdentity(input: MaterialIdentityInput): DerivedMaterialIdentity {
  const description = normalizeWhitespace(input.description);
  const articleNumber = normalizeWhitespace(input.articleNumber || '');
  const source = [articleNumber, description].filter(Boolean).join(' ');
  const armaflexMatch = source.match(
    /(?:^|[^a-z0-9])AF[\s_-]*([24])[\s_-]*0*(\d{1,3})(?=$|[^a-z0-9])/i,
  );

  if (armaflexMatch) {
    const thicknessClass = armaflexMatch[1];
    const pipeDimensionMm = Number.parseInt(armaflexMatch[2], 10);
    const insulationThicknessMm = armaflexThicknessByClass[thicknessClass];
    const displayName = `AF${thicknessClass}${pipeDimensionMm}`;
    const canonicalCode = `AF-${thicknessClass}-${String(pipeDimensionMm).padStart(3, '0')}`;

    return {
      displayName,
      category: 'Armaflex',
      productFamily: 'Armaflex',
      manufacturer: 'Armacell',
      pipeDimensionMm,
      insulationThicknessMm,
      outerDiameterMm: null,
      searchTerms: buildSearchTerms([
        displayName,
        canonicalCode,
        `AF${thicknessClass}-${pipeDimensionMm}`,
        'Armaflex',
        `${insulationThicknessMm} mm`,
        `dim ${pipeDimensionMm}`,
        description,
        articleNumber,
      ]),
    };
  }

  const foldedSource = foldForMatching(source);
  const pipeSectionIndex = foldedSource.search(/\bRORSKAL\b/i);

  if (pipeSectionIndex >= 0) {
    const dimensionMatches = Array.from(
      source
        .slice(pipeSectionIndex)
        .matchAll(/(\d{1,3})\s*[-–—/]\s*(\d{1,3})\s*[-–—/]\s*(\d{1,3})/g),
    );
    const dimensionMatch = dimensionMatches.at(-1);

    if (dimensionMatch) {
      const pipeDimensionMm = Number.parseInt(dimensionMatch[1], 10);
      const insulationThicknessMm = Number.parseInt(dimensionMatch[2], 10);
      const outerDiameterMm = Number.parseInt(dimensionMatch[3], 10);
      const displayName = `Rörskål ${pipeDimensionMm}-${insulationThicknessMm}`;

      return {
        displayName,
        category: 'Rörskål',
        productFamily: 'Rörskål',
        manufacturer: detectManufacturer(source),
        pipeDimensionMm,
        insulationThicknessMm,
        outerDiameterMm,
        searchTerms: buildSearchTerms([
          displayName,
          `Rörskål ${pipeDimensionMm}-${insulationThicknessMm}-${outerDiameterMm}`,
          `dim ${pipeDimensionMm}`,
          `${insulationThicknessMm} mm`,
          `ytterdiameter ${outerDiameterMm} mm`,
          description,
          articleNumber,
        ]),
      };
    }
  }

  const fallbackSource = description || articleNumber;
  const displayName = normalizeReadableDescription(fallbackSource);

  return {
    displayName,
    category: 'Övrigt',
    productFamily: null,
    manufacturer: detectManufacturer(source),
    pipeDimensionMm: null,
    insulationThicknessMm: null,
    outerDiameterMm: null,
    searchTerms: buildSearchTerms([displayName, description, articleNumber]),
  };
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeReadableDescription(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return 'Okänt material';

  const letterWords = normalized.split(' ').filter((word) => /^\p{L}+$/u.test(word));
  const isUppercaseDescription =
    letterWords.length > 0 &&
    letterWords.every((word) => word === word.toLocaleUpperCase('sv-SE'));

  if (!isUppercaseDescription) return normalized;

  let firstLetterWord = true;
  return normalized
    .split(' ')
    .map((word) => {
      if (!/^\p{L}+$/u.test(word)) return word;

      const lowercaseWord = word.toLocaleLowerCase('sv-SE');
      if (!firstLetterWord) return lowercaseWord;

      firstLetterWord = false;
      return lowercaseWord.charAt(0).toLocaleUpperCase('sv-SE') + lowercaseWord.slice(1);
    })
    .join(' ');
}

function foldForMatching(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleUpperCase('sv-SE');
}

function detectManufacturer(value: string) {
  const foldedValue = foldForMatching(value);
  const manufacturers: Array<[RegExp, string]> = [
    [/\bARMACELL\b/, 'Armacell'],
    [/\bISOVER\b/, 'Isover'],
    [/\bPAROC\b/, 'Paroc'],
    [/\bROCKWOOL\b/, 'Rockwool'],
    [/\bKNAUF\b/, 'Knauf'],
  ];

  return manufacturers.find(([pattern]) => pattern.test(foldedValue))?.[1] || null;
}

function buildSearchTerms(values: Array<string | null | undefined>) {
  const uniqueValues = new Map<string, string>();

  for (const value of values) {
    const normalized = normalizeWhitespace(value || '');
    if (!normalized) continue;

    const key = normalized;
    if (!uniqueValues.has(key)) uniqueValues.set(key, normalized);
  }

  return Array.from(uniqueValues.values()).join(' ');
}
