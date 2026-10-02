import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { emptyDocument } from '../../src/features/library/model';
import { useLibrary } from '../../src/features/library/useLibrary';
import { useDiscovery } from '../../src/features/discovery/useDiscovery';
import { seriesFixture } from '../fixtures';
import { response } from './fixtures';
import { checkDiscovery, getDiscoveryCapabilities } from '../../src/services/discovery';
vi.mock('../../src/services/discovery', () => ({ checkDiscovery: vi.fn(), getDiscoveryCapabilities: vi.fn() }));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });
function mount() {
  const doc = emptyDocument();
  doc.settings.market = 'CA';
  doc.series = [seriesFixture({id:'s1'}), seriesFixture({id:'s2'}), seriesFixture({id:'paused', readingStatus:'paused'})];
  localStorage.setItem('seriestrackr:v1', JSON.stringify(doc));
  vi.mocked(getDiscoveryCapabilities).mockResolvedValue({ai:true} as never);
  return renderHook(() => { const library = useLibrary(); return {library, discovery:useDiscovery(library)}; });
}
test('checks only supplied active series sequentially, disables AI and retains guarded reviews without accepting', async () => {
  const {result} = mount();
  let inFlight = 0;
  vi.mocked(checkDiscovery).mockImplementation(async request => {
    expect(inFlight++).toBe(0);
    await Promise.resolve(); inFlight--;
    const reply = response({requestId:request.requestId,seriesId:request.seriesId});
    reply.summary.requestId = request.requestId;
    return reply;
  });
  const before = result.current.library.doc.series.map(s=>s.releases);
  await act(async()=> {await result.current.discovery.runBatch(['s2','paused','s1','s2']);});
  expect(vi.mocked(checkDiscovery).mock.calls.map(([r])=>[r.seriesId,r.useAi])).toEqual([['s2',false],['s1',false]]);
  expect(result.current.library.doc.series.map(s=>s.releases)).toEqual(before);
  expect(result.current.discovery.batch.done).toBe(2);
  const cached = result.current.discovery.batch.results[0];
  expect(result.current.library.isDiscoveryCurrent(cached.snapshot!)).toBe(true);
  act(()=>result.current.discovery.open('s2'));
  expect(result.current.discovery.session?.response).toBe(cached.response);
  act(()=>result.current.discovery.close());
  act(()=>result.current.discovery.open('s2'));
  expect(result.current.discovery.session?.response).toBe(cached.response);
  expect(result.current.library.isDiscoveryCurrent(cached.snapshot!)).toBe(true);
  expect(checkDiscovery).toHaveBeenCalledTimes(2);
});
test('cancellation stops the remaining queue and preserves completed results', async()=> {
  const {result} = mount();
  let release: (()=>void) | undefined;
  vi.mocked(checkDiscovery).mockImplementation(async request=> {
    await new Promise<void>(resolve=>{release=resolve;});
    const reply=response({requestId:request.requestId,seriesId:request.seriesId}); reply.summary.requestId=request.requestId; return reply;
  });
  let pending: Promise<void>;
  await act(async()=>{pending=result.current.discovery.runBatch(['s1','s2']); await Promise.resolve();});
  act(()=>result.current.discovery.cancelBatch());
  await act(async()=>{release?.(); await pending;});
  expect(checkDiscovery).toHaveBeenCalledTimes(1);
  expect(result.current.discovery.batch.running).toBe(false);
  expect(result.current.discovery.session).toBeNull();
});
import { fireEvent, render, screen } from '@testing-library/react';
import { LibraryView } from '../../src/features/library/LibraryView';
test('global button queues only active series matching current search', () => {
  const doc = emptyDocument(); doc.settings.market = 'CA';
  doc.series = [seriesFixture({id:'shown', name:'Visible'}),seriesFixture({id:'hidden',name:'Hidden'}),seriesFixture({id:'paused',name:'Visible paused',readingStatus:'paused'})];
  const onCheckAll = vi.fn();
  render(<LibraryView doc={doc} today="2026-10-01" onEdit={()=>{}} onFinish={()=>{}} onAdd={()=>{}} onView={()=>{}} onCheckAll={onCheckAll}/>);
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Visible'}});
  fireEvent.click(screen.getByRole('button',{name:'Check visible releases'}));
  expect(onCheckAll).toHaveBeenCalledWith(['shown']);
});
