type OpenLibraryReply = { docs?: { cover_i?: number }[] };
type GoogleBooksReply = { items?: { volumeInfo?: { imageLinks?: { thumbnail?: string } } }[] };

async function openLibrary(title: string, author: string): Promise<string[]> {
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Open Library returned ${response.status}`);
  const data = await response.json() as OpenLibraryReply;
  return (data.docs ?? []).flatMap((doc) => typeof doc.cover_i === 'number' ? [`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`] : []).slice(0, 9);
}

async function googleBooks(title: string, author: string): Promise<string[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}&maxResults=9`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Books returned ${response.status}`);
  const data = await response.json() as GoogleBooksReply;
  return (data.items ?? []).flatMap((item) => item.volumeInfo?.imageLinks?.thumbnail ? [item.volumeInfo.imageLinks.thumbnail.replace('&zoom=1', '&zoom=0')] : []).slice(0, 9);
}

export async function fetchCoverImageUrls(seriesName: string, author: string, lastReadBookTitle: string, nextBookTitle?: string): Promise<string[]> {
  const titles = [nextBookTitle?.trim(), lastReadBookTitle.trim(), seriesName.trim()].filter((title): title is string => !!title && !/^(tba|to be announced)$/i.test(title));
  const searches = [...new Set(titles)].flatMap((title) => [openLibrary(title, author), googleBooks(title, author)]);
  const results = await Promise.allSettled(searches);
  const successes = results.filter((result): result is PromiseFulfilledResult<string[]> => result.status === 'fulfilled');
  if (!successes.length) throw new Error('Cover search failed for all providers.');
  return [...new Set(successes.flatMap((result) => result.value))].slice(0, 9);
}
