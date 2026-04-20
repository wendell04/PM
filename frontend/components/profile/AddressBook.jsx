'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function AddressBook() {
  // Get auth token
  const { token } = useAuth();

  // State
  const [addresses, setAddresses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    label: '',
    house_number: '',
    street: '',
    subdivision: '',
    barangay: '',
    city: '',
    province: '',
    zip: '',
    phone: '',
    is_default: false,
  });

  // Form validation errors
  const [formErrors, setFormErrors] = useState({});

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState(null);

  // Fetch addresses on mount
  useEffect(() => {
    fetchAddresses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const fetchAddresses = async () => {
    if (!token) return; // Guard: wait for token to be available
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/addresses`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch addresses');
      setAddresses(data.addresses || []);
    } catch (err) {
      setError(err.message || 'Failed to load addresses');
    } finally {
      setIsLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    // label is optional — no validation required
    if (!formData.house_number.trim()) errors.house_number = 'House/Unit No. is required';
    if (!formData.street.trim()) errors.street = 'Street is required';
    if (!formData.barangay.trim()) errors.barangay = 'Barangay is required';
    if (!formData.city.trim()) errors.city = 'City is required';
    if (!formData.province.trim()) errors.province = 'Province is required';
    if (!formData.zip.trim()) errors.zip = 'ZIP Code is required';
    if (!formData.phone.trim()) errors.phone = 'Phone is required';
    // subdivision is optional - no validation
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user types
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const url = editingAddress
        ? `${API_URL}/api/addresses/${editingAddress.id}`
        : `${API_URL}/api/addresses`;
      const method = editingAddress ? 'PUT' : 'POST';

      const res = await fetchWithTimeout(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || (editingAddress ? 'Failed to update address' : 'Failed to add address'));

      setAddresses(data.addresses || []);
      setSuccessMsg(editingAddress ? 'Address updated successfully!' : 'Address added successfully!');
      resetForm();
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (address) => {
    setEditingAddress(address);
    setFormData({
      label: address.label || '',
      house_number: address.house_number || '',
      street: address.street || '',
      subdivision: address.subdivision || '',
      barangay: address.barangay || '',
      city: address.city || '',
      province: address.province || '',
      zip: address.zip || '',
      phone: address.phone || '',
      is_default: address.is_default || false,
    });
    setShowForm(true);
    setFormErrors({});
    setError(null);
  };

  const handleDelete = async (id) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetchWithTimeout(`${API_URL}/api/addresses/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete address');

      setAddresses(data.addresses || []);
      setSuccessMsg('Address deleted successfully!');
      setDeletingId(null);
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefault = async (id) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetchWithTimeout(`${API_URL}/api/addresses/${id}/default`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to set default address');

      setAddresses(data.addresses || []);
      setSuccessMsg('Default address updated!');
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      label: '',
      house_number: '',
      street: '',
      subdivision: '',
      barangay: '',
      city: '',
      province: '',
      zip: '',
      phone: '',
      is_default: false,
    });
    setEditingAddress(null);
    setShowForm(false);
    setFormErrors({});
  };

  const openAddForm = () => {
    resetForm();
    setShowForm(true);
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              padding: '1.25rem',
              background: 'var(--dark)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          >
            <div style={{ height: '18px', background: 'var(--dark3)', borderRadius: '4px', width: '40%', marginBottom: '0.75rem' }} />
            <div style={{ height: '14px', background: 'var(--dark3)', borderRadius: '4px', width: '70%', marginBottom: '0.5rem' }} />
            <div style={{ height: '14px', background: 'var(--dark3)', borderRadius: '4px', width: '50%' }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--white)', fontWeight: 600 }}>
          Saved Addresses
        </h3>
        {!showForm && (
          <button
            onClick={openAddForm}
            style={{
              padding: '0.625rem 1.25rem',
              background: 'var(--gold)',
              border: 'none',
              borderRadius: '8px',
              color: 'var(--black)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Address
          </button>
        )}
      </div>

      {/* Success Message */}
      {successMsg && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '8px',
            color: 'var(--green)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          {successMsg}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: 'var(--red)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={fetchAddresses}
            style={{
              padding: '0.4rem 0.75rem',
              background: 'transparent',
              border: '1px solid var(--gold)',
              borderRadius: '6px',
              color: 'var(--gold)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '1.25rem',
            background: 'var(--dark)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* ROW 1: Label | Phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                Label <span style={{ color: 'var(--gray)', fontSize: '0.7rem' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => handleInputChange('label', e.target.value)}
                placeholder="e.g. Home, Office"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  background: 'var(--dark2)',
                  border: `1px solid ${formErrors.label ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              {formErrors.label && (
                <span style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: '0.25rem', display: 'block' }}>
                  {formErrors.label}
                </span>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                Phone <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="e.g. 09XXXXXXXXX"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  background: 'var(--dark2)',
                  border: `1px solid ${formErrors.phone ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              {formErrors.phone && (
                <span style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: '0.25rem', display: 'block' }}>
                  {formErrors.phone}
                </span>
              )}
            </div>
          </div>

          {/* ROW 2: House/Unit No. | Subdivision (optional) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                House/Unit No. <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.house_number}
                onChange={(e) => handleInputChange('house_number', e.target.value)}
                placeholder="e.g. Blk 2 Lot 24"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  background: 'var(--dark2)',
                  border: `1px solid ${formErrors.house_number ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              {formErrors.house_number && (
                <span style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: '0.25rem', display: 'block' }}>
                  {formErrors.house_number}
                </span>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                Subdivision / Village <span style={{ color: 'var(--gray)', fontSize: '0.7rem' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={formData.subdivision}
                onChange={(e) => handleInputChange('subdivision', e.target.value)}
                placeholder="e.g. Greenville Subd."
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  background: 'var(--dark2)',
                  border: `1px solid ${formErrors.subdivision ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              {formErrors.subdivision && (
                <span style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: '0.25rem', display: 'block' }}>
                  {formErrors.subdivision}
                </span>
              )}
            </div>
          </div>

          {/* ROW 3: Street (full width) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
              Street <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.street}
              onChange={(e) => handleInputChange('street', e.target.value)}
              placeholder="e.g. Rizal Avenue"
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                background: 'var(--dark2)',
                border: `1px solid ${formErrors.street ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: '8px',
                color: 'var(--white)',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
            {formErrors.street && (
              <span style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: '0.25rem', display: 'block' }}>
                {formErrors.street}
              </span>
            )}
          </div>

          {/* ROW 4: Barangay | City */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                Barangay <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.barangay}
                onChange={(e) => handleInputChange('barangay', e.target.value)}
                placeholder="e.g. Barangay 176"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  background: 'var(--dark2)',
                  border: `1px solid ${formErrors.barangay ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              {formErrors.barangay && (
                <span style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: '0.25rem', display: 'block' }}>
                  {formErrors.barangay}
                </span>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                City <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => handleInputChange('city', e.target.value)}
                placeholder="e.g. Caloocan City"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  background: 'var(--dark2)',
                  border: `1px solid ${formErrors.city ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              {formErrors.city && (
                <span style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: '0.25rem', display: 'block' }}>
                  {formErrors.city}
                </span>
              )}
            </div>
          </div>

          {/* ROW 5: Province | ZIP Code */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                Province <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.province}
                onChange={(e) => handleInputChange('province', e.target.value)}
                placeholder="e.g. Metro Manila"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  background: 'var(--dark2)',
                  border: `1px solid ${formErrors.province ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              {formErrors.province && (
                <span style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: '0.25rem', display: 'block' }}>
                  {formErrors.province}
                </span>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.4rem' }}>
                ZIP Code <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.zip}
                onChange={(e) => handleInputChange('zip', e.target.value)}
                placeholder="e.g. 1400"
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  background: 'var(--dark2)',
                  border: `1px solid ${formErrors.zip ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  color: 'var(--white)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
              {formErrors.zip && (
                <span style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: '0.25rem', display: 'block' }}>
                  {formErrors.zip}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
            <button
              type="button"
              onClick={resetForm}
              disabled={isSubmitting}
              style={{
                padding: '0.625rem 1.25rem',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--gray)',
                fontSize: '0.875rem',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '0.625rem 1.5rem',
                background: isSubmitting ? 'var(--dark3)' : 'var(--gold)',
                border: 'none',
                borderRadius: '8px',
                color: isSubmitting ? 'var(--gray)' : 'var(--black)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Saving...' : editingAddress ? 'Update Address' : 'Save Address'}
            </button>
          </div>
        </form>
      )}

      {/* Address List */}
      {!showForm && addresses.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            background: 'var(--dark)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--gray)"
            strokeWidth="1.5"
            style={{ marginBottom: '1rem' }}
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <div style={{ fontSize: '1rem', color: 'var(--white)', marginBottom: '0.5rem' }}>
            No saved addresses yet
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>
            Add one to get started
          </div>
        </div>
      )}

      {/* Address Cards */}
      {!showForm &&
        addresses.map((address) => (
          <div
            key={address.id}
            style={{
              padding: '1.25rem',
              background: 'var(--dark2)',
              borderRadius: '12px',
              border: `1px solid ${address.is_default ? 'var(--gold)' : 'var(--border)'}`,
              position: 'relative',
            }}
          >
            {/* Header with label and default badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
                  {address.label}
                </span>
                {address.is_default && (
                  <span
                    style={{
                      padding: '0.2rem 0.6rem',
                      background: 'var(--gold)',
                      color: 'var(--black)',
                      borderRadius: '999px',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Default
                  </span>
                )}
              </div>
            </div>

            {/* Address details */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--white)', marginBottom: '0.25rem' }}>
                {address.house_number} {address.street}
                {address.subdivision && <>, {address.subdivision}</>}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--white)', marginBottom: '0.25rem' }}>
                {address.barangay}, {address.city}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--white)', marginBottom: '0.25rem' }}>
                {address.province} {address.zip}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>{address.phone}</div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleEdit(address)}
                disabled={isSubmitting}
                style={{
                  padding: '0.5rem 0.875rem',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--gray)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.borderColor = 'var(--gold)';
                    e.currentTarget.style.color = 'var(--gold)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.color = 'var(--gray)';
                  }
                }}
              >
                Edit
              </button>

              {!address.is_default && (
                <button
                  onClick={() => handleSetDefault(address.id)}
                  disabled={isSubmitting}
                  style={{
                    padding: '0.5rem 0.875rem',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--gold)',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.background = 'var(--gold-subtle)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  Set as Default
                </button>
              )}

              <button
                onClick={() => setDeletingId(deletingId === address.id ? null : address.id)}
                disabled={isSubmitting}
                style={{
                  padding: '0.5rem 0.875rem',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: deletingId === address.id ? 'var(--red)' : 'var(--gray)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting && deletingId !== address.id) {
                    e.currentTarget.style.borderColor = 'var(--red)';
                    e.currentTarget.style.color = 'var(--red)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSubmitting && deletingId !== address.id) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.color = 'var(--gray)';
                  }
                }}
              >
                Delete
              </button>

              {/* Delete confirmation */}
              {deletingId === address.id && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginLeft: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                    Delete this address?
                  </span>
                  <button
                    onClick={() => handleDelete(address.id)}
                    disabled={isSubmitting}
                    style={{
                      padding: '0.35rem 0.625rem',
                      background: 'var(--red)',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'var(--white)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setDeletingId(null)}
                    disabled={isSubmitting}
                    style={{
                      padding: '0.35rem 0.625rem',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--gray)',
                      fontSize: '0.7rem',
                      fontWeight: 500,
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}
