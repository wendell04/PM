import React from 'react';

const services = [
  'Painting Crafts',
  'Digital Products',
  'Souvenirs',
  'Corporate Giveaways',
  'Personalize Gift Item',
  'T-Shirt Printing',
  'Printing Supplies',
];

const ServicesSection = () => {
  return (
    <section id="services" className="py-12 lg:py-16 bg-gray-50 border-y border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="font-heading font-bold text-2xl sm:text-3xl text-brand-black mb-8 text-center">
          Service <span className="text-brand-gold">Offered</span>
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {services.map((name) => (
            <li key={name}>
              <a
                href={`#${name.toLowerCase().replace(/\s+/g, '-')}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-white border border-gray-200 hover:border-brand-gold hover:shadow-md transition-all group"
              >
                <span className="w-2 h-2 rounded-full bg-brand-red shrink-0 group-hover:bg-brand-gold transition-colors" />
                <span className="font-medium text-brand-black group-hover:text-brand-red transition-colors">
                  {name}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default ServicesSection;
