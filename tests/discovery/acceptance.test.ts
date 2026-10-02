import { expect, test } from 'vitest';
import { applyDiscovery } from '../../src/features/discovery/acceptDiscovery';
import { createDiscoveryGuard } from '../../src/features/discovery/discoveryGuard';
import { seriesFixture } from '../fixtures';
import { response } from './fixtures';

test('rejecting every field preserves the original object and bytes', () => {
  const original = seriesFixture();
  const result = applyDiscovery(original, response({ seriesId: original.id }), { title: false, book: false, audio: false });
  expect(result).toEqual({ ok: true, value: original });
  if (result.ok) expect(result.value).toBe(original);
});

test('same-title acceptance preserves unselected manual audio and progress', () => {
  const original = seriesFixture();
  const result = applyDiscovery(original, response({ seriesId: original.id }), { title: false, book: true, audio: false });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.releases.audio).toBe(original.releases.audio);
    expect(result.value.lastFinished).toBe(original.lastFinished);
    expect(result.value.releases.book.origin).toBe('discovery');
  }
});

test('missing selected bundles and wrong target fail atomically', () => {
  const original = seriesFixture();
  expect(applyDiscovery(original, response({ seriesId: original.id }), { title: false, book: false, audio: true }).ok).toBe(false);
  expect(applyDiscovery(original, response(), { title: false, book: true, audio: false }).ok).toBe(false);
});

function newTitleResponse() {
  const checked = response({ seriesId: 's1' });
  const proposal = checked.proposals.releases.book!;
  checked.proposals.identity = { title: 'New Second', author: 'Example Author', position: 2, citations: proposal.citations };
  checked.proposals.identityAttribution = { checkedAt: proposal.provenance.checkedAt, sources: proposal.provenance.sources };
  checked.proposals.releases.book = { ...proposal, title: 'New Second' };
  return checked;
}

test.each(['Second', ''])('new-title acceptance preserves the cover and resets old audio with current title "%s"', currentTitle => {
  const original = seriesFixture({ coverUrl: 'https://example.com/old.jpg' });
  original.next.title = currentTitle;
  const result = applyDiscovery(original, newTitleResponse(), { title: true, book: true, audio: false });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.next.title).toBe('New Second');
    expect(result.value.next.attribution).not.toBeNull();
    expect(result.value.coverUrl).toBe(original.coverUrl);
    expect(result.value.releases.audio.provenance).toBeNull();
    expect(result.value.releases.audio.state).toBe('not-checked');
    expect(result.value.readingStatus).toBe(original.readingStatus);
    expect(result.value.latestPublishedPosition).toBe(original.latestPublishedPosition);
  }
});

test('rejecting a new title prohibits dependent dates and title alone clears old bundles', () => {
  const original = seriesFixture();
  expect(applyDiscovery(original, newTitleResponse(), { title: false, book: true, audio: false }).ok).toBe(false);
  const accepted = applyDiscovery(original, newTitleResponse(), { title: true, book: false, audio: false });
  if (accepted.ok === true) expect(accepted.value.releases.book.state).toBe('not-checked');
  else throw new Error(accepted.error);
});

test('conflicts and positions cannot be accepted even when a proposal exists', () => {
  const original = seriesFixture();
  const conflicted = response({ seriesId: 's1' });
  conflicted.proposals.conflicts = [{ format: 'book', evidenceIds: ['a', 'b'], reason: 'Same edition has conflicting dates' }];
  expect(applyDiscovery(original, conflicted, { title: false, book: true, audio: false }).ok).toBe(false);
  const wrongPosition = response({ seriesId: 's1' });
  wrongPosition.proposals.releases.book!.position = 3;
  expect(applyDiscovery(original, wrongPosition, { title: false, book: true, audio: false }).ok).toBe(false);
});

test('normalized title and author matching preserve unselected same-work data', () => {
  const original = seriesFixture({ coverUrl: 'https://example.com/old.jpg' });
  const checked = newTitleResponse();
  checked.proposals.identity!.title = ' ＳＥＣＯＮＤ ';
  checked.proposals.identity!.author = ' EXAMPLE   AUTHOR ';
  checked.proposals.releases.book!.title = 'second';
  const accepted = applyDiscovery(original, checked, { title: true, book: true, audio: false });
  expect(accepted.ok).toBe(true);
  if (accepted.ok) {
    expect(accepted.value.coverUrl).toBe(original.coverUrl);
    expect(accepted.value.releases.audio).toBe(original.releases.audio);
    expect(accepted.value.next.title).toBe(' ＳＥＣＯＮＤ ');
  }
  const kept = applyDiscovery(original, checked, { title: false, book: true, audio: false });
  expect(kept.ok).toBe(true);
  if (kept.ok) expect(kept.value.next.title).toBe(original.next.title);
});

test('guard rejects superseded requests, content ABA and replacement ABA', () => {
  const guard = createDiscoveryGuard();
  const first = guard.begin('s1', 'r1');
  const second = guard.begin('s1', 'r2');
  expect(guard.isCurrent(first)).toBe(false);
  expect(guard.isCurrent(second)).toBe(true);
  guard.touch('s1');
  expect(guard.isCurrent(second)).toBe(false);
  const third = guard.begin('s1', 'r3');
  guard.replace();
  expect(guard.isCurrent(third)).toBe(false);
  const fourth = guard.begin('s1', 'r4');
  guard.cancel('s1');
  expect(guard.isCurrent(fourth)).toBe(false);
});
