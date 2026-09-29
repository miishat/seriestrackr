import React, { useState, useEffect, useMemo } from 'react';
import { BookSeries } from './types';
import Header from './components/Header';
import AddSeriesModal from './components/AddSeriesModal';
import EditSeriesModal from './components/EditSeriesModal';
import BookSeriesCard from './components/BookSeriesCard';
import { BooksStackIcon, FunnelIcon } from './components/Icons';

type Theme = 'light' | 'dark';
type ViewMode = 'grid' | 'compact' | 'list';

const App: React.FC = () => {
  const [bookSeries, setBookSeries] = useState<BookSeries[]>(() => {
    try {
      const storedSeries = localStorage.getItem('bookSeries');
      return storedSeries ? JSON.parse(storedSeries) : [];
    } catch (error) {
      console.error('Failed to parse book series from localStorage', error);
      return [];
    }
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<BookSeries | null>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('theme')) {
        return localStorage.getItem('theme') as Theme;
    }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
  });

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('viewMode') as ViewMode) || 'grid';
  });

  const [showCovers, setShowCovers] = useState<boolean>(() => {
    const saved = localStorage.getItem('showCovers');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
      if(bookSeries && bookSeries.length > 0) {
        localStorage.setItem('bookSeries', JSON.stringify(bookSeries));
      } else if (bookSeries && bookSeries.length === 0) {
        localStorage.removeItem('bookSeries');
      }
  }, [bookSeries]);
  
  useEffect(() => {
    localStorage.setItem('showCovers', JSON.stringify(showCovers));
  }, [showCovers]);

  const filteredBookSeries = useMemo(() => {
    const getComputedStatus = (series: BookSeries): string => {
        const nextBookInfo = series.nextBookInfo;
        if (!nextBookInfo) return 'Unknown';
        
        let status = nextBookInfo.status;
        if (status === 'Announced') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const releaseDate = new Date(nextBookInfo.releaseDate);
            if (!isNaN(releaseDate.getTime()) && releaseDate <= today) {
                status = 'Released';
            }
        }
        return status || 'Unknown';
    };

    let series = bookSeries;

    if (activeFilters.length > 0) {
        series = series.filter(s => {
            const status = getComputedStatus(s);
            return activeFilters.includes(status);
        });
    }

    if (searchTerm.trim() !== '') {
        const lowercasedTerm = searchTerm.toLowerCase();
        series = series.filter(s =>
            s.seriesName.toLowerCase().includes(lowercasedTerm) ||
            s.author.toLowerCase().includes(lowercasedTerm)
        );
    }

    return series;
  }, [bookSeries, activeFilters, searchTerm]);


  const handleAddSeries = (newSeries: Omit<BookSeries, 'id'>) => {
    const seriesWithId: BookSeries = {
      ...newSeries,
      id: new Date().toISOString(),
    };
    setBookSeries(prev => [seriesWithId, ...prev]);
  };
  
  const handleDeleteSeries = (id: string) => {
    setBookSeries(prev => prev.filter(series => series.id !== id));
  };

  const handleUpdateSeries = (id: string, updates: Partial<BookSeries>) => {
    setBookSeries(prev =>
      prev.map(s => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const handleOpenEditModal = (series: BookSeries) => {
    setEditingSeries(series);
  };

  const handleCloseEditModal = () => {
    setEditingSeries(null);
  };

  const handleSaveEditedSeries = (updatedSeries: BookSeries) => {
    handleUpdateSeries(updatedSeries.id, updatedSeries);
    handleCloseEditModal();
  };

  const handleToggleCovers = () => {
      setShowCovers(prev => !prev);
  }
  
  const gridClassName = useMemo(() => {
    if (viewMode === 'list') {
      return 'grid-cols-1 gap-4';
    }
    if (showCovers) {
      return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8';
    }
    return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8';
  }, [viewMode, showCovers]);

  return (
    <div className="min-h-screen">
      <Header 
        onAddSeries={() => setIsModalOpen(true)}
        showCovers={showCovers}
        onToggleCovers={handleToggleCovers}
        activeFilters={activeFilters}
        onFilterChange={setActiveFilters}
        theme={theme}
        setTheme={setTheme}
        viewMode={viewMode}
        setViewMode={setViewMode}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
       />
      <main className="container mx-auto p-4 md:p-8">
        {bookSeries.length > 0 ? (
            filteredBookSeries.length > 0 ? (
              <div className={`grid ${gridClassName}`}>
                {filteredBookSeries.map(series => (
                    <BookSeriesCard 
                      key={series.id} 
                      series={series} 
                      onDelete={handleDeleteSeries}
                      onUpdate={handleUpdateSeries}
                      onEdit={handleOpenEditModal}
                      showCovers={showCovers}
                      viewMode={viewMode}
                    />
                ))}
              </div>
            ) : (
              <div className="text-center py-20 px-6 bg-bg-secondary dark:bg-dark-bg-secondary rounded-md border-4 border-text-primary dark:border-dark-text-primary">
                  <FunnelIcon className="w-16 h-16 mx-auto text-text-secondary/50 dark:text-dark-text-secondary/50 mb-4" />
                  <h2 className="text-2xl font-bold text-text-primary dark:text-dark-text-primary mb-2">No Matches Found</h2>
                  <p className="text-text-secondary dark:text-dark-text-secondary mb-6">No series match your current filter or search criteria.</p>
                  <button
                      onClick={() => {
                        setActiveFilters([]);
                        setSearchTerm('');
                      }}
                      className="bg-brand dark:bg-dark-brand hover:bg-brand-hover dark:hover:bg-dark-brand-hover text-white dark:text-dark-bg-primary font-bold py-2 px-6 rounded-md transition-colors border-2 border-text-primary"
                  >
                      Clear Filters & Search
                  </button>
              </div>
            )
        ) : (
            <div className="text-center py-20 px-6 bg-bg-secondary dark:bg-dark-bg-secondary rounded-md border-4 border-text-primary dark:border-dark-text-primary">
                <BooksStackIcon className="w-16 h-16 mx-auto text-text-secondary/50 dark:text-dark-text-secondary/50 mb-4" />
                <h2 className="text-2xl font-bold text-text-primary dark:text-dark-text-primary mb-2">Your Bookshelf is Empty</h2>
                <p className="text-text-secondary dark:text-dark-text-secondary mb-6">Start tracking your favorite book series by adding one.</p>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-brand dark:bg-dark-brand hover:bg-brand-hover dark:hover:bg-dark-brand-hover text-white dark:text-dark-bg-primary font-bold py-2 px-6 rounded-md transition-colors border-2 border-text-primary"
                >
                    Add Your First Series
                </button>
            </div>
        )}
      </main>
      <AddSeriesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddSeries={handleAddSeries}
      />
      {editingSeries && (
        <EditSeriesModal
          isOpen={!!editingSeries}
          onClose={handleCloseEditModal}
          onSave={handleSaveEditedSeries}
          series={editingSeries}
        />
      )}
    </div>
  );
};

export default App;
