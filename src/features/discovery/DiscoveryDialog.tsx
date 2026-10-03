import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Citation, Format, RelatedWorkEvidence, ReleaseProposal, Selection, SourceLink } from '../../../shared/discovery';
import { normalizeIdentity } from '../../../shared/discoveryPolicy';
import { Dialog } from '../../components/Dialog';
import type { Release, Result, Series } from '../library/model';
import { nextPosition } from '../library/progress';
import { releaseLabels } from '../library/releases';
import { DiscoverySummary } from './DiscoverySummary';
import { ReviewCovers } from './ReviewCovers';
import { selectableCover } from '../../services/coverImages';
import type { CoverCandidate } from '../../../shared/covers';
import type { DiscoverySession } from './discoverySession';

const emptySelection = (): Selection => ({ title: false, book: false, audio: false, coverId: null });
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
  return { 'not-checked': 'Not checked', 'not-found': 'Date Unknown', catalogued: 'Listed', announced: 'Announced',
    scheduled: 'Date Unknown', released: 'Available' }[release.state];
}
function ProposalDetails({ proposal, preferredMarket }: { proposal: ReleaseProposal; preferredMarket: string }) {
  const provenance = proposal.provenance;
  const market = provenance.sourceMarket;
  return <>
    <p className="small">Status: {releaseLabels[proposal.state]}</p>
    <p className="small">English {provenance.editionFormat === 'audio' ? 'audiobook' : provenance.editionFormat} · {market ? `Source country: ${market}` : 'source country unspecified'} · Preferred country: {preferredMarket}</p>
    {proposal.date && <p className="small">Earliest supported date in sources checked.</p>}
    {proposal.date && market !== preferredMarket && <p className="small">Date from {market ?? 'an unspecified country'}; no supported {preferredMarket} date found in sources checked.</p>}
    {provenance.editionKey && <p className="small">Edition: {provenance.editionKey}</p>}
    <p className="small">Checked <time dateTime={provenance.checkedAt}>{provenance.checkedAt}</time>.</p>
    {provenance.interpreted && <p className="small">Interpreted from source text. Review the linked evidence before saving.</p>}
    <Sources sources={provenance.sources} citations={proposal.citations} />
  </>;
}
type PaneId = 'title' | 'book' | 'audio' | 'covers' | 'related' | 'coverage';
const lifecycleMeaning = {
  catalogued: 'A catalogue lists this edition, but no release is confirmed.',
  announced: 'A source announces the book without a release date.',
  scheduled: 'A source gives a future release date.',
  released: 'The release date has passed or a source confirms publication.',
} as const;
const relationLabels: Record<RelatedWorkEvidence['relationship'], string> = { prequel: 'Prequel', continuation: 'Unnumbered continuation' };

function Pane({ id, active, title, note, children }: { id: PaneId; active: boolean; title: string; note?: string; children: ReactNode }) {
  return <section role="tabpanel" id={`review-pane-${id}`} aria-labelledby={`review-tab-${id}`} className="review-pane" tabIndex={0} hidden={!active}>
    <h3>{title}</h3>{note && <p className="small">{note}</p>}{children}
  </section>;
}
function Comparison({ label, current, suggested, checked, disabled, onChange, why, children }: {
  label: string; current: string; suggested: string; checked: boolean; disabled: boolean;
  onChange: (checked: boolean) => void; why?: string | null; children?: ReactNode;
}) {
  return <>
    <label className="accept"><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />Save {label}</label>
    {why && <p className="small accept-why">{why}</p>}
    <div className="compare"><div><span className="small">CURRENT</span><p>{current}</p></div>
      <div><span className="small">SUGGESTED</span><p>{suggested}</p></div></div>{children}
  </>;
}

