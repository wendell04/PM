import React, { useRef, useState } from 'react';
import ProductCard from './ProductCard';

const products = [
  {
    id: 1,
    title: 'Semi-Gloss Business Cards',
    image: null,
    variant: 'US Standard',
    copies: '100 Copies',
    price: '450',
    paperType: '350gsm Semi-Gloss (C2S)',
    deliveryTime: '3 Business Days',
    printingSpec: 'One Side Printing',
    categoryLink: '#business-cards',
  },
  {
    id: 2,
    title: 'Spot UV Business Cards',
    image: null,
    variant: 'US Standard',
    copies: '100 Copies',
    price: '680',
    paperType: '400gsm Matt',
    deliveryTime: '4 Biz Days',
    printingSpec: 'Two sides colours',
    categoryLink: '#business-cards',
  },
  {
    id: 3,
    title: 'Conqueror Business Cards',
    image: null,
    variant: 'US Standard',
    copies: '100 Copies',
    price: '720',
    paperType: '300gsm Conqueror Wove Brilliant White',
    deliveryTime: '5 Biz Days',
    printingSpec: 'Two sides colours',
    categoryLink: '#business-cards',
  },
  {
    id: 4,
    title: 'Custom T-Shirt Print',
    image: null,
    variant: 'Standard Fit',
    copies: '1 Piece',
    price: '350',
    paperType: '100% Cotton / Blended',
    deliveryTime: '5–7 Biz Days',
    printingSpec: 'Screen Print / DTF',
    categoryLink: '#tshirt-printing',
  },
  {
    id: 5,
    title: 'Personalized Mugs',
    image: null,
    variant: '11oz Ceramic',
    copies: '1 Piece',
    price: '280',
    paperType: 'Ceramic, Full Wrap',
    deliveryTime: '5 Biz Days',
    printingSpec: 'Sublimation',
    categoryLink: '#personalized-gifts',
  },
  {
    id: 6,
    title: 'Tarpaulin Print',
    image: null,
    variant: '13oz',
    copies: '1 sqm',
    price: '180',
    paperType: '13oz Waterproof Tarpaulin',
    deliveryTime: '3–4 Biz Days',
    printingSpec: 'Full Colour',
    categoryLink: '#printing-supplies',
  },
];

const TopPrintProducts = () => {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  };

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: 'smooth' });
    setTimeout(checkScroll, 300);
  };

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);
    checkScroll();
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, []);

  return (
    <section id="top-print-products" className="py-14 lg:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="font-heading font-bold text-2xl sm:text-3xl lg:text-4xl text-brand-black text-center mb-10">
          Top <span className="text-brand-gold">Print</span> Products
        </h2>

        <div className="relative">
          <div
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto scrollbar-hide scroll-smooth pb-2 -mx-4 px-4 sm:mx-0 sm:px-0"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {products.map((product) => (
              <div key={product.id} className="flex-shrink-0 w-[280px] sm:w-[300px]">
                <ProductCard product={product} />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => scroll(-1)}
            className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 sm:-translate-x-4 w-10 h-10 rounded-full bg-white border border-gray-200 shadow-lg flex items-center justify-center text-brand-black hover:bg-brand-gold hover:border-brand-gold hover:text-brand-black transition-all z-10 ${
              !canScrollLeft ? 'opacity-40 pointer-events-none' : ''
            }`}
            aria-label="Previous products"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 sm:translate-x-4 w-10 h-10 rounded-full bg-white border border-gray-200 shadow-lg flex items-center justify-center text-brand-black hover:bg-brand-gold hover:border-brand-gold hover:text-brand-black transition-all z-10 ${
              !canScrollRight ? 'opacity-40 pointer-events-none' : ''
            }`}
            aria-label="Next products"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
};

export default TopPrintProducts;
