import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BookSeries, NextBookInfo, FetchStatus } from '../types';
import { fetchNextBookInfo, fetchCoverImageUrls } from '../services/geminiService';
import { RefreshIcon, TrashIcon, PencilIcon, ArrowUpRightIcon, PhotoIcon, XMarkIcon, MagnifyingGlassIcon } from './Icons';

type ViewMode = 'grid' | 'compact' | 'list';

const SkeletonBlock = ({ className }: { className?: string }) => (
    <div className={`relative overflow-hidden bg-bg-primary dark:bg-dark-bg-primary/50 rounded-md ${className}`}>
        <div className="absolute inset-0 transform-gpu translate-x-[-100%] animate-shimmer bg-gradient-to-r from-transparent via-black/10 dark:via-white/10 to-transparent"></div>
    </div>
);

interface CoverSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCover: (url: string) => void;
  coverUrls: string[];
  isLoading: boolean;
  onSearchAgain: () => void;
}

const CoverSelectionModal: React.FC<CoverSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectCover,
  coverUrls,
  isLoading,
  onSearchAgain,
}) => {
  if (!isOpen) return null;

  const handleSelect = (url: string) => {
    onSelectCover(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-4">
      <div className="bg-bg-secondary dark:bg-dark-bg-secondary border-4 border-text-primary dark:border-dark-text-primary rounded-md p-6 w-full max-w-4xl relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary z-10">
          <XMarkIcon className="w-6 h-6" />
        </button>
        <div className="flex justify-between items-center mb-6 pr-8">
            <h2 className="text-2xl font-black text-text-primary dark:text-dark-text-primary">Select a Cover</h2>
            <button
                onClick={onSearchAgain}
                disabled={isLoading}
                className="flex items-center gap-2 bg-brand dark:bg-dark-brand hover:bg-brand-hover dark:hover:bg-dark-brand-hover text-white dark:text-dark-bg-primary font-bold py-2 px-4 rounded-md transition-colors border-2 border-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                Search Again
            </button>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <RefreshIcon className="w-12 h-12 text-text-secondary dark:text-dark-text-secondary animate-spin" />
            <p className="text-lg text-text-secondary dark:text-dark-text-secondary ml-4 font-bold">Searching for covers...</p>
          </div>
        ) : coverUrls.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[60vh] overflow-y-scroll pr-2">
            {coverUrls.map((url, index) => (
              <div key={index} className="group relative cursor-pointer border-2 border-text-primary" onClick={() => handleSelect(url)}>
                <img
                  src={url}
                  alt={`Cover option ${index + 1}`}
                  className="w-full aspect-[2/3] object-cover bg-bg-primary dark:bg-dark-bg-primary transition-transform transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 flex items-center justify-center transition-opacity">
                  <p className="text-white font-bold opacity-0 group-hover:opacity-100">Select</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <PhotoIcon className="w-16 h-16 mx-auto text-text-secondary/50 dark:text-dark-text-secondary/50 mb-4" />
            <h3 className="text-xl font-bold text-text-primary dark:text-dark-text-primary mb-2">No Covers Found</h3>
            <p className="text-text-secondary dark:text-dark-text-secondary">We couldn't find any covers for this book.</p>
            <p className="text-text-secondary dark:text-dark-text-secondary mt-1">You can try searching again or add a URL manually by editing the series.</p>
          </div>
        )}
      </div>
    </div>
  );
};

interface BookSeriesCardProps {
  series: BookSeries;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<BookSeries>) => void;
  onEdit: (series: BookSeries) => void;
  showCovers: boolean;
  viewMode: ViewMode;
}

const getStatusColor = (status: NextBookInfo['status'] | 'Unknown' | undefined) => {
  switch (status) {
    case 'Released':
      return 'bg-green-400 text-text-primary border-text-primary';
    case 'Announced':
      return 'bg-blue-400 text-text-primary border-text-primary';
    case 'Unannounced':
      return 'bg-yellow-400 text-text-primary border-text-primary';
    case 'Series Complete':
        return 'bg-slate-400 text-text-primary border-text-primary';
    default:
      return 'bg-gray-200 dark:bg-gray-600 text-text-primary dark:text-dark-text-primary border-text-primary dark:border-dark-text-primary';
  }
};

