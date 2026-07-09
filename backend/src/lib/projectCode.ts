export function getNextProjectCodeFromCodes(codes: Array<string | null | undefined>) {
  const matches: Array<{ prefix: string; number: number; width: number; digits: string }> = [];

  for (const rawCode of codes) {
    const code = rawCode?.trim();
    const match = code?.match(/^(.*?)(\d+)$/);
    if (!match) continue;

    const number = Number.parseInt(match[2], 10);
    if (!Number.isFinite(number)) continue;

    matches.push({ prefix: match[1], number, width: match[2].length, digits: match[2] });
  }

  if (!matches.length) return '1';

  const fullPaddedNumbers = matches.filter((match) => match.prefix === '' && match.digits.length > 1 && match.digits.startsWith('0'));
  const paddedSuffixes = matches.filter((match) => match.digits.length > 1 && match.digits.startsWith('0'));
  const candidates = fullPaddedNumbers.length ? fullPaddedNumbers : paddedSuffixes.length ? paddedSuffixes : matches;
  const preferredWidth = getPreferredCodeWidth(candidates);
  const widthMatches = candidates.filter((match) => match.width === preferredWidth);
  const bestMatch = widthMatches.reduce((best, match) => match.number > best.number ? match : best, widthMatches[0]);

  if (!bestMatch) return '1';
  return `${bestMatch.prefix}${String(bestMatch.number + 1).padStart(bestMatch.width, '0')}`;
}

function getPreferredCodeWidth(matches: Array<{ number: number; width: number }>) {
  const widths = new Map<number, { count: number; maxNumber: number }>();

  for (const match of matches) {
    const current = widths.get(match.width) || { count: 0, maxNumber: 0 };
    widths.set(match.width, {
      count: current.count + 1,
      maxNumber: Math.max(current.maxNumber, match.number),
    });
  }

  return Array.from(widths.entries())
    .sort((a, b) => b[1].count - a[1].count || b[1].maxNumber - a[1].maxNumber || b[0] - a[0])[0][0];
}
