'use client';

import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem 2rem',
          textAlign: 'center',
          minHeight: '400px',
        }}>
          {/* An SVG, not an emoji - emoji render differently on every platform and are the one
              glyph guaranteed to look wrong on somebody's phone at the exact moment the app has
              already failed them. */}
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }} aria-hidden="true">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#d4a843"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: 600,
            color: '#f5f5f5',
            marginBottom: '0.5rem',
          }}>
            Something went wrong
          </h2>
          <p style={{
            color: '#888',
            fontSize: '0.9rem',
            marginBottom: '1.5rem',
            maxWidth: '400px',
          }}>
            {this.state.error?.message || 'An unexpected error occurred while loading products.'}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#d4a843',
              border: 'none',
              borderRadius: '8px',
              color: '#0f0f0f',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
