const tryFetchOpenLibrary = async (url: string): Promise<string[]> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Open Library API responded with status: ${response.status} for URL: ${url}`);
      return [];
    }
    const data = await response.json();
    const coverIds = data?.docs
      ?.map((doc: any) => doc.cover_i)
      .filter((id: any): id is number => typeof id === 'number')
      .slice(0, 9) || [];
    return coverIds.map((id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`);
  } catch (error) {
    console.error(`Error fetching from Open Library API with URL: ${url}`, error);
    return [];
  }
};

const tryFetchGoogleBooks = async (url: string): Promise<string[]> => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Google Books API responded with status: ${response.status} for URL: ${url}`);
            return [];
        }
        const data = await response.json();
        return data.items
            ?.map((item: any) => item.volumeInfo?.imageLinks?.thumbnail)
            .filter(Boolean)
            // Get higher quality images by replacing zoom=1 with zoom=0
            .map((url: string) => url.replace('&zoom=1', '&zoom=0'))
            .slice(0, 9) || [];
    } catch (error) {
        console.error(`Error fetching from Google Books API with URL: ${url}`, error);
        return [];
    }
};


export const fetchCoverImageUrls = async (
    seriesName: string,
    author: string,
    lastReadBookTitle: string,
    nextBookTitle?: string
): Promise<string[]> => {
  const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json';
  const GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1/volumes';

  const encodedAuthor = encodeURIComponent(author);

  const searchTitles: string[] = [];
  if (nextBookTitle && nextBookTitle.toLowerCase() !== 'to be announced' && nextBookTitle.toLowerCase() !== 'tba') {
    searchTitles.push(nextBookTitle);
  }
  searchTitles.push(lastReadBookTitle);
  searchTitles.push(seriesName);

  const uniqueSearchTitles = [...new Set(searchTitles)];

  const searchPromises: Promise<string[]>[] = [];

  uniqueSearchTitles.forEach(title => {
    const encodedTitle = encodeURIComponent(title);

    // Add Open Library promise
    searchPromises.push(tryFetchOpenLibrary(`${OPEN_LIBRARY_SEARCH_URL}?title=${encodedTitle}&author=${encodedAuthor}`));

    // Add Google Books promise
    searchPromises.push(tryFetchGoogleBooks(`${GOOGLE_BOOKS_API_URL}?q=intitle:${encodedTitle}+inauthor:${encodedAuthor}&maxResults=9`));
  });

  const results = await Promise.all(searchPromises);

  const allCoverUrls = results.flat();
  const uniqueCoverUrls = [...new Set(allCoverUrls)].slice(0, 9);

  if (uniqueCoverUrls.length > 0) {
    return uniqueCoverUrls;
  }

  console.log(`No covers found for any of the searched titles from any source.`);
  return [];
};
