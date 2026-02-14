import React, { useState } from 'react';

const navLinks = [
  { label: 'Painting Crafts', href: '#painting-crafts' },
  { label: 'Digital Products', href: '#digital-products' },
  { label: 'Souvenirs', href: '#souvenirs' },
  { label: 'Corporate Giveaways', href: '#corporate-giveaways' },
  { label: 'Personalized Gifts', href: '#personalized-gifts' },
  { label: 'T-Shirt Printing', href: '#tshirt-printing' },
  { label: 'Printing Supplies', href: '#printing-supplies' },
  { label: 'Services', href: '#services' },
  { label: 'Estimate', href: '#estimate' },
  { label: 'Info', href: '#info' },
];

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <a href="/" className="flex items-center gap-1.5 shrink-0">
            <span className="font-heading font-bold text-xl lg:text-2xl">
              <span className="text-brand-black">Personalize</span>
              <span className="text-brand-gold">Me</span>
            </span>
          </a>

          <button
            type="button"
            className="xl:hidden p-2 rounded-lg text-brand-black hover:bg-gray-100"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          <div
            className={`absolute top-full left-0 right-0 bg-white border-b border-gray-200 xl:static xl:border-0 xl:!flex xl:items-center ${
              menuOpen ? 'block' : 'hidden'
            }`}
          >
            <ul className="flex flex-col xl:flex-row xl:gap-1 xl:flex-nowrap xl:justify-end xl:flex-shrink-0 py-4 xl:py-0">
              {navLinks.map((link) => (
                <li key={link.href} className="xl:shrink-0">
                  <a
                    href={link.href}
                    className="block px-4 py-2 xl:py-1 xl:px-3 xl:text-sm text-brand-black hover:text-brand-red hover:bg-gray-50 xl:hover:bg-transparent font-medium transition-colors whitespace-nowrap"
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
