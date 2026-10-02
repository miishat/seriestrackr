import type { CoverCandidate } from '../../shared/covers';

export const providerNames: Record<CoverCandidate['provider'], string> = {
  apple: 'Apple Books', hardcover: 'Hardcover', googlebooks: 'Google Books', openlibrary: 'Open Library',
};
export const formatName = (item: CoverCandidate): string => item.format === 'audio' ? 'Audiobook' : 'Book';
export const roleName = (item: CoverCandidate): string => item.role === 'next' ? 'Next book' : 'Previous book';

function Details({ item }: { item: CoverCandidate }) {
  return <span className="cover-text">
    <strong>{item.title}</strong>
    <span>by {item.author}</span>
    <span>{providerNames[item.provider]}, {formatName(item)}, {roleName(item)}</span>
  </span>;
}

// A named cover. Selectable portrait book covers are toggle buttons; audio squares and covers that do not yet
// match an accepted title are shown with their reason and cannot be chosen.
export function CoverChoice({ item, chosen, reason, onChoose }: {
  item: CoverCandidate; chosen: boolean; reason: string | null; onChoose: () => void;
}) {
  if (item.format === 'audio') {
    return <article className="cover-choice review-only"><img src={item.imageUrl} alt="" />
      <Details item={item} /><span className="cover-note">Audiobook art, review only. It cannot be saved as a book cover.</span></article>;
  }
  return <div className={`cover-choice${chosen ? ' chosen' : ''}`}>
    <button type="button" aria-pressed={chosen} aria-label={`Select cover: ${item.title} by ${item.author}, ${providerNames[item.provider]}, ${formatName(item)}, ${roleName(item)}`} disabled={reason !== null} onClick={onChoose}>
      <img src={item.imageUrl} alt="" /><Details item={item} />
    </button>
    {reason && <span className="cover-note">{reason}</span>}
  </div>;
}
