import React, {useState} from 'react';
import './CustomerHome.css';

const CustomerHome = ({onBackToLanding}) => {
    const [cart, setCart] = useState([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');

    const products = [
        { id: 1, name: 'Silk Screen Printing', price: 299, image: '🖨️', category: 'apparel', desc: 'Bulk t-shirt printing, vibrant colors', minOrder: 50 },
        { id: 2, name: 'Digital Printing Shirt', price: 349, image: '👕', category: 'apparel', desc: 'Full-color DTG, small quantities', minOrder: 1 },
        { id: 3, name: 'Keychains', price: 45, image: '🔑', category: 'merchandise', desc: 'Custom printed acrylic keychains', minOrder: 50 },
        { id: 4, name: 'Eco Bags', price: 129, image: '🛍️', category: 'merchandise', desc: 'Canvas eco bags, full-color print', minOrder: 50 },
        { id: 5, name: 'Folded Fan Printing', price: 35, image: '🪭', category: 'merchandise', desc: 'Personalized folding fans', minOrder: 100 },
        { id: 6, name: 'Business Cards', price: 199, image: '💼', category: 'corporate', desc: '100pcs, premium cardstock', minOrder: 100 },
        { id: 7, name: 'Paper Bags', price: 55, image: '📄', category: 'merchandise', desc: 'Custom printed paper bags', minOrder: 100 },
        { id: 8, name: 'Kraft Bag', price: 65, image: '🎒', category: 'merchandise', desc: 'Eco-friendly kraft paper bags', minOrder: 100 },
        { id: 9, name: 'Mugs', price: 149, image: '☕', category: 'drinkware', desc: 'Full-wrap sublimation printing', minOrder: 12 },
        { id: 10, name: 'Tumbler', price: 249, image: '🥤', category: 'drinkware', desc: 'Stainless steel, 500ml', minOrder: 24 },
        { id: 11, name: 'Sticker Labels', price: 89, image: '🏷️', category: 'labels', desc: 'Die-cut vinyl stickers', minOrder: 100 },
        { id: 12, name: 'Giveaways', price: 199, image: '🎁', category: 'gifts', desc: 'Customized giveaway packages', minOrder: 50 },
        { id: 13, name: 'Birthday Invitations', price: 120, image: '🎉', category: 'stationery', desc: 'Full-color printed invitations', minOrder: 50 },
        { id: 14, name: 'Personalized Calendars', price: 299, image: '📅', category: 'gifts', desc: '13-page wall calendar', minOrder: 1 },
    ];

    const categories = [
        { name: 'Apparel', icon: '👕', filter: 'apparel', color: '#c41e3a' },
        { name: 'Merchandise', icon: '🛍️', filter: 'merchandise', color: '#27ae60' },
        { name: 'Drinkware', icon: '☕', filter: 'drinkware', color: '#d4a843' },
        { name: 'Corporate', icon: '💼', filter: 'corporate', color: '#2c5aa0' },
        { name: 'Labels & Stickers', icon: '🏷️', filter: 'labels', color: '#9b59b6' },
        { name: 'Stationery', icon: '📝', filter: 'stationery', color: '#e67e22' },
        { name: 'Gifts', icon: '🎁', filter: 'gifts', color: '#e74c3c' },
        { name: 'All Products', icon: '📦', filter: 'all', color: '#555' },
    ];

    const promoSlides = [
        { title: 'Bulk Order Discounts', subtitle: 'Save up to 30% on orders of 100+ items', bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
        { title: 'Same Day Printing', subtitle: 'Rush orders available for select products', bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
        { title: 'Free Design Assistance', subtitle: 'Our team will help bring your ideas to life', bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
    ];

    const [currentSlide, setCurrentSlide] = useState(0);

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
    
    const filteredProducts = products 
        .filter(p => selectedCategory === 'all' || p.category === selectedCategory)
        .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

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

            { /* PROMO BANNER CAROUSEL */ }
            <section className="promo-carousel">
                <div className="carousel-container">
                    {promoSlides.map((slide, i) => (
                        <div
                            key={i} 
                            className={`carousel-slide ${i === currentSlide ? 'active' : ''}`} 
                            style={{background: slide.bg}}
                        >
                        <h2>{slide.title}</h2>
                        <p>{slide.subtitle}</p>
                        </div>
                    ))}
                    <div className="carousel-dots">
                        {promoSlides.map((_, i) => (
                            <button
                                key={i}
                                className={`dot ${i === currentSlide ? 'active' : ''}`}
                                onClick={() => setCurrentSlide(i)}                            
                            />
                        ))}
                    </div>
                </div>
            </section>

            { /* QUICK SERVICES */ }
            <section className="quick-services">
                <div className="page-container">
                    <div className="service-row">
                        <div className="service-item">
                            <div className="serive-icon">⚡</div>
                            <div className="service-text">
                                <strong>Rush Orders</strong>
                                <span>Same-day available</span>
                            </div>
                        </div>
                        <div className="service-item">
                            <div className="service-icon">✅</div>
                            <div className="service-text">
                                <strong>Proof Before Print</strong>
                                <span>100% satisfaction</span>
                            </div>
                        </div>
                        <div className="service-item">
                            <div className="service-icon">💰</div>
                            <div className="service-text">
                                <strong>Best Prices</strong>
                                <span>Bulk discounts</span>
                            </div>
                        </div>
                        <div className="service-item">
                            <div className="service-icon">🎨</div>
                            <div className="service-text">
                                <strong>Free Design</strong>
                                <span>We help you create</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

             { /* CATEGORIES */}
             <section className="categories-section">
                <div className="page-container">
                    <h2 className="section-title">Browse by Category</h2>
                    <div className="categories-grid">
                        {categories.map((cat, i) => (
                            <div
                                className={`category-card ${selectedCategory === cat.filter ? 'active' : ''}`}
                                key={i}
                                onClick={() => setSelectedCategory(cat.filter)}
                            >
                            <div className="category-icon" style={{background: cat.color}}>{cat.icon}</div>
                            <span>{cat.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
             </section>

             { /* PRODUCT */}
             <section className="products-section">
                <div className="page-container">
                    <div className="products-header">
                        <h2 className="section-title">
                            {selectedCategory === 'all' ? 'All products' : categories.find(c => c.filter === selectedCategory)?.name}
                        </h2>
                        <span className="product-count">{filteredProducts.length} items</span>
                    </div>
                    <div className="products-grid">
                        {filteredProducts.map(product => (
                            <div className="product-card" key={product.id}>
                                <div className="product-image">
                                    {product.image}
                                    {product.minOrder > 1 && (
                                        <span className="min-order-badge">Min: {product.minOrder} pcs</span>
                        )}
                    </div>
                    <div className="product-info">
                        <h3>{product.name}</h3>
                        <p className="product-desc">{product.desc}</p>
                        <div className="product-footer">
                            <div>
                                <span className="product-price">₱{product.price}</span>
                                {product.minOrder > 1 && <span className="price-unit">/unit</span>}
                            </div>
                            <button className="btn-add-cart" onClick={() => addToCart(product)}>
                                + Add
                            </button>
                        </div>
                    </div>
                </div>
                ))}
            </div>
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
