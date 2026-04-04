'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';

/**
 * CustomDropdown - A custom dropdown component that matches the old inventory style
 *
 * Props:
 * - value: current selected value
 * - onChange: callback when selection changes
 * - options: array of { value, label } objects
 * - placeholder: text to show when no selection
 * - className: additional CSS classes
 * - style: additional inline styles
 */
export default function CustomDropdown({ value, onChange, options, placeholder = 'Select...', className = '', style = {}, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Deduplicate options by value, keep first occurrence
  const uniqueOptions = useMemo(() => {
    const seen = new Set();
    return options.filter(o => {
      if (seen.has(o.value)) return false;
      seen.add(o.value);
      return true;
    });
  }, [options]);

  const selectedOption = uniqueOptions.find(o => o.value === value);
  const displayText = selectedOption ? selectedOption.label : placeholder;

  // Filter out selected value from the options list (it's shown as header)
  const listOptions = useMemo(() => {
    return uniqueOptions.filter(o => o.value !== value);
  }, [uniqueOptions, value]);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={`custom-dropdown ${className}`} style={{ position: 'relative', ...style }}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="custom-dropdown-trigger"
        disabled={disabled}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.625rem 0.75rem',
          background: disabled ? 'rgba(255,255,255,0.03)' : isOpen ? 'rgba(212,168,67,0.1)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${disabled ? 'rgba(255,255,255,0.05)' : isOpen ? 'rgba(212,168,67,0.4)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: '8px',
          color: disabled ? 'rgba(255,255,255,0.3)' : isOpen ? '#D4A843' : '#E5E2E1',
          fontSize: '0.85rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          transition: 'all 0.15s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayText}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            flexShrink: 0,
            marginLeft: '0.5rem',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="custom-dropdown-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--dark)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            overflow: 'hidden',
            zIndex: 1000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {/* Selected option header (only if something is selected) */}
          {selectedOption && (
            <div
              style={{
                padding: '0.625rem 0.75rem',
                background: 'rgba(212,168,67,0.15)',
                borderBottom: listOptions.length > 0 ? '1px solid var(--border)' : 'none',
                color: '#D4A843',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {selectedOption.label}
            </div>
          )}
          {/* Options list (excluding selected value to avoid duplicates) */}
          {listOptions.length > 0 && (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {listOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.75rem',
                    background: 'transparent',
                    border: 'none',
                    color: '#E5E2E1',
                    fontSize: '0.85rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
