import type { CheckSummary, Reason } from '../../../shared/discovery';

const reasonLabels: Record<Reason, string> = {
  'missing-key': 'An optional service is not configured.', quota: 'A source quota was reached.',
  timeout: 'A source timed out.', 'provider-error': 'A source could not be checked.',
  'invalid-evidence': 'Some source details could not be verified.', budget: 'Some source results or requests exceeded this check\'s limits.',
  'unknown-identity': 'The next title could not be established.', cancelled: 'The check was cancelled.',
};
const statusLabels: Record<CheckSummary['status'], string> = {
  complete: 'Check complete', partial: 'Check partially completed', failed: 'Check failed', cancelled: 'Check cancelled',
};

export function DiscoverySummary({ summary }: { summary: CheckSummary | null }): React.JSX.Element | null {
  if (!summary) return null;
  const unknown = Object.values(summary.formats).includes('unknown');
  return <div className={`discovery-summary note${summary.status === 'complete' ? '' : ' warn'}`} role="status">
    <strong>{statusLabels[summary.status]}</strong>
    <p className="small">Checked <time dateTime={summary.checkedAt}>{summary.checkedAt}</time>.</p>
    {summary.status === 'partial' && <p>Some sources could not be checked. Review supported details below; missing fields remain unknown.</p>}
    {(summary.status === 'failed' || summary.status === 'cancelled') && <p>Your saved release details are unchanged.</p>}
    {summary.status === 'complete' && unknown && <p>Some formats have no supported details in sources checked.</p>}
    {summary.reasons.length > 0 && <ul>{[...new Set(summary.reasons)].map(reason => <li key={reason}>{reasonLabels[reason]}</li>)}</ul>}
  </div>;
}
