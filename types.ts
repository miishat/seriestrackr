export interface BookSeries {
  id: string;
  seriesName: string;
  author: string;
  lastBookReadTitle: string;
  lastBookReadNumber: number;
  coverImageUrl?: string;
  nextBookInfo?: NextBookInfo;
}

export interface NextBookInfo {
  nextBookTitle: string;
  releaseDate: string;
  audiobookReleaseDate?: string;
  status: 'Announced' | 'Released' | 'Unannounced' | 'Series Complete' | 'Unknown';
  summary: string;
  sources?: Array<{
    uri: string;
    title: string;
  }>;
}
