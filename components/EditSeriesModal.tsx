import React, { useState, useEffect } from 'react';
import { BookSeries, NextBookInfo } from '../types';
import { XMarkIcon, ArrowUpRightIcon } from './Icons';

interface EditSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (series: BookSeries) => void;
  series: BookSeries;
}

const EditSeriesModal: React.FC<EditSeriesModalProps> = ({ isOpen, onClose, onSave, series }) => {
  const withEditableNextBook = (value: BookSeries): BookSeries => ({
    ...value,
    nextBookInfo: value.nextBookInfo ?? {
      nextBookTitle: '',
      releaseDate: 'TBA',
      audiobookReleaseDate: 'TBA',
      status: 'Unknown',
      summary: '',
    },
  });
  const [formData, setFormData] = useState(() => withEditableNextBook(series));

  useEffect(() => {
    setFormData(withEditableNextBook(series));
  }, [series]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const type = e.target.getAttribute('type');
    
    if (name.startsWith('nextBookInfo.')) {
        const field = name.split('.')[1];
        setFormData(prev => ({
            ...prev,
            nextBookInfo: {
                ...(prev.nextBookInfo as NextBookInfo),
                [field]: value,
            }
        }));
    } else {
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? parseInt(value, 10) || 1 : value,
        }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      <div className="bg-bg-secondary dark:bg-dark-bg-secondary border-4 border-text-primary dark:border-dark-text-primary rounded-md p-6 w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-3 right-3 text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary">
          <XMarkIcon className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-black mb-6 text-center text-text-primary dark:text-dark-text-primary">Edit Series Details</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="text-lg font-bold border-b-2 border-text-primary dark:border-dark-text-primary pb-2 mb-3 text-brand dark:text-dark-brand">Series Info</h3>
          <div>
            <label htmlFor="seriesName" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Series Name</label>
            <input type="text" id="seriesName" name="seriesName" value={formData.seriesName} onChange={handleChange}
              className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand" />
          </div>
          <div>
            <label htmlFor="author" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Author</label>
            <input type="text" id="author" name="author" value={formData.author} onChange={handleChange}
              className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand" />
          </div>
          <div>
            <label htmlFor="coverImageUrl" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Cover Image URL</label>
            <input type="text" id="coverImageUrl" name="coverImageUrl" value={formData.coverImageUrl || ''} onChange={handleChange}
              className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand" />
          </div>

          <h3 className="text-lg font-bold border-b-2 border-text-primary dark:border-dark-text-primary pb-2 mb-3 pt-4 text-brand dark:text-dark-brand">Last Book Read</h3>
          <div>
            <label htmlFor="lastBookReadTitle" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Title</label>
            <input type="text" id="lastBookReadTitle" name="lastBookReadTitle" value={formData.lastBookReadTitle} onChange={handleChange}
              className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand" />
          </div>
          <div>
            <label htmlFor="lastBookReadNumber" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Book Number</label>
            <input type="number" id="lastBookReadNumber" name="lastBookReadNumber" value={formData.lastBookReadNumber} onChange={handleChange} min="1"
              className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand" />
          </div>
          
          {formData.nextBookInfo && (
            <>
              <h3 className="text-lg font-bold border-b-2 border-text-primary dark:border-dark-text-primary pb-2 mb-3 pt-4 text-brand dark:text-dark-brand">Next Book Info</h3>
              <div>
                <label htmlFor="nextBookTitle" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Title</label>
                <input type="text" id="nextBookTitle" name="nextBookInfo.nextBookTitle" value={formData.nextBookInfo.nextBookTitle} onChange={handleChange}
                  className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand" />
              </div>
              <div>
                <label htmlFor="releaseDate" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Release Date (e.g., YYYY-MM-DD or TBA)</label>
                <input type="text" id="releaseDate" name="nextBookInfo.releaseDate" value={formData.nextBookInfo.releaseDate} onChange={handleChange}
                  className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand" />
              </div>
              <div>
                <label htmlFor="audiobookReleaseDate" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Audiobook Release Date (e.g., YYYY-MM-DD or TBA)</label>
                <input type="text" id="audiobookReleaseDate" name="nextBookInfo.audiobookReleaseDate" value={formData.nextBookInfo.audiobookReleaseDate || ''} onChange={handleChange}
                  className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand" />
              </div>
              <div>
                <label htmlFor="nextBookStatus" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Status</label>
                <select id="nextBookStatus" name="nextBookInfo.status" value={formData.nextBookInfo.status} onChange={handleChange}
                  className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand">
                  {(['Unknown', 'Unannounced', 'Announced', 'Released', 'Series Complete'] as NextBookInfo['status'][]).map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
               <div>
                <label htmlFor="summary" className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Summary</label>
                <textarea id="summary" name="nextBookInfo.summary" value={formData.nextBookInfo.summary} onChange={handleChange} rows={3}
                  className="mt-1 block w-full bg-bg-primary dark:bg-dark-bg-primary border-2 border-text-primary dark:border-dark-text-primary rounded-md py-2 px-3 text-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-brand dark:focus:ring-dark-brand"></textarea>
              </div>

              {formData.nextBookInfo.sources && formData.nextBookInfo.sources.length > 0 && (
                <div>
                    <h4 className="block text-sm font-bold text-text-primary dark:text-dark-text-primary mb-1">Sources (from last refresh)</h4>
                    <div className="mt-2 space-y-2 bg-bg-primary dark:bg-dark-bg-primary p-3 rounded-md border-2 border-text-primary dark:border-dark-text-primary">
                        {formData.nextBookInfo.sources.map((source, index) => (
                            <div key={index} className="truncate flex items-center gap-2 text-sm">
                                <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-brand dark:text-dark-brand hover:underline truncate" title={source.title}>
                                    {source.title || source.uri}
                                </a>
                                <ArrowUpRightIcon className="w-4 h-4 text-text-secondary dark:text-dark-text-secondary flex-shrink-0" />
                            </div>
                        ))}
                    </div>
                </div>
              )}
            </>
          )}

          <div className="pt-4">
            <button type="submit" className="w-full bg-brand dark:bg-dark-brand hover:bg-brand-hover dark:hover:bg-dark-brand-hover text-white dark:text-dark-bg-primary font-bold py-2.5 px-4 rounded-md transition-colors border-2 border-text-primary">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditSeriesModal;
