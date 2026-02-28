import React, {useState, useEffect} from 'react';
import './CustomerHome.css';

const CustomerHome = ({onBackToLanding}) => {
    const [cart, setCart] = useState([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [products, setProducts] = useState([]);
    const [dynamicCategories, setDynamicCategories] = useState([]);

    // Load products from localStorage (will be empty initially) eto LocalStorage ang gamit temporarily
    useEffect(() => {
        const storedProducts = localStorage.getItem('products');
        if (storedProducts) {
            const parsed = JSON.parse(storedProducts);
            setProducts(parsed);
            
            // Extract unique categories from products
            const uniqueCats = [...new Set(parsed.map(p => p.category).filter(Boolean))];
            setDynamicCategories(uniqueCats.map(cat => ({
                name: cat,
                filter: cat,
                color: '#d4a843'
            })));
        } else {
            setProducts([]);
            setDynamicCategories([]);
        }
    }, []);

    const staticCategories = [
        { name: 'All Products', filter: 'all', color: '#555' },
    ];
    
    const allCategories = [...staticCategories, ...dynamicCategories];

    const addToCart = (product) => {
        const existing = cart.find(item => item.id === product.id);
        if(existing) {
            setCart(cart.map(item =>
                item.id === product.id ? {...item, quantity: item.quantity + 1} : item
            ));
        } else {
            setCart([...cart, {...product, quantity: 1}]);
        }
    };

    const removeFromCart = (productId) => {
        setCart(cart.filter(item => item.id !== productId));
    }

    const updateQuantity = (productId, newQuantity) => {
        if(newQuantity === 0) {
            removeFromCart(productId);
        } else {
            setCart(cart.map(item =>
                item.id === productId ? {...item, quantity: newQuantity} : item
            ));
        }
    };

    const getTotalPrice = () => {
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    };

    const getTotalItems = () => {
        return cart.reduce((sum, item) => sum + item.quantity, 0);
    };

    // ✅ FIX 2: Kinukuha ang min at max price mula sa tiers[] ng product
    // (localStorage structure — tiers[].prices object)
    const getPriceRange = (product) => {
        if (product.priceType === 'inquiry') return null;
        if (!product.tiers?.length) return '—';
        const allPrices = product.tiers
            .flatMap(t => Object.values(t.prices))
            .map(p => parseFloat(p))
            .filter(p => p > 0);
        if (!allPrices.length) return '—';
        const min = Math.min(...allPrices);
        const max = Math.max(...allPrices);
        return min === max ? `₱${min}` : `₱${min} – ₱${max}`;
    };
    
    const filteredProducts = products
        .filter(p => selectedCategory === 'all' || p.category === selectedCategory)
        .filter(p => (p.productName || p.name || '').toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="customer-home">

            { /* TOP NAV */}
            <nav className="top-nav">
                <div className="top-nav-container">
                    <div className="nav-brand" onClick={onBackToLanding} style={{cursor: 'pointer'}}>
                        <img src="/logos/PersonalizeMe logo.png" alt="logo" className="nav-brand-logo"/>
                        <div className="nav-brand-text">
                            <span className="brand-name">PERSONALIZE<span>ME</span></span>
                            <span className="brand-tagline">Printing Quality at Affordable Rates</span>
                        </div>
                    </div>
                    <div className="nav-search">
                        <input
                        type="text"
                        placeholder="Search for products, categories..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}/>
                    <button className="search-btn">🔍</button>
                    </div>
                    <div className="nav-actions">
                    <button className="nav-btn" title="Orders">📦</button>
                        <button className="nav-btn cart-btn" onClick={() => setCartOpen(!cartOpen)} title="Cart">🛒</button>
                        <button className="nav-btn btn-nav-login-home" title="Login">👤</button>
                        <button className="btn-nav-register-home" title="Register">Register</button>
                    </div>
                </div>
            </nav>

             { /* CATEGORIES */}
             <section className="categories-section">
                <div className="page-container">
                    <h2 className="section-title">Browse by Category</h2>
                    {allCategories.length > 1 ? (
                        <div className="categories-grid">
                            {allCategories.map((cat, i) => (
                                <div
                                    className={`category-card ${selectedCategory === cat.filter ? 'active' : ''}`}
                                    key={i}
                                    onClick={() => setSelectedCategory(cat.filter)}
                                >
                                <span>{cat.name}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: 'var(--gray)', textAlign: 'center' }}>
                            Categories will appear here when products are added.
                        </p>
                    )}
                </div>
             </section>

             { /* PRODUCT */}
             <section className="products-section">
                <div className="page-container">
                    <div className="products-header">
                        <h2 className="section-title">
                            {selectedCategory === 'all' ? 'All products' : allCategories.find(c => c.filter === selectedCategory)?.name}
                        </h2>
                        <span className="product-count">{filteredProducts.length} items</span>
                    </div>
                    
                    {products.length === 0 ? (
                        <div className="products-empty-state">
                            <h3 className="empty-state-title">No Products Yet</h3>
                            <p className="empty-state-text">
                                Products will appear here once they are added by the admin.
                            </p>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="products-empty-state">
                            <div className="empty-state-icon">🔍</div>
                            <h3 className="empty-state-title">No Products Found</h3>
                            <p className="empty-state-text">
                                Try adjusting your search or category filter.
                            </p>
                        </div>
                    ) : (
                    <div className="products-grid">
                        {filteredProducts.map(product => (
                            <div className="product-card" key={product.id}>
                                <div className="product-image">
                                    {/* FIX 3: product.images is an array */}
                                    {/* TODO (MongoDB): blob: URLs mawawala pag na-refresh — */}
                                    {/* palitan ng real file URL (Cloudinary/S3) pag may DB na */}
                                    {product.images?.length > 0 ? (
                                        <img src={product.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        null
                                    )}
                                    {product.minOrder > 1 && (
                                        <span className="min-order-badge">Min: {product.minOrder} pcs</span>
                                    )}
                                    {product.priceType === 'inquiry' && (
                                        null
                                    )}
                                </div>
                                <div className="product-info">
                                    <h3>{product.subCategoryName || product.productName || product.name || product.category}</h3>
                                    {product.printingType && (
                                        <p className="product-printing-type">{product.printingType}</p>
                                    )}
                                    <p className="product-desc">{product.description || product.desc}</p>
                                    <div className="product-footer">
                                        <div>
                                            {product.priceType === 'inquiry' ? (
                                                <span className="price-inquiry">For Inquiry</span>
                                            ) : (
                                                <span className="product-price">
                                                    {getPriceRange(product)}
                                                    <span className="price-unit"> per item</span>
                                                </span>
                                            )}
                                        </div>
                                        <button className="btn-add-cart" onClick={() => addToCart(product)}>
                                            + Add
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    )}
        </div>
    </section>

    { /* CART SIDEBAR */ }
    <div className={`cart-sidebar ${cartOpen ? 'open' : ''}`}>
        <div className="cart-header">
            <h3>Shopping Cart ({getTotalItems()})</h3>
            <button className="cart-close" onClick={() => setCartOpen(false)}>x</button>
        </div>
        <div className="cart-body">
            {cart.length === 0 ? (
                <div className="cart-empty">
                    <p className="empty-icon">🛒</p>
                    <p className="empty-text">Your cart is empty</p>
                    <p className="empty-subtext">Start adding products!</p>
                </div>
            ) : (
                cart.map(item => (
                    <div className="cart-item" key={item.id}>
                        <div className="cart-item-image">{item.image}</div>
                        <div className="cart-item-details">
                            <h4>{item.name}</h4>
                            <p className="cart-item-price">₱{item.price} each</p>
                            <div className="cart-item-controls">
                                <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>-</button>
                                <span>{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                            </div>
                        </div>
                        <div className="cart-item-right">
                            <button className="cart-item-remove" onClick={() => removeFromCart(item.id)}>🗑️</button>
                            <p className="cart-item-total">₱{item.price * item.quantity}</p>
                        </div>
                    </div>
                ))
            )}
        </div>

        {cart.length > 0 && (
            <div className="cart-footer">
                <div className="cart-total">
                    <span>Subtotal:</span>
                    <span className="total-price">₱{getTotalPrice()}</span>
                </div>
                <p className="cart-note">Shipping and taxes calculated at checkout</p>
                <button className="btn-checkout">Proceed to Checkout</button>
                <button className="btn-continue" onClick={() => setCartOpen(false)}>Continue Shopping</button>
            </div>
        )} 
    </div>

    {
    cartOpen && <div className="cart-overlay" onClick={() => setCartOpen(false)}></div>
    }

</div>

    );
};

export default CustomerHome;