const BookSeriesCard: React.FC<BookSeriesCardProps> = ({ series, onDelete, onUpdate, onEdit, showCovers, viewMode }) => {
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [coverOptions, setCoverOptions] = useState<string[]>([]);
  const [isFindingCover, setIsFindingCover] = useState(false);

  const nextBookInfo = series.nextBookInfo;

  const fetchInfo = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const info = await fetchNextBookInfo(series.seriesName, series.author, series.lastBookReadNumber);
      onUpdate(series.id, { nextBookInfo: info });
      setStatus('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred.');
      setStatus('error');
    }
  }, [series.seriesName, series.author, series.lastBookReadNumber, series.id, onUpdate]);

  useEffect(() => {
    if (!nextBookInfo) {
      fetchInfo();
    } else {
      setStatus('success');
    }
  }, [nextBookInfo, fetchInfo]);

  const computedStatus = useMemo(() => {
    if (!nextBookInfo) return 'Unknown';
    
    const isEffectivelyUnannounced =
      nextBookInfo.nextBookTitle?.toLowerCase().includes('to be announced') ||
      nextBookInfo.releaseDate?.toLowerCase() === 'tba';

    if (isEffectivelyUnannounced) {
      return 'Unannounced';
    }

    if (nextBookInfo.status === 'Announced') {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day
        const releaseDate = new Date(nextBookInfo.releaseDate);
        if (!isNaN(releaseDate.getTime()) && releaseDate <= today) {
            return 'Released';
        }
    }
    return nextBookInfo.status;
  }, [nextBookInfo]);

  const handleFindCover = useCallback(async () => {
    setIsFindingCover(true);
    setIsCoverModalOpen(true);
    setCoverOptions([]);
    try {
      const imageUrls = await fetchCoverImageUrls(
        series.seriesName,
        series.author,
        series.lastBookReadTitle,
        series.nextBookInfo?.nextBookTitle
      );
      setCoverOptions(imageUrls);
    } catch (error) {
      console.error("Failed to find cover", error);
      alert("An error occurred while searching for the cover image.");
      setCoverOptions([]);
    } finally {
      setIsFindingCover(false);
    }
  }, [series.seriesName, series.author, series.lastBookReadTitle, series.nextBookInfo]);


  const renderContent = () => {
    if (status === 'loading' && !nextBookInfo) {
      return (
        <div className="space-y-3">
          <SkeletonBlock className="h-6 w-3/4" />
          <SkeletonBlock className="h-4 w-1/2" />
          <div className="pt-2 space-y-2">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-5/6" />
          </div>
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="text-center text-red-500 font-bold">
          <p>{error}</p>
          <button onClick={fetchInfo} className="mt-2 text-brand dark:text-dark-brand hover:underline">
            Try Again
          </button>
        </div>
      );
    }
    
    if (nextBookInfo) {
      return (
        <>
          <h3 className="text-xl font-bold text-text-primary dark:text-dark-text-primary truncate" title={nextBookInfo.nextBookTitle}>
            Next: {nextBookInfo.nextBookTitle}
          </h3>
          <p className="text-text-secondary dark:text-dark-text-secondary">
            Release: <span className="font-semibold text-text-primary dark:text-dark-text-primary">{nextBookInfo.releaseDate}</span>
          </p>
          {nextBookInfo.audiobookReleaseDate && nextBookInfo.audiobookReleaseDate.toUpperCase() !== 'TBA' && (
            <p className="text-text-secondary dark:text-dark-text-secondary">
              Audiobook: <span className="font-semibold text-text-primary dark:text-dark-text-primary">{nextBookInfo.audiobookReleaseDate}</span>
            </p>
          )}
          {viewMode !== 'compact' && viewMode !== 'list' && (
            <p className="text-text-secondary dark:text-dark-text-secondary text-sm mt-2">"{nextBookInfo.summary}"</p>
          )}
          {viewMode !== 'compact' && viewMode !== 'list' && nextBookInfo.sources && nextBookInfo.sources.length > 0 && (
            <div className="mt-3 pt-3 border-t-2 border-text-primary dark:border-dark-text-primary">
                <h4 className="text-xs font-bold text-text-secondary/70 dark:text-dark-text-secondary/70 mb-1 uppercase tracking-wider">Sources</h4>
                <ul className="text-xs space-y-1">
                    {nextBookInfo.sources.slice(0, 2).map((source, index) => (
                        <li key={index} className="truncate flex items-center gap-1.5">
                            <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-text-secondary dark:text-dark-text-secondary hover:text-brand dark:hover:text-dark-brand truncate" title={source.title}>
                                {source.title || source.uri}
                            </a>
                            <ArrowUpRightIcon className="w-3 h-3 text-text-secondary/50 flex-shrink-0" />
                        </li>
                    ))}
                </ul>
            </div>
          )}
        </>
      );
    }
    
    return null;
  };

  const ImagePlaceholder = () => (
    <div className="w-full h-full text-text-secondary/80 dark:text-dark-text-secondary/80 flex flex-col items-center justify-center text-center p-4 bg-bg-primary dark:bg-dark-bg-primary">
        <p className="text-sm font-bold mb-4">No cover available</p>
        <button
            onClick={handleFindCover}
            className="flex items-center gap-2 bg-brand dark:bg-dark-brand text-white dark:text-dark-bg-primary text-sm font-bold py-2 px-4 rounded-md transition-colors border-2 border-text-primary"
        >
            <MagnifyingGlassIcon className="w-4 h-4" />
            Find Cover
        </button>
    </div>
  );
  
  if (viewMode === 'list') {
    return (
        <div className="bg-bg-secondary dark:bg-dark-bg-secondary rounded-md border-2 border-text-primary dark:border-dark-text-primary overflow-hidden flex items-center p-4 gap-4">
            <div className='flex-grow'>
                <div className='flex items-center justify-between'>
                    <h2 className="text-lg font-bold text-brand dark:text-dark-brand truncate" title={series.seriesName}>{series.seriesName}</h2>
                    <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-md border-2 ${getStatusColor(computedStatus)}`}>
                      {status === 'loading' && !nextBookInfo ? 'Checking...' : (computedStatus || 'Unknown')}
                    </span>
                </div>
                <p className="text-text-secondary dark:text-dark-text-secondary text-sm mb-2">{series.author}</p>
                
                <div className='border-t-2 border-text-primary dark:border-dark-text-primary pt-2 mt-2'>
                    <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
                        Next: <span className='font-semibold text-text-primary dark:text-dark-text-primary'>{nextBookInfo?.nextBookTitle || '...'}</span>
                    </p>
                    <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
                        Release: <span className='font-semibold text-text-primary dark:text-dark-text-primary'>{nextBookInfo?.releaseDate || '...'}</span>
                    </p>
                    {nextBookInfo?.audiobookReleaseDate && nextBookInfo.audiobookReleaseDate.toUpperCase() !== 'TBA' && (
                        <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
                            Audiobook: <span className='font-semibold text-text-primary dark:text-dark-text-primary'>{nextBookInfo.audiobookReleaseDate}</span>
                        </p>
                    )}
                </div>
            </div>
            <div className="flex flex-col items-center gap-2 border-l-2 border-text-primary dark:border-dark-text-primary pl-4">
                <button onClick={() => onEdit(series)} className="p-1.5 text-text-secondary dark:text-dark-text-secondary hover:bg-brand/20 dark:hover:bg-dark-brand/20 rounded-sm" aria-label="Edit series">
                    <PencilIcon className="w-5 h-5" />
                </button>
                <button onClick={fetchInfo} disabled={status === 'loading'} className="p-1.5 text-text-secondary dark:text-dark-text-secondary hover:bg-brand/20 dark:hover:bg-dark-brand/20 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Refresh series data">
                    <RefreshIcon className={`w-5 h-5 ${status === 'loading' ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => onDelete(series.id)} className="p-1.5 text-text-secondary dark:text-dark-text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-sm" aria-label="Delete series">
                    <TrashIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
  }

  return (
    <>
      <div className="bg-bg-secondary dark:bg-dark-bg-secondary rounded-md border-4 border-text-primary dark:border-dark-text-primary overflow-hidden flex flex-col">
        {showCovers && (
          <div className="group relative aspect-[2/3] w-full bg-bg-primary dark:bg-dark-bg-primary flex items-center justify-center overflow-hidden border-b-4 border-text-primary dark:border-dark-text-primary">
            {series.coverImageUrl ? (
              <>
                <img src={series.coverImageUrl} alt={`${series.seriesName} cover`} className="w-full h-full object-cover" 
                  onError={() => onUpdate(series.id, { coverImageUrl: '' })}
                />
                <div 
                  className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-70 transition-all duration-300 flex items-center justify-center cursor-pointer"
                  onClick={handleFindCover}
                  role="button"
                  aria-label="Change cover image"
                >
                  <div className="text-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <RefreshIcon className="w-8 h-8 mx-auto" />
                    <p className="text-sm font-semibold mt-1">Change Cover</p>
                  </div>
                   <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdate(series.id, { coverImageUrl: '' });
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-red-600/90 hover:bg-red-500 rounded-md text-white opacity-0 group-hover:opacity-100 transition-all duration-300 z-10 border-2 border-dark-text-primary"
                    aria-label="Remove cover image"
                    title="Remove cover"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <ImagePlaceholder />
            )}
          </div>
        )}

        <div className="p-4 md:p-5 flex-grow flex flex-col">
            <div className="flex justify-between items-start mb-2 gap-2">
                <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-md border-2 ${getStatusColor(computedStatus)}`}>
                  {status === 'loading' && !nextBookInfo ? 'Checking...' : (computedStatus || 'Unknown')}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => onEdit(series)} className="p-1.5 text-text-secondary dark:text-dark-text-secondary hover:bg-brand/20 dark:hover:bg-dark-brand/20 rounded-md" aria-label="Edit series">
                      <PencilIcon className="w-5 h-5" />
                  </button>
                  <button onClick={fetchInfo} disabled={status === 'loading'} className="p-1.5 text-text-secondary dark:text-dark-text-secondary hover:bg-brand/20 dark:hover:bg-dark-brand/20 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Refresh series data">
                      <RefreshIcon className={`w-5 h-5 ${status === 'loading' ? 'animate-spin' : ''}`} />
                  </button>
                  <button onClick={() => onDelete(series.id)} className="p-1.5 text-text-secondary dark:text-dark-text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-md" aria-label="Delete series">
                      <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
            </div>
            <h2 className="text-xl font-bold text-brand dark:text-dark-brand mb-1 truncate" title={series.seriesName}>{series.seriesName}</h2>
            <p className="text-text-secondary dark:text-dark-text-secondary mb-4 text-sm">by {series.author}</p>
            
            <div className="bg-bg-primary dark:bg-dark-bg-primary p-4 rounded-none flex-grow flex flex-col justify-center border-2 border-text-primary dark:border-dark-text-primary">
                {renderContent()}
            </div>
        </div>

        <div className="bg-bg-secondary dark:bg-dark-bg-secondary px-5 py-3 border-t-4 border-text-primary dark:border-dark-text-primary">
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
              Last Read: <span className="font-bold text-text-primary dark:text-dark-text-primary truncate" title={series.lastBookReadTitle}>
                  #{series.lastBookReadNumber} - {series.lastBookReadTitle}
              </span>
          </p>
        </div>
      </div>
      <CoverSelectionModal
        isOpen={isCoverModalOpen}
        onClose={() => setIsCoverModalOpen(false)}
        onSelectCover={(url) => onUpdate(series.id, { coverImageUrl: url })}
        coverUrls={coverOptions}
        isLoading={isFindingCover}
        onSearchAgain={handleFindCover}
      />
    </>
  );
};

export default BookSeriesCard;