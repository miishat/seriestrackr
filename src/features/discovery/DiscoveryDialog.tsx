import { useEffect, useState, type ReactNode } from 'react';
import type { Citation, Format, ReleaseProposal, Selection, SourceLink } from '../../../shared/discovery';
import { normalizeIdentity } from '../../../shared/discoveryPolicy';
import { Dialog } from '../../components/Dialog';
import type { Release, Result, Series } from '../library/model';
import { nextPosition } from '../library/progress';
import { DiscoverySummary } from './DiscoverySummary';
import type { DiscoverySession } from './discoverySession';

const emptySelection = (): Selection => ({ title: false, book: false, audio: false });
const formatLabels: Record<Format, string> = { book: 'Book', audio: 'Audiobook' };

function safeUrl(value: string): boolean {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}
function Sources({ sources, citations = [] }: { sources: SourceLink[]; citations?: Citation[] }) {
  return <ul className="discovery-sources">{sources.map(source => <li key={source.id}>
    {safeUrl(source.url) ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : <span>{source.title}</span>}
    {citations.filter(citation => citation.sourceId === source.id).map((citation, index) => <blockquote key={index}>{citation.quote}</blockquote>)}
  </li>)}</ul>;
}
function currentRelease(release: Release): string {
  if (release.date) return release.date;
  return { 'not-checked': 'Not checked', 'not-found': 'Date Unknown', announced: 'Announced · Date Unknown',
    scheduled: 'Date Unknown', released: 'Available' }[release.state];
}
function ProposalDetails({ proposal, preferredMarket }: { proposal: ReleaseProposal; preferredMarket: string }) {
  const provenance = proposal.provenance;
  const market = provenance.sourceMarket;
  return <>
    <p className="small">English {provenance.editionFormat === 'audio' ? 'audiobook' : provenance.editionFormat} · {market ? `Source country: ${market}` : 'source country unspecified'} · Preferred country: {preferredMarket}</p>
    {proposal.date && <p className="small">Earliest supported date in sources checked.</p>}
    {proposal.date && market !== preferredMarket && <p className="small">Date from {market ?? 'an unspecified country'}; no supported {preferredMarket} date found in sources checked.</p>}
    {provenance.editionKey && <p className="small">Edition: {provenance.editionKey}</p>}
    <p className="small">Checked <time dateTime={provenance.checkedAt}>{provenance.checkedAt}</time>.</p>
    {provenance.interpreted && <p className="small">Interpreted from source text. Review the linked evidence before saving.</p>}
    <Sources sources={provenance.sources} citations={proposal.citations} />
  </>;
}
function Comparison({ label, current, suggested, checked, disabled, onChange, children }: {
  label: string; current: string; suggested: string; checked: boolean; disabled: boolean;
  onChange: (checked: boolean) => void; children?: ReactNode;
}) {
  return <section className="row">
    <input type="checkbox" aria-label={`Save ${label}`} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <div><h3>{label}</h3><div className="compare"><div><span className="small">CURRENT</span><p>{current}</p></div>
      <div><span className="small">SUGGESTED</span><p>{suggested}</p></div></div>{children}</div>
  </section>;
}

