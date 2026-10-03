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
  expect(result.current.discovery.batch.results.map(item => item.seriesId)).toEqual(['s1']);
  act(()=>result.current.discovery.open('s1'));
  act(()=>result.current.discovery.close());
  expect(result.current.discovery.batch.results).toEqual([]);
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

test('dismisses one result without accepting changes and keeps the remaining reviews', async () => {
  const { result } = mount();
  vi.mocked(checkDiscovery).mockImplementation(async request => {
    const reply = response({ requestId: request.requestId, seriesId: request.seriesId });
    reply.summary.requestId = request.requestId;
    return reply;
  });
  await act(async () => { await result.current.discovery.runBatch(['s1', 's2']); });
  const releases = result.current.library.doc.series.map(s => s.releases);
  act(() => result.current.discovery.dismissResult('s1'));
  expect(result.current.discovery.batch.results.map(item => item.seriesId)).toEqual(['s2']);
  expect(result.current.library.doc.series.map(s => s.releases)).toEqual(releases);
  act(() => result.current.discovery.dismissResult('s2'));
  expect(result.current.discovery.batch.results).toEqual([]);
});
test('summary shortcuts apply availability filters and tracked-series resets them', () => {
  const doc = emptyDocument(); doc.settings.market = 'CA';
  const available = seriesFixture({id:'available',name:'Available series'});
  available.releases.book.state='released';
  doc.series=[available,seriesFixture({id:'unknown',name:'Unknown series'})];
  const props={doc,today:'2026-10-01',onEdit:()=>{},onFinish:()=>{},onAdd:()=>{},onView:()=>{}};
  const view=render(<LibraryView {...props} summaryFilter={{kind:'book',sequence:1}} />);
  expect(screen.getByRole('heading',{name:'Available series'})).toBeInTheDocument();
  expect(screen.queryByRole('heading',{name:'Unknown series'})).toBeNull();
  view.rerender(<LibraryView {...props} summaryFilter={{kind:'all',sequence:2}} />);
  expect(screen.getByRole('heading',{name:'Unknown series'})).toBeInTheDocument();
});

test('an automatic run saves safe results without AI or cover changes and drops them from review', async () => {
  const { result } = mount();
  vi.mocked(checkDiscovery).mockImplementation(async request => {
    const reply = response({ requestId: request.requestId, seriesId: request.seriesId });
    reply.summary.requestId = request.requestId;
    return reply;
  });
  const covers = result.current.library.doc.series.map(s => [s.coverUrl, s.coverAttribution]);
  await act(async () => { await result.current.discovery.runBatch(['s1', 's2'], true); });
  expect(vi.mocked(checkDiscovery).mock.calls.every(([r]) => r.useAi === false)).toBe(true);
  expect(result.current.discovery.batch.results).toEqual([]);
  expect(result.current.discovery.batch.done).toBe(2);
  expect(result.current.library.doc.series.filter(s => s.autoUpdate).map(s => s.id)).toEqual(['s1', 's2']);
  expect(result.current.library.doc.series.map(s => [s.coverUrl, s.coverAttribution])).toEqual(covers);
});
