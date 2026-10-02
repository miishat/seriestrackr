import type { SourceLink } from './discovery';

export type CoverProvider = 'apple' | 'hardcover' | 'googlebooks' | 'openlibrary';
export interface CoverRequest {
  requestId: string; seriesId: string;
  series: string; author: string; nextTitle: string; position: number;
  previousTitle: string | null; preferredMarket: string;
}
export interface CoverCandidate {
  id: string; title: string; author: string;
  role: 'next' | 'previous'; format: 'ebook' | 'print' | 'audio';
  provider: 'apple' | 'hardcover' | 'googlebooks' | 'openlibrary';
  source: SourceLink; imageUrl: string;
  workKey: string; editionKey: string | null;
  width: number | null; height: number | null;
}
export interface AuthorSuggestion {
  author: string; title: string; source: SourceLink;
}
export interface CoverResult {
  requestId: string; seriesId: string; candidates: CoverCandidate[];
  authorSuggestions: AuthorSuggestion[];
  outcomes: { provider: CoverCandidate['provider']; state: 'ok' | 'no-match' | 'quota' | 'failed' }[];
}