export function DiscoveryDialog({ session, series, preferredMarket, stale, onRun, onClose, onAccept }: {
  session: DiscoverySession; series: Series; preferredMarket: string; stale: boolean;
  onRun: (useAi: boolean) => void; onClose: () => void; onAccept: (selection: Selection) => Result<void>;
}): React.JSX.Element {
  const [useAi, setUseAi] = useState(false);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [saveError, setSaveError] = useState<string | null>(null);
  const result = session.response;
  const identity = result?.proposals.identity;
  const changedTitle = !!identity && normalizeIdentity(identity.title) !== normalizeIdentity(series.next.title);
  const checking = session.phase === 'checking';
  const preparing = session.phase === 'preparing';
  const reviewing = session.phase === 'review' && result !== null;
  const readyToRun = !checking && !preparing;
  const aiEnabled = readyToRun && session.capabilities?.ai === true;
  useEffect(() => {
    setUseAi(false); setSelection(emptySelection()); setSaveError(null);
  }, [session.seriesId, session.phase, session.snapshot?.requestId, result?.requestId]);
  const canSelectFormat = (format: Format) => {
    const proposal = result?.proposals.releases[format];
    if (!proposal || !series.formats[format] || result?.proposals.conflicts.some(conflict => conflict.format === format)) return false;
    const matchesCurrent = normalizeIdentity(proposal.title) === normalizeIdentity(series.next.title);
    const matchesAccepted = !!identity && selection.title && normalizeIdentity(proposal.title) === normalizeIdentity(identity.title);
    return changedTitle ? matchesAccepted : matchesCurrent;
  };
  const titleAvailable = !!identity && !!result?.proposals.identityAttribution;
  const selected = (selection.title && titleAvailable) || (selection.book && canSelectFormat('book')) || (selection.audio && canSelectFormat('audio'));
  const run = () => {
    const choice = aiEnabled && useAi;
    setUseAi(false); setSelection(emptySelection()); setSaveError(null); onRun(choice);
  };
  const save = () => {
    if (!reviewing || stale || !selected) return;
    const accepted = onAccept({ title: selection.title && titleAvailable,
      book: selection.book && canSelectFormat('book'), audio: selection.audio && canSelectFormat('audio') });
    if (accepted.ok === false) setSaveError(accepted.error);
  };
  const title = preparing ? 'Preparing release check' : checking ? 'Checking release details' : reviewing ? 'Review release details'
    : session.phase === 'error' ? 'Could not complete this check' : 'Check next release';
  return <Dialog open title={title} onClose={onClose}>
    <div className="discovery-content">
      <p className="small">{series.name} · Book {nextPosition(series)} · Preferred country: {preferredMarket}</p>
      {preparing && <p role="status">Preparing available check options…</p>}
      {checking && <><div className="note" role="status">Checking catalogs and sources…</div><p>Book and audiobook are checked separately. You can cancel this check.</p></>}
      {session.phase === 'ready' && <><p>Find supported details for {series.name}, book {nextPosition(series)}. Your saved values stay in place until you choose changes.</p>
        <div className="note">{preferredMarket} is preferred. Each format can use another market when no supported {preferredMarket} date is found.</div></>}
      {session.error && <p className="form-error" role="alert">{session.error}</p>}
      {session.phase === 'error' && <p>Your saved release details are unchanged. Check again when sources are available.</p>}
      {reviewing && <>
        <p>Choose the changes you want to save.</p>
        <DiscoverySummary summary={result.summary} />
        {stale && <div className="note warn" role="status">The series changed. Check again before saving.</div>}
        {changedTitle && <div className="note warn">Accepting a changed title clears the old cover and both old release records, then saves the selected new release details.</div>}
        <Comparison label="Next title" current={series.next.title || 'Unknown'} suggested={identity?.title ?? 'Unknown · no supported change offered'}
          checked={selection.title} disabled={!titleAvailable} onChange={checked => setSelection(previous => ({ ...previous, title: checked,
            book: changedTitle && !checked ? false : previous.book, audio: changedTitle && !checked ? false : previous.audio }))}>
          {identity && <p className="small">Book {identity.position} · {identity.author}</p>}
          {result.proposals.identityAttribution && <Sources sources={result.proposals.identityAttribution.sources} citations={identity?.citations} />}
        </Comparison>
        {(['book', 'audio'] as const).filter(format => series.formats[format]).map(format => {
          const proposal = result.proposals.releases[format];
          const conflicts = result.proposals.conflicts.filter(conflict => conflict.format === format);
          return <Comparison key={format} label={formatLabels[format]} current={currentRelease(series.releases[format])}
            suggested={conflicts.length ? 'Conflicting details · no supported change offered' : proposal?.date ?? (proposal ? 'Announced · Date Unknown' : 'Date Unknown · no supported change offered')}
            checked={selection[format] && canSelectFormat(format)} disabled={!canSelectFormat(format)} onChange={checked => setSelection(previous => ({ ...previous, [format]: checked }))}>
            {conflicts.map((conflict, index) => <p className="note warn" key={index}>{conflict.reason}</p>)}
            {proposal && !conflicts.length && <ProposalDetails proposal={proposal} preferredMarket={preferredMarket} />}
            {proposal && conflicts.length > 0 && <Sources sources={proposal.provenance.sources} citations={proposal.citations} />}
            {proposal && changedTitle && !selection.title && <p className="small">Select the new title before selecting its release details.</p>}
          </Comparison>;
        })}
        {result.sources.length > 0 && <section><h3>Sources checked</h3><Sources sources={result.sources} /></section>}
      </>}
      <label className="checkbox-label"><input type="checkbox" checked={useAi && aiEnabled} disabled={!aiEnabled} onChange={event => setUseAi(event.target.checked)} />Use DeepSeek for this check</label>
      <p className="small">DeepSeek API usage is billed. At most one extraction request.</p>
      {session.capabilities && <>
        <p className="small">Estimated maximum AI usage: ${session.capabilities.estimatedMaxAiUsd.toFixed(4)} USD, rates as of {session.capabilities.pricingAsOf}. This estimate is not a guaranteed dollar cap.</p>
        <p className="small">At most {session.capabilities.limits.ai} extraction request and {session.capabilities.limits.search} searches. Source-only checking is available without optional AI or search keys.</p>
        {!session.capabilities.ai && <p className="small">DeepSeek is unavailable because no AI key is configured.</p>}
      </>}
      {saveError && <p className="form-error" role="alert">{saveError}</p>}
    </div>
    <div className="actions discovery-footer">
      <button type="button" onClick={onClose}>{checking ? 'Cancel check' : 'Close'}</button>
      {reviewing && <button type="button" onClick={run}>Check again</button>}
      {reviewing ? <button type="button" className="primary" disabled={stale || !selected} onClick={save}>Save selected changes</button>
        : <button type="button" className="primary" disabled={!readyToRun} onClick={run}>{checking ? 'Checking…' : preparing ? 'Preparing…' : session.phase === 'error' ? 'Check again' : 'Check release'}</button>}
    </div>
  </Dialog>;
}
