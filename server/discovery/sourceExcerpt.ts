import { ProviderError } from './http';

export const OMITTED = '\n[…]\n';

export function sourceExcerpt(text: string, quotes: string[]): { text: string; mandatory: number } {
  if (quotes.some(quote => quote.includes(OMITTED) || !text.includes(quote))) {
    throw new ProviderError('deepseek', 'invalid-evidence');
  }
  if (text.length <= 512) return { text, mandatory: quotes.length ? Array.from(text).length : 0 };
  type Interval = { start: number; end: number };
  const interval = (start: number, end: number): Interval => {
    start = Math.max(0, start);
    end = Math.min(text.length, end);
    if (start && /[\uDC00-\uDFFF]/.test(text[start])) start--;
    if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end])) end++;
    return { start, end };
  };
  const protectedRanges: Interval[] = [];
  for (const quote of quotes) {
    const at = text.indexOf(quote);
    protectedRanges.push(interval(at - 32, at + quote.length + 32));
  }
  protectedRanges.sort((left, right) => left.start - right.start);
  const merged: Interval[] = [];
  for (const range of protectedRanges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  const windows = merged.map(range => text.slice(range.start, range.end));
  const mandatory = Array.from(windows.join(OMITTED)).length;
  const add = (start: number, end: number) => {
    const range = interval(start, end);
    const window = text.slice(range.start, range.end);
    if (window && !windows.some(existing => existing.includes(window))) windows.push(window);
  };
  add(0, 96);
  const groups = [
    /(?:^|\n)\s*(?:LANGUAGE|RELEASED|RELEASE DATE|PUBLICATION DATE|ISBN)\b/gim,
    /\blanguage\b|\bEnglish\b|\breleased?\b|\bpublication\b|\bISBN\b|\b\d{4}-\d{2}(?:-\d{2})?\b/gi,
  ];
  for (const hints of groups) {
    let count = 0;
    for (const match of text.matchAll(hints)) {
      if (count++ === 8) break;
      add(match.index - 64, match.index + match[0].length + 192);
    }
  }
  if (windows.length === 1 && !quotes.length) return { text, mandatory: 0 };
  if (!windows.includes(text)) windows.push(text);
  return { text: windows.join(OMITTED), mandatory };
}
