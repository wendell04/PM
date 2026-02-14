import React from 'react';

const ProductCard = ({ product }) => {
  const { title, image, variant, copies, price, paperType, deliveryTime, printingSpec, categoryLink } = product;

  return (
    <article className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-brand-gold/40 transition-all duration-200 flex flex-col h-full">
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="font-heading font-bold text-lg text-brand-black mb-2">{title}</h3>
        <div className="aspect-[4/3] bg-gray-100 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
          {image ? (
            <img src={image} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="text-gray-400 flex flex-col items-center gap-1">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs">Product image</span>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-600 mb-1">{variant}</p>
        <p className="text-brand-black font-semibold mb-2">
          {copies} <span className="text-brand-red font-bold">› ₱ {price}</span>
        </p>
        <p className="text-sm text-gray-600 mb-1">{paperType}</p>
        <p className="text-sm text-gray-600 mb-1">{deliveryTime}</p>
        <p className="text-sm text-gray-600 mb-4">{printingSpec}</p>
        <a
          href={categoryLink || '#'}
          className="mt-auto inline-flex items-center gap-1 text-brand-red font-semibold hover:text-brand-red-dark transition-colors"
        >
          Get Started
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
        <a
          href={categoryLink || '#'}
          className="mt-2 text-sm text-gray-500 hover:text-brand-gold transition-colors"
        >
          View All ›
        </a>
      </div>
    </article>
  );
};

export default ProductCard;
