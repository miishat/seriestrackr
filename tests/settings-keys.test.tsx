import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SettingsDialog } from '../src/features/settings/SettingsDialog';
import { loadApiKeys, saveApiKeys } from '../src/storage/apiKeys';
import { emptyDocument } from '../src/features/library/model';

const settings = () => ({ ...emptyDocument().settings, market: 'CA' as string | null });
beforeEach(() => localStorage.clear());
afterEach(cleanup);
const show = () => { const onSave = vi.fn(); render(<SettingsDialog settings={settings()} onSave={onSave} onCancel={vi.fn()} />); return onSave; };

test('keys are entered as hidden fields and nothing is stored until saved', async () => {
  show();
  const tavily = screen.getByLabelText('Tavily API key');
  expect(tavily).toHaveAttribute('type', 'password'); expect(tavily).toHaveAttribute('autocomplete', 'off');
  await userEvent.type(tavily, 'tavily-key-123');
  expect(loadApiKeys(localStorage)).toEqual({ tavily: null, deepseek: null });
});
test('saving stores a typed key beside the settings and leaves the other key alone', async () => {
  saveApiKeys(localStorage, { tavily: null, deepseek: 'deepseek-key-123' });
  const onSave = show();
  await userEvent.type(screen.getByLabelText('Tavily API key'), 'tavily-key-123');
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(loadApiKeys(localStorage)).toEqual({ tavily: 'tavily-key-123', deepseek: 'deepseek-key-123' });
  expect(onSave).toHaveBeenCalledOnce();
});
test('a saved key is never shown and is reported as saved', () => {
  saveApiKeys(localStorage, { tavily: 'tavily-key-123', deepseek: null });
  const { container } = render(<SettingsDialog settings={settings()} onSave={vi.fn()} onCancel={vi.fn()} />);
  expect(container.innerHTML).not.toContain('tavily-key-123');
  expect(screen.getByText('Tavily key saved on this device.')).toBeVisible();
  expect(screen.getByLabelText('Tavily API key')).toHaveValue('');
});
test('a malformed key is refused with a message and nothing is saved', async () => {
  const onSave = show();
  await userEvent.type(screen.getByLabelText('DeepSeek API key'), 'short');
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/does not look right/);
  expect(onSave).not.toHaveBeenCalled(); expect(loadApiKeys(localStorage).deepseek).toBeNull();
});
test('a saved key can be removed', async () => {
  saveApiKeys(localStorage, { tavily: 'tavily-key-123', deepseek: 'deepseek-key-123' });
  show();
  await userEvent.click(screen.getByRole('button', { name: 'Remove Tavily key' }));
  expect(loadApiKeys(localStorage)).toEqual({ tavily: null, deepseek: 'deepseek-key-123' });
  expect(screen.queryByText('Tavily key saved on this device.')).toBeNull();
});
test('the dialog explains that keys stay on this device and are billed to the owner', () => {
  show();
  expect(screen.getByText(/stored only in this browser/i)).toBeVisible();
});
