import type { CoverCandidate } from './covers';

export type Format = 'book' | 'audio';
export type EditionFormat = 'ebook' | 'print' | 'audio';
export type Precision = 'day' | 'month' | 'year' | 'none';
export type Publication = 'catalogued' | 'announced' | 'published';
export type Provider = 'apple' | 'openlibrary' | 'googlebooks' | 'tavily' | 'deepseek' | 'hardcover';
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
export interface Target { series: string; author: string; position: number;
  title: string; orderNote: string }
export interface CheckRequest { requestId: string; seriesId: string; target: Target;
  preferredMarket: string; formats: Format[]; useAi: boolean }
export interface SourceLink { id: string; title: string; url: string }
export interface Source extends SourceLink { provider: Provider; market: string | null;
  retrievedAt: string; text: string }
export interface Citation { sourceId: string; quote: string }
export interface IdentityEvidence { title: string; author: string; position: number;
  citations: Citation[] }
export interface EditionEvidence { id: string; title: string; author: string;
  position: number | null; editionKey: string | null; format: EditionFormat;
  language: string | null; market: string | null; date: string | null;
  precision: Precision; publication?: Publication; citations: Citation[] }
export interface RelatedWorkEvidence { title: string; author: string;
  relationship: 'prequel' | 'continuation'; position: null; citations: Citation[] }
export interface EvidenceBundle { sources: Source[]; identities: IdentityEvidence[];
  editions: EditionEvidence[]; related?: RelatedWorkEvidence[] }
export interface Attribution { checkedAt: string; sources: SourceLink[] }
export interface Provenance extends Attribution { preferredMarket: string;
  sourceMarket: string | null; language: 'en'; editionFormat: EditionFormat;
  editionKey: string | null; datePrecision: Precision; interpreted: boolean }
export interface ReleaseProposal { title: string; position: number;
  state: 'catalogued' | 'announced' | 'scheduled' | 'released'; date: string | null;
  provenance: Provenance; citations: Citation[] }
export interface Conflict { format: Format; evidenceIds: string[]; reason: string }
export interface Proposals { identity: IdentityEvidence | null;
  identityAttribution: Attribution | null;
  releases: Record<Format, ReleaseProposal | null>; conflicts: Conflict[];
  related: RelatedWorkEvidence[] }
export type Reason = 'missing-key' | 'quota' | 'timeout' | 'provider-error' |
  'invalid-evidence' | 'budget' | 'unknown-identity' | 'cancelled';
export interface Usage { apple: number; openlibrary: number; googlebooks: number; tavily: number;
  hardcover: number; deepseek: number; inputTokens: number | null; outputTokens: number | null }
export interface CheckSummary { requestId: string; checkedAt: string;
  status: 'complete' | 'partial' | 'failed' | 'cancelled'; reasons: Reason[];
  formats: Record<Format, 'supported' | 'unknown' | 'not-requested'>; usage: Usage }
export interface CheckResponse { requestId: string; seriesId: string;
  summary: CheckSummary; proposals: Proposals; sources: SourceLink[];
  // Session-only exact-work artwork from the same check; never persisted with CheckSummary.
  coverCandidates?: CoverCandidate[] }
export interface Capabilities { search: boolean; ai: boolean; googleBooks: boolean; hardcover: boolean; model: string;
  limits: { search: 3; ai: 1; googleBooks: 2; hardcover: 1; outputTokens: 2048; inputBytes: 20000 };
  pricingAsOf: string; estimatedMaxAiUsd: number }
export interface Selection { title: boolean; book: boolean; audio: boolean }
export interface DiscoverySnapshot { seriesId: string; requestId: string;
  epoch: number; revision: number }
export const emptyUsage = (): Usage => ({ apple: 0, openlibrary: 0, googlebooks: 0, tavily: 0,
  hardcover: 0, deepseek: 0, inputTokens: 0, outputTokens: 0 });

