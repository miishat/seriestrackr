import React, { useState, useEffect } from 'react';
import { BookSeries } from '../types';
import { XMarkIcon } from './Icons';

interface AddSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSeries: (series: Omit<BookSeries, 'id'>) => void;
}

const AddSeriesModal: React.FC<AddSeriesModalProps> = ({ isOpen, onClose, onAddSeries }) => {
  const [seriesName, setSeriesName] = useState('');
  const [author, setAuthor] = useState('');
  const [lastBookReadTitle, setLastBookReadTitle] = useState('');
  const [lastBookReadNumber, setLastBookReadNumber] = useState(1);
  const [error, setError] = useState('');

  const resetLocalState = () => {
    setSeriesName('');
    setAuthor('');
    setLastBookReadTitle('');
    setLastBookReadNumber(1);
    setError('');
  };

  useEffect(() => {
    if (!isOpen) {
      // No need to timeout, state resets happen before next open
      resetLocalState();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!seriesName || !author || !lastBookReadTitle) {
      setError('Please fill out all fields.');
      return;
    }
    onAddSeries({
      seriesName,
      author,
      lastBookReadTitle,
      lastBookReadNumber,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      <div className="bg-bg-secondary dark:bg-dark-bg-secondary border-4 border-text-primary dark:border-dark-text-primary rounded-md p-6 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary">
          <XMarkIcon className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-black mb-6 text-center text-text-primary dark:text-dark-text-primary">Add New Series</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="seriesName" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Series Name</label>
            <input type="text" id="seriesName" value={seriesName} onChange={(e) => setSeriesName(e.target.value)}
              className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand" />
          </div>
          <div>
            <label htmlFor="author" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Author</label>
            <input type="text" id="author" value={author} onChange={(e) => setAuthor(e.target.value)}
              className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand" />
          </div>
          <div>
            <label htmlFor="lastBookReadTitle" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Last Book Read Title</label>
            <input type="text" id="lastBookReadTitle" value={lastBookReadTitle} onChange={(e) => setLastBookReadTitle(e.target.value)}
              className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand" />
          </div>
          <div>
            <label htmlFor="lastBookReadNumber" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Book Number in Series</label>
            <input type="number" id="lastBookReadNumber" value={lastBookReadNumber} onChange={(e) => setLastBookReadNumber(parseInt(e.target.value, 10) || 1)} min="1"
              className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand" />
          </div>
          {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
          <div className="pt-4">
            <button type="submit" className="w-full bg-brand dark:bg-dark-brand hover:bg-brand-hover dark:hover:bg-dark-brand-hover text-white dark:text-dark-bg-primary font-bold py-2.5 px-4 rounded-md transition-colors border-2 border-text-primary">
              Add Series
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddSeriesModal;