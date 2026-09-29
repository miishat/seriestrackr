import { GoogleGenAI } from "@google/genai";
import { NextBookInfo } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const nextBookSchemaDescription = `
  - "nextBookTitle": The title of the next book. Use 'To be announced' if unknown.
  - "releaseDate": The official physical/ebook release date in 'YYYY-MM-DD' format. Use 'TBA' if not announced.
  - "audiobookReleaseDate": The official audiobook release date in 'YYYY-MM-DD' format. Use 'TBA' if not announced or not available.
  - "status": The current status of the physical/ebook. Must be one of: 'Announced', 'Released', 'Unannounced', 'Series Complete'.
  - "summary": A very short, one-sentence summary.
`;

export const fetchNextBookInfo = async (
  seriesName: string,
  author: string,
  lastBookReadNumber: number
): Promise<NextBookInfo> => {
  try {
    const prompt = `
      You are a helpful assistant specializing in book series information.
      Please perform a web search to find the most accurate and up-to-date information for the next book in the series "${seriesName}" by author "${author}".
      The last book the user read was book number ${lastBookReadNumber}. Find information for book number ${lastBookReadNumber + 1}.
      Specifically, find the release dates for BOTH the physical/ebook AND the audiobook.
      Consult reliable sources like Goodreads, Audible, publisher websites, and author announcements.

      After your search, provide the information in a single JSON object inside a markdown code block.
      The JSON object must contain the following fields:
      ${nextBookSchemaDescription}

      **IMPORTANT RULE**: If the "nextBookTitle" is "To be announced" or the "releaseDate" is "TBA", the "status" MUST be "Unannounced".

      Example response format:
      \`\`\`json
      {
        "nextBookTitle": "Example Title",
        "releaseDate": "2025-10-21",
        "audiobookReleaseDate": "2025-11-15",
        "status": "Announced",
        "summary": "An example summary of what happens next in the series."
      }
      \`\`\`

      If the series is complete or no information is available, please indicate that in the status and other fields. If an audiobook version is not planned or announced, set "audiobookReleaseDate" to "TBA".
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{googleSearch: {}}],
      },
    });

    const text = response.text;
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    
    let parsed: Omit<NextBookInfo, 'sources'>;

    if (!jsonMatch || !jsonMatch[1]) {
      try {
        parsed = JSON.parse(text.trim());
      } catch (e) {
         throw new Error(`Failed to parse JSON response from API. Response was: "${text}"`);
      }
    } else {
        const jsonText = jsonMatch[1];
        parsed = JSON.parse(jsonText);
    }
    
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.map(chunk => chunk.web && { uri: chunk.web.uri, title: chunk.web.title })
        .filter((s): s is { uri: string; title: string; } => Boolean(s)) || [];

    return { ...parsed, sources };

  } catch (error) {
    console.error("Error fetching book info from Gemini API:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to retrieve book information: ${error.message}`);
    }
    throw new Error("Failed to retrieve book information. An unknown error occurred.");
  }
};

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