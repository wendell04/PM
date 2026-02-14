import React from 'react';

const UtilityBar = () => {
  return (
    <div className="w-full bg-brand-black text-white py-2 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
          <a href="tel:09166802851" className="hover:text-brand-gold transition-colors whitespace-nowrap">
            0916 680 2851
          </a>
          <a href="tel:09287219074" className="hover:text-brand-gold transition-colors whitespace-nowrap">
            0928 721 9074
          </a>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
          <a href="#account" className="hover:text-brand-gold transition-colors whitespace-nowrap">
            Account
          </a>
          <a href="#signin" className="hover:text-brand-gold transition-colors whitespace-nowrap">
            Sign In
          </a>
          <a href="#cart" className="hover:text-brand-gold transition-colors shrink-0" aria-label="Cart">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
};

export default UtilityBar;
