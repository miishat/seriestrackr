import React, { useState, useRef, useEffect } from 'react';
import { PlusIcon, EyeIcon, EyeSlashIcon, FunnelIcon, SunIcon, MoonIcon, ViewGridIcon, ViewCompactIcon, ViewListIcon, MagnifyingGlassIcon } from './Icons';

type Theme = 'light' | 'dark';
type ViewMode = 'grid' | 'compact' | 'list';

interface HeaderProps {
  onAddSeries: () => void;
  showCovers: boolean;
  onToggleCovers: () => void;
  activeFilters: string[];
  onFilterChange: (filters: string[]) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  viewMode: ViewMode;
  setViewMode: (viewMode: ViewMode) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

const Header: React.FC<HeaderProps> = ({ 
  onAddSeries, 
  showCovers, 
  onToggleCovers, 
  activeFilters, 
  onFilterChange,
  theme,
  setTheme,
  viewMode,
  setViewMode,
  searchTerm,
  setSearchTerm
}) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const statuses = ['Announced', 'Released', 'Unannounced', 'Series Complete', 'Unknown'];

  const handleFilterToggle = (status: string) => {
    const newFilters = activeFilters.includes(status)
      ? activeFilters.filter(f => f !== status)
      : [...activeFilters, status];
    onFilterChange(newFilters);
  };
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [filterRef]);

  const viewModeButtons = [
    { mode: 'grid', icon: ViewGridIcon, title: 'Grid View' },
    { mode: 'compact', icon: ViewCompactIcon, title: 'Compact View' },
    { mode: 'list', icon: ViewListIcon, title: 'List View' },
  ] as const;

  return (
    <header className="bg-bg-primary dark:bg-dark-bg-primary sticky top-0 z-20 py-3 border-b-4 border-text-primary dark:border-dark-text-primary">
      <div className="container mx-auto px-4 flex justify-between items-center gap-4">
        <div className="flex items-center flex-shrink-0">
          <h1 className="text-2xl md:text-3xl font-black tracking-tighter">
            <span className="text-text-primary dark:text-dark-text-primary">Series</span><span className="text-brand dark:text-dark-brand">Trackr</span>
          </h1>
        </div>

        <div className="flex-grow max-w-xs md:max-w-sm lg:max-w-md">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-text-secondary dark:text-dark-text-secondary" />
            </div>
            <input
              type="search"
              placeholder="Search series or author..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full bg-bg-secondary dark:bg-dark-bg-secondary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 pl-10 pr-4 text-sm placeholder:text-text-secondary/80 focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className='hidden sm:flex items-center bg-bg-secondary dark:bg-dark-bg-secondary rounded-md border-2 border-text-primary dark:border-dark-text-primary'>
            {viewModeButtons.map(({mode, icon: Icon, title}) => (
                <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    title={title}
                    className={`p-1.5 rounded-sm transition-colors ${viewMode === mode ? 'bg-brand dark:bg-dark-brand text-white dark:text-dark-bg-primary' : 'text-text-secondary dark:text-dark-text-secondary hover:bg-brand/20 dark:hover:bg-dark-brand/20'}`}
                >
                    <Icon className="w-5 h-5" />
                </button>
            ))}
          </div>

          <div className="hidden sm:flex items-center bg-bg-secondary dark:bg-dark-bg-secondary rounded-md border-2 border-text-primary dark:border-dark-text-primary">
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              className="p-2 text-text-secondary dark:text-dark-text-secondary hover:bg-brand/20 dark:hover:bg-dark-brand/20 transition-colors"
            >
              <SunIcon className={`w-5 h-5 ${theme === 'light' ? 'hidden' : 'block'}`} />
              <MoonIcon className={`w-5 h-5 ${theme === 'dark' ? 'hidden' : 'block'}`} />
            </button>
            
            <button
              onClick={onToggleCovers}
              title={showCovers ? 'Hide Covers' : 'Show Covers'}
              className="p-2 text-text-secondary dark:text-dark-text-secondary hover:bg-brand/20 dark:hover:bg-dark-brand/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-l-2 border-text-primary dark:border-dark-text-primary"
              disabled={viewMode === 'list'}
            >
              {showCovers ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
            </button>

            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setIsFilterOpen(prev => !prev)}
                title="Filter by Status"
                className={`p-2 text-text-secondary dark:text-dark-text-secondary hover:bg-brand/20 dark:hover:bg-dark-brand/20 transition-colors relative border-l-2 border-text-primary dark:border-dark-text-primary ${activeFilters.length > 0 ? 'bg-brand/30 dark:bg-dark-brand/30' : ''}`}
              >
                <FunnelIcon className="w-5 h-5" />
                {activeFilters.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-text-primary border-2 border-text-primary">
                    {activeFilters.length}
                  </span>
                )}
              </button>
              {isFilterOpen && (
                <div className="absolute right-0 mt-3 w-56 origin-top-right rounded-md bg-bg-secondary dark:bg-dark-bg-secondary z-20 border-2 border-text-primary dark:border-dark-text-primary">
                  <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                    <div className="px-4 py-2 text-sm text-text-primary dark:text-dark-text-primary font-bold border-b-2 border-text-primary dark:border-dark-text-primary">Filter by Status</div>
                    {statuses.map((status) => (
                      <label key={status} className="flex items-center w-full px-4 py-2 text-sm text-text-primary dark:text-dark-text-primary hover:bg-brand/20 dark:hover:bg-dark-brand/20 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-sm border-2 border-text-primary dark:border-dark-text-primary bg-transparent text-brand dark:text-dark-brand focus:ring-brand dark:focus:ring-dark-brand focus:ring-offset-0"
                          checked={activeFilters.includes(status)}
                          onChange={() => handleFilterToggle(status)}
                        />
                        <span className="ml-3">{status}</span>
                      </label>
                    ))}
                    {activeFilters.length > 0 && (
                      <div className="border-t-2 border-text-primary dark:border-dark-text-primary px-4 py-2">
                        <button onClick={() => onFilterChange([])} className="text-sm text-brand dark:text-dark-brand hover:underline font-bold w-full text-left">
                          Clear All Filters
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
          
          <button
            onClick={onAddSeries}
            className="flex items-center gap-2 bg-brand dark:bg-dark-brand hover:bg-brand-hover dark:hover:bg-dark-brand-hover text-white dark:text-dark-bg-primary font-bold py-2 px-4 rounded-md transition-colors border-2 border-text-primary"
          >
            <PlusIcon className="w-5 h-5" />
            <span className="hidden sm:inline">Add Series</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
