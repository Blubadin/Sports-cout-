import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

export type Option = {
  value: string;
  label: string;
  subLabel?: string;
  icon?: React.ReactNode;
};

type CustomSelectProps = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  withinPortal?: boolean;
};

export default function CustomSelect({ value, options, onChange, placeholder = 'Select...', label, className = '', withinPortal = true }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  
  const selectedOption = options.find(o => o.value === value);

  useLayoutEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      // Calculate available space
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = 300; // estimated max height
      
      let top = rect.bottom + window.scrollY;
      // If not enough space below, and more space above, open upwards
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        // We set top to rect.top - window.scrollY but we need height to determine exact, so simpler is:
        top = rect.top + window.scrollY - Math.min(dropdownHeight, spaceAbove) - 4; // 4px gap
      } else {
        top = top + 4; // 4px gap
      }

      setDropdownStyle({
        position: 'absolute',
        top: `${top}px`,
        left: `${rect.left + window.scrollX}px`,
        width: `${rect.width}px`,
        zIndex: 9999,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase()) || 
    (o.subLabel && o.subLabel.toLowerCase().includes(search.toLowerCase()))
  );

  const dropdownContent = (
    <div 
      ref={dropdownRef}
      className={`${withinPortal ? '' : 'absolute top-full mt-1 w-full'} z-[1000] max-h-60 overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl flex flex-col`}
      style={withinPortal ? dropdownStyle : undefined}
    >
      {options.length > 8 && (
        <div className="p-2 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded focus:outline-none"
              autoFocus
            />
          </div>
        </div>
      )}
      
      <div className="overflow-y-auto p-1 custom-scrollbar shrink">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
                setSearch('');
              }}
              className={`w-full text-left flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                value === option.value
                  ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                {option.icon}
                <span>{option.label}</span>
                {option.subLabel && <span className="text-xs text-gray-500 dark:text-gray-400 truncate">({option.subLabel})</span>}
              </span>
              {value === option.value && <Check size={16} className="text-sky-600 dark:text-sky-400 shrink-0" />}
            </button>
          ))
        ) : (
          <div className="p-3 text-center text-xs text-gray-500">No results found</div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`relative flex flex-col gap-1 ${className}`} ref={containerRef}>
      {label && <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
      >
        <span className="truncate text-gray-800 dark:text-gray-200">
          {selectedOption ? (
            <span className="flex items-center gap-2">
              {selectedOption.icon}
              {selectedOption.label}
              {selectedOption.subLabel && <span className="text-xs text-gray-500">({selectedOption.subLabel})</span>}
            </span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (withinPortal ? createPortal(dropdownContent, document.body) : dropdownContent)}
    </div>
  );
}
