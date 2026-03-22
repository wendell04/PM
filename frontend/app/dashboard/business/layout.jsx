'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import './admin-dashboard.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function BusinessDashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, currentUser, updateUser } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  
  // Profile form state
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    address: '',
    businessName: '',
    businessType: '',
    taxId: '',
    website: '',
    bio: '',
  });

  const [activeTab, setActiveTab] = useState('personal');

  useEffect(() => {
    if (currentUser) {
      setProfileForm({
        firstName: currentUser.firstName || '',
        lastName: currentUser.lastName || '',
        email: currentUser.email || '',
        phoneNumber: currentUser.phoneNumber || '',
        address: currentUser.address || '',
        businessName: currentUser.businessName || '',
        businessType: currentUser.businessType || '',
        taxId: currentUser.taxId || '',
        website: currentUser.website || '',
        bio: currentUser.bio || '',
      });
    }
  }, [currentUser]);

  const handleLogout = async () => {
    await logout();
    sessionStorage.setItem('justLoggedOut', 'true');
    router.replace('/');
  };

  const handleProfileChange = (field, value) => {
    setProfileForm(prev => ({ ...prev, [field]: value }));
    setSaveError('');
  };

  const handleSaveProfile = async () => {
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      setSaveError('First name and last name are required');
      return;
    }
    if (!profileForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.email)) {
      setSaveError('Please enter a valid email address');
      return;
    }
    if (!profileForm.phoneNumber.trim()) {
      setSaveError('Phone number is required');
      return;
    }
    if (!profileForm.address.trim()) {
      setSaveError('Address is required');
      return;
    }

    setIsSaving(true);
    setSaveError('');
    
    try {
      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
      const response = await fetchWithTimeout(`${API_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: profileForm.firstName.trim(),
          lastName: profileForm.lastName.trim(),
          email: profileForm.email.trim(),
          phoneNumber: profileForm.phoneNumber.trim(),
          address: profileForm.address.trim(),
        }),
      }, 15000);
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update profile');
      }
      
      // Update local storage with new user data
      if (data.user) {
        updateUser(data.user);
      }
      
      setSaveSuccess('Profile updated successfully!');
      setTimeout(() => {
        setSaveSuccess('');
        setProfileModalOpen(false);
      }, 1500);
      
    } catch (err) {
      setSaveError(err.message || 'An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  const [expandedItems, setExpandedItems] = useState(['Product CMS']);

  const navItems = [
    {
      name: 'Product CMS',
      children: [
        { name: 'Add Products', href: '/dashboard/business/products/add' },
        { name: 'Product List', href: '/dashboard/business/products' },
        { name: 'Storefront Banners', href: '/dashboard/business/banners' },
      ],
    },
    { name: 'Orders', href: '/dashboard/business/orders' },
    { name: 'Inventory', href: '/dashboard/business/inventory' },
    { name: 'Sales', href: '/dashboard/business/sales' },
    { name: 'Reports', href: '/dashboard/business/reports' },
  ];

  const toggleExpanded = (itemName) => {
    setExpandedItems(prev =>
      prev.includes(itemName)
        ? prev.filter(name => name !== itemName)
        : [...prev, itemName]
    );
  };

  const isChildActive = (children) => {
    return children.some(child => pathname === child.href);
  };

  return (
    <div className="admin-dashboard-wrapper">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <Link href="/" className="sidebar-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/PersonalizeMe logo.png" alt="Personalize Me Prints" className="sidebar-logo-img" />
            <div className="sidebar-logo-text">
              PERSONALIZE <span>ME</span><br />PRINTS
            </div>
          </Link>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            if (item.children) {
              const isExpanded = expandedItems.includes(item.name);
              const hasActiveChild = isChildActive(item.children);

              return (
                <div key={item.name} className="sidebar-nav-group">
                  <button
                    type="button"
                    className={`sidebar-nav-parent ${hasActiveChild ? 'active' : ''}`}
                    onClick={() => toggleExpanded(item.name)}
                  >
                    <span className="nav-text">{item.name}</span>
                    <svg
                      className={`nav-chevron ${isExpanded ? 'rotated' : ''}`}
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  <div className={`sidebar-nav-children ${isExpanded ? 'expanded' : ''}`}>
                    {item.children.map((child) => (
                      <Link
                        key={child.name}
                        href={child.href}
                        className={`sidebar-nav-child ${pathname === child.href ? 'active' : ''}`}
                        onClick={() => setSidebarOpen(false)}
                      >
                        <span className="nav-text">{child.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`sidebar-nav-item ${pathname === item.href ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="nav-text">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer" style={{ position: 'relative' }}>
          <div className="user-info" onClick={(e) => { e.stopPropagation(); setUserMenuOpen(!userMenuOpen); }} style={{ cursor: 'pointer' }}>
            <div className="user-avatar">
              {currentUser?.firstName?.charAt(0)?.toUpperCase() || 'B'}
            </div>
            <div className="user-details">
              <div className="user-name">{currentUser?.firstName || 'Business Owner'}</div>
              <div className="user-role">Business Owner</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 'auto' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          {userMenuOpen && (
            <>
              <div className="user-menu-backdrop" onClick={() => setUserMenuOpen(false)} />
              <div className="user-menu-dropdown" style={{ position: 'fixed', bottom: '90px', left: '12px', width: '240px', zIndex: 1001 }}>
                <button className="user-menu-item" onClick={() => { setProfileModalOpen(true); setUserMenuOpen(false); }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  Profile Settings
                </button>
                <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0.5rem' }} />
                <button className="user-menu-item logout" onClick={handleLogout}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="admin-main-content">
        {/* Top bar */}
        <header className="admin-top-bar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div className="top-bar-right">
            <div className="notification-btn">
              <span>🔔</span>
              <span className="notification-badge">3</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="admin-page-content">
          {children}
        </main>
      </div>

      {/* Profile Modal */}
      {profileModalOpen && (
        <div className="profile-modal-overlay" onClick={() => setProfileModalOpen(false)}>
          <div className="profile-modal" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="profile-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="user-avatar" style={{ width: '48px', height: '48px', fontSize: '1.2rem' }}>
                  {currentUser?.firstName?.charAt(0)?.toUpperCase() || 'B'}
                </div>
                <div>
                  <h2>{currentUser?.firstName || 'Business'} {currentUser?.lastName || 'Owner'}</h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>{currentUser?.email}</p>
                </div>
              </div>
              <button className="profile-modal-close" onClick={() => setProfileModalOpen(false)}>✕</button>
            </div>
            
            {/* Tabs */}
            <div className="profile-tabs">
              <button 
                className={`profile-tab ${activeTab === 'personal' ? 'active' : ''}`}
                onClick={() => setActiveTab('personal')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                Personal
              </button>
              <button 
                className={`profile-tab ${activeTab === 'business' ? 'active' : ''}`}
                onClick={() => setActiveTab('business')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                </svg>
                Business
              </button>
              <button 
                className={`profile-tab ${activeTab === 'security' ? 'active' : ''}`}
                onClick={() => setActiveTab('security')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Security
              </button>
            </div>

            <div className="profile-modal-body">
              {saveSuccess && (
                <div className="profile-success-message">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  {saveSuccess}
                </div>
              )}
              
              {saveError && (
                <div className="profile-error-message">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {saveError}
                </div>
              )}

              {/* Personal Info Tab */}
              {activeTab === 'personal' && (
                <div className="profile-form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="profile-form-field">
                    <label>First Name <span className="required">*</span></label>
                    <input
                      type="text"
                      value={profileForm.firstName}
                      onChange={e => handleProfileChange('firstName', e.target.value)}
                      placeholder="Juan"
                    />
                  </div>
                  
                  <div className="profile-form-field">
                    <label>Last Name <span className="required">*</span></label>
                    <input
                      type="text"
                      value={profileForm.lastName}
                      onChange={e => handleProfileChange('lastName', e.target.value)}
                      placeholder="Dela Cruz"
                    />
                  </div>
                  
                  <div className="profile-form-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Email <span className="required">*</span></label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={e => handleProfileChange('email', e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  
                  <div className="profile-form-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Phone <span className="required">*</span></label>
                    <input
                      type="tel"
                      value={profileForm.phoneNumber}
                      onChange={e => handleProfileChange('phoneNumber', e.target.value)}
                      placeholder="+63 912 345 6789"
                    />
                  </div>
                  
                  <div className="profile-form-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Address <span className="required">*</span></label>
                    <input
                      type="text"
                      value={profileForm.address}
                      onChange={e => handleProfileChange('address', e.target.value)}
                      placeholder="123 Main Street"
                    />
                  </div>
                </div>
              )}

              {/* Business Info Tab */}
              {activeTab === 'business' && (
                <div className="profile-form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="profile-form-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Business Name</label>
                    <input
                      type="text"
                      value={profileForm.businessName}
                      onChange={e => handleProfileChange('businessName', e.target.value)}
                      placeholder="Personalize Me Prints"
                    />
                  </div>
                  
                  <div className="profile-form-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Business Type</label>
                    <select
                      value={profileForm.businessType}
                      onChange={e => handleProfileChange('businessType', e.target.value)}
                      style={{ 
                        background: 'var(--dark2)', 
                        border: '1px solid var(--border)', 
                        borderRadius: '8px', 
                        padding: '0.75rem 0.875rem', 
                        color: 'var(--white)', 
                        fontSize: '0.875rem',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Select business type</option>
                      <option value="sole-proprietorship">Sole Proprietorship</option>
                      <option value="partnership">Partnership</option>
                      <option value="corporation">Corporation</option>
                      <option value="llc">LLC</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  
                  <div className="profile-form-field">
                    <label>Tax ID / TIN</label>
                    <input
                      type="text"
                      value={profileForm.taxId}
                      onChange={e => handleProfileChange('taxId', e.target.value)}
                      placeholder="000-000-000"
                      maxLength={12}
                    />
                  </div>
                  
                  <div className="profile-form-field">
                    <label>Website</label>
                    <input
                      type="url"
                      value={profileForm.website}
                      onChange={e => handleProfileChange('website', e.target.value)}
                      placeholder="https://yourstore.com"
                    />
                  </div>
                  
                  <div className="profile-form-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Business Bio</label>
                    <textarea
                      value={profileForm.bio}
                      onChange={e => handleProfileChange('bio', e.target.value)}
                      placeholder="Tell customers about your business..."
                      rows={4}
                    />
                  </div>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ padding: '1rem', background: 'rgba(212, 168, 67, 0.1)', borderRadius: '8px', border: '1px solid rgba(212, 168, 67, 0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                      <strong style={{ color: '#d4a843' }}>Password Security</strong>
                    </div>
                    <p style={{ fontSize: '0.85rem', opacity: 0.8, margin: 0 }}>
                      Your password is securely encrypted. Change it regularly to keep your account safe.
                    </p>
                  </div>
                  
                  <div className="profile-form-field">
                    <label>Current Password</label>
                    <input type="password" placeholder="Enter current password" />
                  </div>
                  
                  <div className="profile-form-field">
                    <label>New Password</label>
                    <input type="password" placeholder="Enter new password" />
                  </div>
                  
                  <div className="profile-form-field">
                    <label>Confirm New Password</label>
                    <input type="password" placeholder="Confirm new password" />
                  </div>
                  
                  <button className="btn-primary" style={{ marginTop: '0.5rem', width: 'fit-content' }}>
                    Update Password
                  </button>
                </div>
              )}
            </div>
            
            <div className="profile-modal-footer">
              <button className="profile-cancel-btn" onClick={() => setProfileModalOpen(false)}>
                Cancel
              </button>
              <button className="profile-save-btn" onClick={handleSaveProfile} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <span className="spinner"></span>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/>
                      <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}