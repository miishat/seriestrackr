import { useState } from 'react';

const taglines = [
  'You don’t have a reading problem. You have a tracking problem.',
  'Too many worlds. One place to track them.',
  'Your quest log for every series.',
  'A home for your unfinished adventures.',
];

export function BrandTagline() {
  const [tagline] = useState(() => taglines[Math.floor(Math.random() * taglines.length)]);

  return <div className="small">{tagline}</div>;
}
