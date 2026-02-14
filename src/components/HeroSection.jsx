import React from 'react';

const HeroSection = () => {
  return (
    <section className="relative bg-brand-black overflow-hidden">
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-gold/10 via-transparent to-brand-red/10" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-brand-red/5 rounded-l-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-brand-gold/5 rounded-tr-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="max-w-2xl">
          <h1 className="font-heading font-extrabold text-4xl sm:text-5xl lg:text-6xl tracking-tight text-white leading-tight">
            <span className="text-brand-gold">Printing Quality</span>
            <br />
            <span className="text-brand-red italic font-semibold">at Affordable Rates</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-300 max-w-xl">
            High-quality printing that puts your brand front and center. From custom gifts to corporate giveaways—crafted just for you.
          </p>
          <a
            href="#top-print-products"
            className="inline-flex items-center gap-2 mt-8 px-8 py-4 bg-white text-brand-black font-heading font-bold text-lg rounded-lg hover:bg-brand-gold hover:text-brand-black transition-all duration-200 shadow-lg"
          >
            Shop Now
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
          <div className="mt-10 flex flex-wrap gap-6 text-gray-400">
            <a href="mailto:info@personalizeme.ph" className="flex items-center gap-2 hover:text-brand-gold transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              info@personalizeme.ph
            </a>
            <a href="tel:09166802851" className="flex items-center gap-2 hover:text-brand-gold transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              0916 680 2851
            </a>
            <a href="tel:09287219074" className="flex items-center gap-2 hover:text-brand-gold transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              0928 721 9074
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
