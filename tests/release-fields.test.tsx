import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ReleaseFields } from '../src/features/library/ReleaseFields';
import { emptyRelease } from '../src/features/library/model';

afterEach(cleanup);

test('manual status offers the exact labels and shows a catalogued state', () => {
  const onChange = vi.fn();
  render(<ReleaseFields format="book" value={{ ...emptyRelease(), state: 'catalogued' }} onChange={onChange} />);
  const select = screen.getByLabelText('Book status') as HTMLSelectElement;
  expect(select.value).toBe('catalogued');
  expect(Array.from(select.options).map(option => option.text)).toEqual([
    'Not checked', 'No announcement found', 'Edition found; release unverified', 'Announced; date unknown', 'Scheduled', 'Available']);
  fireEvent.change(select, { target: { value: 'announced' } });
  expect(onChange.mock.calls[0][0]).toMatchObject({ state: 'announced', date: null, origin: 'manual' });
});
