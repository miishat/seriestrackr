import { cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/app/App';
import { emptyDocument } from '../src/features/library/model';
import { seriesFixture } from './fixtures';

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

test('boots to market setup without AI credentials or discovery requests', () => {
  const request = vi.fn(() => Promise.reject(new Error('offline')));
  vi.stubGlobal('fetch', request);
  render(<App />);
  expect(screen.getByRole('dialog', { name: /which releases/i })).toBeVisible();
  expect(request).not.toHaveBeenCalled();
});

test('an empty saved library stays empty through Strict Mode and does not touch legacy keys', () => {
  const doc = { ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' } };
  localStorage.setItem('seriestrackr:v1', JSON.stringify(doc));
  localStorage.setItem('bookSeries', JSON.stringify([{ seriesName: 'Old sample' }]));
  const request = vi.fn(() => Promise.reject(new Error('offline')));
  vi.stubGlobal('fetch', request);
  render(<StrictMode><App /></StrictMode>);
  expect(screen.getByRole('heading', { name: /bookshelf is empty/i })).toBeVisible();
  expect(JSON.parse(localStorage.getItem('seriestrackr:v1')!)).toEqual(doc);
  expect(JSON.parse(localStorage.getItem('bookSeries')!)).toEqual([{ seriesName: 'Old sample' }]);
  expect(request).not.toHaveBeenCalled();
});

test('manual card and editor remain available while cover providers are offline', () => {
  const doc = { ...emptyDocument(), settings: { ...emptyDocument().settings, market: 'CA' }, series: [seriesFixture()] };
  localStorage.setItem('seriestrackr:v1', JSON.stringify(doc));
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  render(<App />);
  expect(screen.getByText('Example')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Edit details' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Mark finished' })).toBeEnabled();
});