export function DiscoveryDialog({ session, series, preferredMarket, stale, onRun, onClose, onAccept }: {
  session: DiscoverySession; series: Series; preferredMarket: string; stale: boolean;
  onRun: (useAi: boolean) => void; onClose: () => void; onAccept: (selection: Selection) => Result<void>;
}): React.JSX.Element {
  const [useAi, setUseAi] = useState(false);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pane, setPane] = useState<PaneId>('title');
  const [decoded, setDecoded] = useState<CoverCandidate[]>([]);
  const rail = useRef<HTMLDivElement>(null);
  const result = session.response;
  const identity = result?.proposals.identity;
  const changedTitle = !!identity && normalizeIdentity(identity.title) !== normalizeIdentity(series.next.title);
  const checking = session.phase === 'checking';
  const preparing = session.phase === 'preparing';
  const reviewing = session.phase === 'review' && result !== null;
  const readyToRun = !checking && !preparing;
  const aiEnabled = readyToRun && session.capabilities?.ai === true;
  useEffect(() => {
    setUseAi(false); setSelection(emptySelection()); setSaveError(null); setPane('title'); setDecoded([]);
  }, [session.seriesId, session.phase, session.snapshot?.requestId, result?.requestId]);
  const undatedWithoutMarket = (proposal: ReleaseProposal) => proposal.state === 'released' && proposal.date === null && proposal.provenance.sourceMarket === null;
  const formatBlock = (format: Format): string | null => {
    const proposal = result?.proposals.releases[format];
    if (!proposal || !series.formats[format]) return null;
    if (result?.proposals.conflicts.some(conflict => conflict.format === format)) return 'These details conflict, so no change is offered.';
    if (undatedWithoutMarket(proposal)) return 'Available without a date needs a source country, so it cannot be saved. Try checking again.';
    return null;
  };
  const canSelectFormat = (format: Format) => {
    const proposal = result?.proposals.releases[format];
    if (!proposal || !series.formats[format] || formatBlock(format)) return false;
    const matchesCurrent = normalizeIdentity(proposal.title) === normalizeIdentity(series.next.title);
    const matchesAccepted = !!identity && selection.title && normalizeIdentity(proposal.title) === normalizeIdentity(identity.title);
    return changedTitle ? matchesAccepted : matchesCurrent;
  };
  const titleAvailable = !!identity && !!result?.proposals.identityAttribution;
  const targetTitle = selection.title && titleAvailable && identity ? identity.title : series.next.title;
  const coverReason = (item: CoverCandidate): string | null => {
    const matches = item.role === 'next' ? !!targetTitle.trim() && normalizeIdentity(item.title) === normalizeIdentity(targetTitle)
      : !!series.lastFinished && normalizeIdentity(item.title) === normalizeIdentity(series.lastFinished.title);
    if (matches) return null;
    return item.role === 'next' ? 'Select the matching new title first to choose this cover.' : 'This cover does not match your last finished book.';
  };
  const coverCandidates = result?.coverCandidates ?? [];
  const chosenCover = selection.coverId ? decoded.find(item => item.id === selection.coverId) : undefined;
  const coverOk = !!chosenCover && selectableCover(chosenCover) && coverReason(chosenCover) === null;
  const count = (selection.title && titleAvailable ? 1 : 0) + (selection.book && canSelectFormat('book') ? 1 : 0) +
    (selection.audio && canSelectFormat('audio') ? 1 : 0) + (coverOk ? 1 : 0);
  const selected = count > 0;
  const related = result?.proposals.related ?? [];
  const run = () => {
    const choice = aiEnabled && useAi;
    setUseAi(false); setSelection(emptySelection()); setSaveError(null); onRun(choice);
  };
  const save = () => {
    if (!reviewing || stale || !selected) return;
    const accepted = onAccept({ title: selection.title && titleAvailable,
      book: selection.book && canSelectFormat('book'), audio: selection.audio && canSelectFormat('audio'),
      ...(coverOk ? { coverId: selection.coverId } : {}) });
    if (accepted.ok === false) setSaveError(accepted.error);
  };
  const title = preparing ? 'Preparing release check' : checking ? 'Checking release details' : reviewing ? 'Review release details'
    : session.phase === 'error' ? 'Could not complete this check' : 'Check next release';
  const tabs: { id: PaneId; label: string; chip: string; level: 2 | 3 }[] = [
    { id: 'title', label: 'Next title', chip: selection.title && titleAvailable ? 'Selected' : titleAvailable ? 'Change offered' : 'No change', level: 2 },
    ...(['book', 'audio'] as const).filter(format => series.formats[format]).map(format => ({ id: format, label: formatLabels[format], level: 3 as const,
      chip: selection[format] && canSelectFormat(format) ? 'Selected' : result?.proposals.releases[format] ? 'Review' : 'None' })),
    { id: 'covers', label: 'Covers', chip: coverOk ? 'Selected' : coverCandidates.length ? String(coverCandidates.length) : 'None', level: 3 },
    ...(related.length ? [{ id: 'related' as const, label: 'Related works', chip: String(related.length), level: 2 as const }] : []),
    { id: 'coverage', label: 'Coverage', chip: ({ complete: 'Complete', partial: 'Partial', failed: 'Failed', cancelled: 'Cancelled' } as const)[result?.summary.status ?? 'complete'], level: 2 },
  ];
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const move = ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 } as Record<string, number>)[event.key];
    let next = move === undefined ? null : (index + move + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    setPane(tabs[next].id);
    rail.current?.querySelector<HTMLElement>(`#review-tab-${tabs[next].id}`)?.focus();
  };
  const sourcesFor = (citations: Citation[]) => (result?.sources ?? []).filter(source => citations.some(citation => citation.sourceId === source.id));
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
        <p>Choose the changes you want to save. Nothing is saved until you press Save selected changes.</p>
        <DiscoverySummary summary={result.summary} />
        {stale && <div className="note warn" role="status">The series changed. Check again before saving.</div>}
        {changedTitle && <div className="note warn">Accepting a changed title clears both old release records, then saves the selected new release details. Your selected cover is kept.</div>}
        <div className="review-layout">
          <div className="review-rail-group">
            <span className="eyebrow">{series.name}</span>
            <div className="review-rail" role="tablist" aria-label="Review outline" aria-orientation="vertical" ref={rail}>
            {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`review-tab-${tab.id}`} className={`review-tab level-${tab.level}`}
              aria-selected={pane === tab.id} aria-controls={`review-pane-${tab.id}`} tabIndex={pane === tab.id ? 0 : -1}
              onClick={() => setPane(tab.id)} onKeyDown={event => onTabKey(event, index)}>
              <span>{tab.label}</span><span className="chip">{tab.chip}</span></button>)}
            </div>
          </div>
          <div className="review-panes">
            <Pane id="title" active={pane === 'title'} title="Next title" note="Work level · Identity evidence">
              <Comparison label="Next title" current={series.next.title || 'Unknown'} suggested={identity?.title ?? 'Unknown · no supported change offered'}
                checked={selection.title} disabled={!titleAvailable} onChange={checked => setSelection(previous => ({ ...previous, title: checked,
                  book: changedTitle && !checked ? false : previous.book, audio: changedTitle && !checked ? false : previous.audio }))}>
                {identity && <p className="small">Book {identity.position} · {identity.author}</p>}
                {result.proposals.identityAttribution && <Sources sources={result.proposals.identityAttribution.sources} citations={identity?.citations} />}
              </Comparison>
            </Pane>
            {(['book', 'audio'] as const).filter(format => series.formats[format]).map(format => {
              const proposal = result.proposals.releases[format];
              const conflicts = result.proposals.conflicts.filter(conflict => conflict.format === format);
              const block = formatBlock(format);
              return <Pane key={format} id={format} active={pane === format} title={`${formatLabels[format]} format`} note={proposal ? `${proposal.title} · Edition evidence` : 'No supported change'}>
                <Comparison label={formatLabels[format]} current={currentRelease(series.releases[format])}
                  suggested={conflicts.length ? 'Conflicting details · no supported change offered' : proposal?.date ?? (proposal ? releaseLabels[proposal.state] : 'Date Unknown · no supported change offered')}
                  checked={selection[format] && canSelectFormat(format)} disabled={!canSelectFormat(format)} why={block && !conflicts.length ? block : null}
                  onChange={checked => setSelection(previous => ({ ...previous, [format]: checked }))}>
                  {conflicts.map((conflict, index) => <p className="note warn" key={index}>{conflict.reason}</p>)}
                  {proposal && !conflicts.length && <ProposalDetails proposal={proposal} preferredMarket={preferredMarket} />}
                  {proposal && conflicts.length > 0 && <Sources sources={proposal.provenance.sources} citations={proposal.citations} />}
                  {proposal && changedTitle && !selection.title && <p className="small">Select the new title before selecting its release details.</p>}
                </Comparison>
              </Pane>;
            })}
            <Pane id="covers" active={pane === 'covers'} title="Choose a cover" note="Optional · No cover is selected by default · Covers belong to a named work and edition">
              <ReviewCovers requestId={result.requestId} candidates={coverCandidates} chosenId={coverOk ? selection.coverId ?? null : null}
                incomplete={result.summary.status !== 'complete'} onDecoded={setDecoded} reasonFor={coverReason}
                onChoose={id => setSelection(previous => ({ ...previous, coverId: id }))} />
            </Pane>
            {related.length > 0 && <Pane id="related" active={pane === 'related'} title="Related works" note="For reference, outside numbered acceptance · There is no checkbox and none are saved to your library">
              <ul className="related-list">{related.map((item, index) => <li key={index} className="note">
                <span className="chip">{relationLabels[item.relationship]}</span>
                <h4>{item.title}</h4><p>{item.author}</p>
                <p className="small">Related work, outside the numbered sequence. It is shown for reference and is never added to your library.</p>
                <Sources sources={sourcesFor(item.citations)} citations={item.citations} />
              </li>)}</ul>
            </Pane>}
            <Pane id="coverage" active={pane === 'coverage'} title="Coverage and release language" note="What the receipt means">
              {result.summary.status === 'complete' && <p><strong>Complete coverage.</strong> Every source this run needed was checked. Unknown details are listed in the receipt as incomplete details, not as a partial run.</p>}
              {result.summary.status === 'partial' && <p><strong>Partial coverage.</strong> A source quota, timeout, error or limit affected this run. Valid dates and announcements can still be reviewed and saved.</p>}
              {result.summary.status === 'failed' && <p><strong>The check failed.</strong> The sources this run needed could not be checked, so nothing here is confirmed. Try the check again.</p>}
              {result.summary.status === 'cancelled' && <p><strong>The check was cancelled.</strong> Sources that had not been checked yet are missing. Anything shown comes only from the sources that responded.</p>}
              <p className="small">Coverage describes which sources were checked, not whether a book or audiobook is available.</p>
              <ul className="lifecycle">{(['catalogued', 'announced', 'scheduled', 'released'] as const).map(state => <li key={state}><strong>{releaseLabels[state]}.</strong> {lifecycleMeaning[state]}</li>)}</ul>
              {result.sources.length > 0 && <><h4>Sources checked</h4><Sources sources={result.sources} /></>}
            </Pane>
          </div>
        </div>
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
      {reviewing && <p className="small selection-count" role="status">{count === 0 ? 'No changes selected.' : `${count} ${count === 1 ? 'change' : 'changes'} selected.`}</p>}
      <button type="button" onClick={onClose}>{checking ? 'Cancel check' : 'Close'}</button>
      {reviewing && <button type="button" onClick={run}>Check again</button>}
      {reviewing ? <button type="button" className="primary" disabled={stale || !selected} onClick={save}>Save selected changes</button>
        : <button type="button" className="primary" disabled={!readyToRun} onClick={run}>{checking ? 'Checking…' : preparing ? 'Preparing…' : session.phase === 'error' ? 'Check again' : 'Check release'}</button>}
    </div>
  </Dialog>;
}
