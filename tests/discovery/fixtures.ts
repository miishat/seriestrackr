import { emptyUsage } from '../../shared/discovery';
import type { CheckRequest, CheckResponse, EditionEvidence, EvidenceBundle, IdentityEvidence, Source } from '../../shared/discovery';
import { selectProposals } from '../../shared/discoveryPolicy';

const checkedAt = '2026-09-29T12:00:00Z';

export function request(overrides: Partial<CheckRequest> = {}): CheckRequest {
  return {
    requestId: 'r1', seriesId: 'series-1',
    target: { series: 'Example', author: 'Example Author', position: 2, title: 'Second', orderNote: '' },
    preferredMarket: 'CA', formats: ['book', 'audio'], useAi: false, useSearch: true, fallbackMarkets: true,
    ...overrides,
  };
}

export function edition(overrides: Partial<EditionEvidence> = {}): EditionEvidence {
  const item: EditionEvidence = {
    id: 'e1', title: 'Second', author: 'Example Author', position: 2,
    editionKey: 'isbn:test-1', format: 'ebook', language: 'en', market: 'CA',
    date: '2027-03-01', precision: 'day',
    citations: [{ sourceId: 's1', quote: 'English ebook in Canada: 2027-03-01.' }],
    ...overrides,
  };
  if (!('citations' in overrides)) {
    const language = item.language === 'en' ? 'English' : item.language ?? 'Unknown-language';
    const market = item.market === 'CA' ? 'Canada' : item.market ?? 'unspecified market';
    item.citations = [{ sourceId: 's1', quote: `${language} ${item.format} in ${market}: ${item.date ?? 'date unknown'}.` }];
  }
  return item;
}

export function bundle(editions: EditionEvidence[], identities: IdentityEvidence[] = []): EvidenceBundle {
  const allCitations = [...editions.flatMap(item => item.citations), ...identities.flatMap(item => item.citations)];
  const sources: Source[] = [...new Set(allCitations.map(item => item.sourceId))].map(id => {
    const cited = editions.filter(item => item.citations.some(citation => citation.sourceId === id));
    const sourceText = cited.map(item => {
      const language = item.language === 'en' ? 'English' : item.language ?? 'Unknown-language';
      const market = item.market === 'CA' ? 'Canada' : item.market ?? 'unspecified market';
      return `${item.title} by ${item.author}. Book ${item.position ?? 'unknown'}. ${language} ${item.format} in ${market}: ${item.date ?? 'date unknown'}.`;
    }).join(' ');
    const identityText = identities.filter(item => item.citations.some(citation => citation.sourceId === id))
      .map(item => `${item.title} by ${item.author}. Book ${item.position}.`).join(' ');
    return {
      id, title: 'Second by Example Author', url: `https://example.com/${id === 's1' ? 'second' : id}`,
      provider: 'tavily', market: cited[0]?.market ?? null, retrievedAt: checkedAt,
      text: `${sourceText} ${identityText}`.trim(),
    };
  });
  return { sources, identities, editions };
}

export function response(overrides: Partial<CheckResponse> = {}): CheckResponse {
  const req = request();
  const evidence = bundle([edition()]);
  const proposals = selectProposals(req, evidence, checkedAt);
  return {
    requestId: req.requestId, seriesId: req.seriesId,
    summary: {
      requestId: req.requestId, checkedAt, status: 'complete', reasons: [],
      formats: { book: proposals.releases.book ? 'supported' : 'unknown', audio: proposals.releases.audio ? 'supported' : 'unknown' },
      usage: emptyUsage(),
    },
    proposals, sources: evidence.sources.map(({ id, title, url }) => ({ id, title, url })),
    ...overrides,
  };
}
