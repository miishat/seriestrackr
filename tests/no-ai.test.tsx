import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

test('boots with no AI credentials or discovery requests', async () => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const request = vi.fn(() => Promise.reject(new Error('offline')));
  vi.stubGlobal('fetch', request);
  const { default: App } = await import('../App');
  render(<App />);
  expect(await screen.findByRole('heading', { name: /bookshelf is empty/i })).toBeVisible();
  expect(request).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test('manual next-book details start unknown and remain editable', async () => {
  localStorage.clear();
  localStorage.setItem('bookSeries', JSON.stringify([{
    id: 'one',
    seriesName: 'The Example Cycle',
    author: 'A. Writer',
    lastBookReadTitle: 'First Book',
    lastBookReadNumber: 1,
  }]));
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const request = vi.fn(() => Promise.reject(new Error('offline')));
  vi.stubGlobal('fetch', request);
  const { default: App } = await import('../App');
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit series' }));
  expect(screen.getByRole('textbox', { name: 'Release Date (e.g., YYYY-MM-DD or TBA)' })).toHaveValue('TBA');
  expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('Unknown');
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(screen.getByText('Unknown')).toBeVisible();
  expect(request).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
