import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/app/App';
import { emptyDocument } from '../src/features/library/model';
import { seriesFixture } from './fixtures';

vi.mock('../src/features/library/useLibrary', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/features/library/useLibrary')>();
  return { ...actual, useLibrary: () => ({ ...actual.useLibrary(), undo: () => ({ ok: false as const, error: 'Series not found.' }) }) };
});

beforeEach(() => {
  localStorage.setItem('seriestrackr:v1', JSON.stringify({ ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' }, series: [seriesFixture()] }));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); localStorage.clear(); });

test('a failed undo is announced instead of being ignored', async () => {
  const user = userEvent.setup(); render(<App autoTrack={false} />);
  await user.click(screen.getByRole('button', { name: 'Mark finished' }));
  await user.click(screen.getByRole('button', { name: 'Undo finish' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Could not undo. Series not found.');
});
