'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ProductDetail() {
  const router = useRouter();
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [designPosition, setDesignPosition] = useState({ x: 50, y: 50 }); // Position as percentage
  const [designSize, setDesignSize] = useState(50); // Size as percentage
  const [quantity, setQuantity] = useState(1);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleAddToCart = () => {
    // Mock add to cart functionality
    alert(`Added to cart: Custom T-Shirt with your design\nQuantity: ${quantity}`);
    router.push('/dashboard/customer');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6">
            <div className="flex flex-col md:flex-row">
              {/* Product Image Preview */}
              <div className="md:w-1/2 mb-6 md:mb-0 md:pr-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Customize Your Product</h2>
                
                {/* Product Preview Area */}
                <div className="relative bg-gray-100 rounded-lg p-8 flex items-center justify-center" style={{ minHeight: '400px' }}>
                  {/* Base product image - T-shirt in this example */}
                  <div className="bg-white w-64 h-80 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                    <div className="text-center">
                      <div className="mx-auto bg-gray-200 border-2 border-dashed rounded-xl w-16 h-16 mb-2" />
                      <p className="text-gray-500 text-sm">Product Preview</p>
                    </div>
                  </div>
                  
                  {/* Uploaded design overlay */}
                  {previewUrl && (
                    <div 
                      className="absolute"
                      style={{
                        left: `${designPosition.x}%`,
                        top: `${designPosition.y}%`,
                        width: `${designSize}%`,
                        height: 'auto',
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      <img 
                        src={previewUrl} 
                        alt="Uploaded design" 
                        className="max-w-full max-h-32 object-contain drop-shadow-lg"
                      />
                    </div>
                  )}
                </div>
                
                <div className="mt-4 text-center">
                  <p className="text-gray-600">Drag to position your design</p>
                </div>
              </div>
              
              {/* Customization Options */}
              <div className="md:w-1/2">
                <h1 className="text-3xl font-bold text-gray-900">Custom T-Shirt</h1>
                <div className="mt-2 flex items-center">
                  <p className="text-2xl font-semibold text-gray-900">₱299.00</p>
                  <div className="ml-4 flex items-center">
                    <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <p className="ml-1 text-sm text-gray-600">4.8 <span className="text-gray-400">(128 reviews)</span></p>
                  </div>
                </div>
                
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900">Add Your Design</h3>
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload Design/Image
                    </label>
                    <div className="flex items-center space-x-4">
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                          </svg>
                          <p className="mb-2 text-sm text-gray-500">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                        </div>
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*" 
                          onChange={handleImageUpload} 
                        />
                      </label>
                    </div>
                    
                    {previewUrl && (
                      <div className="mt-4">
                        <h4 className="text-md font-medium text-gray-900 mb-2">Design Controls</h4>
                        
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Position: ({Math.round(designPosition.x)}%, {Math.round(designPosition.y)}%)
                            </label>
                            <div className="flex space-x-4">
                              <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">X Position</label>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={designPosition.x}
                                  onChange={(e) => setDesignPosition({...designPosition, x: parseInt(e.target.value)})}
                                  className="w-full"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">Y Position</label>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={designPosition.y}
                                  onChange={(e) => setDesignPosition({...designPosition, y: parseInt(e.target.value)})}
                                  className="w-full"
                                />
                              </div>
                            </div>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Size: {designSize}%
                            </label>
                            <input
                              type="range"
                              min="10"
                              max="100"
                              value={designSize}
                              onChange={(e) => setDesignSize(parseInt(e.target.value))}
                              className="w-full"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900">Quantity</h3>
                  <div className="mt-2 flex items-center">
                    <button 
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="bg-gray-200 text-gray-700 px-4 py-2 rounded-l-md hover:bg-gray-300"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 text-center border-y border-gray-300 py-2"
                    />
                    <button 
                      onClick={() => setQuantity(quantity + 1)}
                      className="bg-gray-200 text-gray-700 px-4 py-2 rounded-r-md hover:bg-gray-300"
                    >
                      +
                    </button>
                  </div>
                </div>
                
                <div className="mt-8">
                  <button
                    onClick={handleAddToCart}
                    disabled={!selectedImage}
                    className={`w-full py-3 px-6 rounded-md text-white font-medium ${
                      selectedImage 
                        ? 'bg-blue-600 hover:bg-blue-700' 
                        : 'bg-gray-400 cursor-not-allowed'
                    } transition`}
                  >
                    {selectedImage ? 'Add to Cart' : 'Upload Design First'}
                  </button>
                  
                  <button
                    onClick={() => router.back()}
                    className="w-full mt-3 py-3 px-6 rounded-md text-gray-700 font-medium bg-gray-200 hover:bg-gray-300 transition"
                  >
                    Back to Products
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Product Details Section */}
        <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Product Details</h2>
            <div className="prose prose-sm max-w-none">
              <ul className="space-y-2">
                <li className="flex">
                  <span className="font-medium w-32 text-gray-700">Material:</span>
                  <span className="text-gray-600">100% Cotton Premium Fabric</span>
                </li>
                <li className="flex">
                  <span className="font-medium w-32 text-gray-700">Printing:</span>
                  <span className="text-gray-600">High-quality digital printing</span>
                </li>
                <li className="flex">
                  <span className="font-medium w-32 text-gray-700">Care:</span>
                  <span className="text-gray-600">Machine wash cold, tumble dry low</span>
                </li>
                <li className="flex">
                  <span className="font-medium w-32 text-gray-700">Sizes:</span>
                  <span className="text-gray-600">S, M, L, XL, XXL</span>
                </li>
              </ul>
              
              <div className="mt-4">
                <h3 className="font-medium text-gray-900">Description</h3>
                <p className="text-gray-600 mt-1">
                  Our premium custom t-shirts are made from high-quality cotton fabric for ultimate comfort. 
                  The printing process ensures vibrant colors that last wash after wash. Perfect for personal 
                  use or as gifts for friends and family.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}