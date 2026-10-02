import type { CheckResponse, Selection } from '../../../shared/discovery';
import { parseCheckResponse } from '../../../shared/discoveryValidation';
import { normalizeIdentity } from '../../../shared/discoveryPolicy';
import { emptyRelease } from '../library/model';
import { isPortrait } from '../../../shared/coverValidation';
import type { Result, Series } from '../library/model';
import { nextPosition } from '../library/progress';

export function applyDiscovery(series: Series, response: CheckResponse, selection: Selection): Result<Series> {
  if (!selection.title && !selection.book && !selection.audio && !selection.coverId) return { ok: true, value: series };
  const parsed = parseCheckResponse(response);
  if (parsed.ok === false) return parsed;
  if (response.seriesId !== series.id) return { ok: false, error: 'Discovery series does not match.' };
  const identity = response.proposals.identity;
  if (selection.title && !identity) return { ok: false, error: 'No title proposal is available.' };
  if (identity && (identity.position !== nextPosition(series) || normalizeIdentity(identity.author) !== normalizeIdentity(series.author))) {
    return { ok: false, error: 'Discovery title target does not match.' };
  }
  const targetTitle = selection.title && identity ? identity.title : series.next.title;
  for (const format of ['book', 'audio'] as const) {
    if (!selection[format]) continue;
    const proposal = response.proposals.releases[format];
    if (!series.formats[format] || !proposal || response.proposals.conflicts.some(conflict => conflict.format === format)) {
      return { ok: false, error: 'Selected release is unavailable or conflicted.' };
    }
    if (proposal.position !== nextPosition(series) || normalizeIdentity(proposal.title) !== normalizeIdentity(targetTitle)) {
      return { ok: false, error: 'Accept the matching title before accepting its release.' };
    }
  }
  const cover = selection.coverId ? parsed.value.coverCandidates?.find(item => item.id === selection.coverId) : undefined;
  if (selection.coverId) {
    if (!cover) return { ok: false, error: 'Selected cover is unavailable.' };
    const matches = cover.role === 'next' ? !!targetTitle.trim() && normalizeIdentity(cover.title) === normalizeIdentity(targetTitle)
      : !!series.lastFinished && normalizeIdentity(cover.title) === normalizeIdentity(series.lastFinished.title);
    if (!matches) return { ok: false, error: 'Accept the matching title before choosing its cover.' };
    if (cover.format === 'audio' || !/^https?:\/\//i.test(cover.imageUrl) ||
      ((cover.width !== null || cover.height !== null) && (cover.width === null || cover.height === null || !isPortrait(cover.width, cover.height)))) {
      return { ok: false, error: 'Selected cover is not a usable book cover.' };
    }
  }
  const changedTitle = selection.title && identity !== null && normalizeIdentity(identity.title) !== normalizeIdentity(series.next.title);
  let accepted = changedTitle ? {
    ...series,
    next: { ...series.next, title: identity!.title, attribution: response.proposals.identityAttribution },
    releases: { book: emptyRelease(), audio: emptyRelease() },
    // An automatic cover belongs to the old target; a legacy manual URL stays.
    ...(series.coverAttribution ? { coverUrl: null, coverAttribution: null } : {}),
  } : series;
  if (selection.title && identity && !changedTitle) {
    accepted = { ...accepted, next: { ...accepted.next, title: identity.title, attribution: response.proposals.identityAttribution } };
  }
  for (const format of ['book', 'audio'] as const) {
    if (!selection[format]) continue;
    const proposal = response.proposals.releases[format]!;
    const source = proposal.provenance.sources[0];
    accepted = { ...accepted, releases: { ...accepted.releases, [format]: {
      state: proposal.state, date: proposal.date, source: { title: source.title, url: source.url },
      origin: 'discovery', lastCheckedAt: proposal.provenance.checkedAt, provenance: proposal.provenance,
    } } };
  }
  if (cover) {
    accepted = { ...accepted, coverUrl: cover.imageUrl, coverAttribution: {
      title: cover.title, author: cover.author, role: cover.role, source: cover.source, editionKey: cover.editionKey } };
  }
  return { ok: true, value: accepted };
}
