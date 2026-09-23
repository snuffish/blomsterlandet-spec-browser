import { useState, type ReactNode } from 'react';

interface Props {
  label: string;
  defaultOpen?: boolean;
  activeCount?: number;
  activeSummary?: string;
  onClear?: () => void;
  clearLabel?: string;
  className?: string;
  children: ReactNode;
}

export function FilterSection({
  label,
  defaultOpen = true,
  activeCount = 0,
  activeSummary,
  onClear,
  clearLabel,
  className,
  children,
}: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <fieldset className={`filter-section ${className ?? ''} ${isOpen ? 'is-open' : 'is-collapsed'}`}>
      <legend className="filter-legend">
        <div className="filter-header">
          <button
            type="button"
            className="filter-toggle"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((prev) => !prev)}
          >
            <span className="filter-title-group">
              <span className="filter-title">{label}</span>
              {activeCount > 0 && <span className="filter-badge">{activeCount}</span>}
              {!isOpen && activeSummary && (
                <span className="filter-active-summary">{activeSummary}</span>
              )}
            </span>
          </button>
          <div className="filter-actions">
            {onClear && (
              <button
                type="button"
                className="clear"
                onClick={onClear}
                aria-label={clearLabel ?? `Rensa ${label}`}
              >
                ✕
              </button>
            )}
            <button
              type="button"
              className="filter-chevron-btn"
              onClick={() => setIsOpen((prev) => !prev)}
              aria-label={isOpen ? `Fäll ihop ${label}` : `Expandera ${label}`}
              tabIndex={-1}
            >
              <svg
                className={`filter-chevron ${isOpen ? 'open' : 'collapsed'}`}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2.5 4.5L6 8L9.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </legend>

      <div className="filter-body" aria-hidden={!isOpen}>
        <div className="filter-body-inner">
          {children}
        </div>
      </div>
    </fieldset>
  );
}
