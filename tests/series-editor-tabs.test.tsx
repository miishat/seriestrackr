import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SeriesForm } from '../src/features/library/SeriesForm';
afterEach(cleanup);
test('editor keeps draft edits across tabs and saves both panels', () => {
  const create = vi.fn();
  render(<SeriesForm market="US" onCreate={create} onUpdate={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Example' } });
  fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'Writer' } });
  expect(within(document.querySelectorAll('[role=tabpanel]')[1] as HTMLElement).getByLabelText('Title')).not.toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: 'Next Book & Releases' }));
  fireEvent.change(within(document.querySelectorAll('[role=tabpanel]')[1] as HTMLElement).getByLabelText('Title'), { target: { value: 'Second' } });
  fireEvent.click(screen.getByRole('tab', { name: 'Cover & Notes' }));
  fireEvent.change(screen.getByLabelText('Personal Notes'), { target: { value: 'Read the novella first.' } });
  expect(screen.getByLabelText('Name')).not.toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: 'Series & Progress' }));
  expect(screen.getByLabelText('Name')).toHaveValue('Example');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(create.mock.calls[0][0]).toMatchObject({ name: 'Example', author: 'Writer', notes: 'Read the novella first.', next: { title: 'Second' } });
});
test('tabs support arrow-key navigation without submitting', () => {
  const create = vi.fn();
  render(<SeriesForm market="US" onCreate={create} onUpdate={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Series & Progress' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Next Book & Releases' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Next Book & Releases' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Cover & Notes' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: 'Find Cover' })).toBeVisible();
  expect(create).not.toHaveBeenCalled();
});

 test('personal notes survive library serialization and validation', async () => {
  const { parseDocument } = await import('../src/features/library/validation');
  const { emptyDocument } = await import('../src/features/library/model');
  const { seriesFixture } = await import('./fixtures');
  const doc = { ...emptyDocument(), series: [seriesFixture({ notes: 'Keep this reminder.\nRead the novella first.' })] };
  const parsed = parseDocument(JSON.parse(JSON.stringify(doc)));
  expect(parsed).toMatchObject({ ok: true, value: { series: [{ notes: 'Keep this reminder.\nRead the novella first.' }] } });
 });
