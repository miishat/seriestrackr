import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('boots with no AI credentials or discovery requests', async () => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const request = vi.fn(() => Promise.reject(new Error('offline')));
  vi.stubGlobal('fetch', request);
  const { default: App } = await import('../App');
  render(<App />);
  expect(await screen.findByRole('heading', { name: /bookshelf is empty/i })).toBeVisible();
  expect(request).not.toHaveBeenCalled();
});

test('preserves a stored library when Strict Mode replays effects', async () => {
  localStorage.clear();
  const storedSeries = [{
    id: 'saved-series',
    seriesName: 'The Saved Cycle',
    author: 'A. Writer',
    lastBookReadTitle: 'First Book',
    lastBookReadNumber: 1,
  }];
  localStorage.setItem('bookSeries', JSON.stringify(storedSeries));
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  const { default: App } = await import('../App');

  render(<StrictMode><App /></StrictMode>);

  expect(screen.getByRole('heading', { name: 'The Saved Cycle' })).toBeVisible();
  expect(JSON.parse(localStorage.getItem('bookSeries') ?? 'null')).toEqual(storedSeries);
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
});
