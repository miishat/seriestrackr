import type { Format, Release, ReleaseState, Series } from './model';

export const releaseLabels: Record<ReleaseState, string> = {
  'not-checked': 'Not Checked', 'not-found': 'Not Found',
  catalogued: 'Listed', announced: 'Announced',
  scheduled: 'Scheduled', released: 'Available',
};

// Accepted announcements backed only by Hardcover catalogue pages go stale quietly.
// Evidence checked more than this many days before today is flagged for a new reviewed check.
export const OLD_EVIDENCE_DAYS = 90;

const hardcoverOnly = (release: Release): boolean => {
  const urls = release.provenance ? release.provenance.sources.map(source => source.url) : release.source ? [release.source.url] : [];
  return urls.length > 0 && urls.every(url => { try { return (host => host === 'hardcover.app' || host.endsWith('.hardcover.app'))(new URL(url).hostname); } catch { return false; } });
};

export function hasOldAnnouncementEvidence(release: Release, today: string): boolean {
  const checked = (release.provenance?.checkedAt ?? release.lastCheckedAt)?.slice(0, 10);
  if (release.origin !== 'discovery' || release.state !== 'announced' || !checked || !isCalendarDate(checked) || !isCalendarDate(today) || !hardcoverOnly(release)) return false;
  const day = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
  return (day(today) - day(checked)) / 86_400_000 > OLD_EVIDENCE_DAYS;
}

export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

export function localToday(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function displayRelease(r: Release, today: string): ReleaseState {
  if (r.state === 'scheduled' && r.date && isCalendarDate(r.date) && isCalendarDate(today) && r.date <= today) {
    return 'released';
  }
  return r.state;
}

export function displaySeriesRelease(series: Series, format: Format, today: string): ReleaseState {
  const state = displayRelease(series.releases[format], today);
  const check = series.lastCheck;
  return state === 'not-checked' && check && (check.status === 'complete' || check.status === 'partial') && check.formats[format] === 'unknown'
    ? 'not-found' : state;
}
