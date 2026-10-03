// Recordings made before the combined Apple search hold one row per single-format search. A combined
// search (`entity=ebook,audiobook`) is answered by consuming those rows and merging their records,
// which is exactly what Apple returns for the combined query: each record is typed by its own markers.
export interface RecordedRow { url: string; query: unknown; status: number; contentType: string; body: string }

export function takeCombinedApple(remaining: RecordedRow[], url: URL): Response | null {
  const entity = url.searchParams.get('entity');
  if (url.hostname !== 'itunes.apple.com' || url.pathname !== '/search' || !entity?.includes(',')) return null;
  const results: unknown[] = []; let found = 0;
  for (const part of entity.split(',')) {
    const single = new URL(url); single.searchParams.set('entity', part); single.searchParams.set('limit', '20');
    const index = remaining.findIndex(row => row.url === single.href && (row.query ?? null) === null);
    if (index < 0) continue;
    const [row] = remaining.splice(index, 1);
    results.push(...(JSON.parse(row.body).results ?? [])); found++;
  }
  return found ? new Response(JSON.stringify({ resultCount: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } }) : null;
}
