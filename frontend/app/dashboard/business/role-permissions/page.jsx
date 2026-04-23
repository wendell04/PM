'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const STAFF_ROLES = [
  { value: 'salesRep', label: 'Sales Representative' },
  { value: 'productionOperator', label: 'Production Operator' },
  { value: 'qualityControl', label: 'Quality Control Officer' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'inventoryManager', label: 'Inventory Manager' },
];

const SECTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'orderRequests', label: 'Order Requests' },
  { key: 'orders', label: 'Orders' },
  { key: 'jobOrders', label: 'Job Orders' },
  { key: 'pos', label: 'Point of Sale' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'badOrders', label: 'Bad Orders' },
  { key: 'sales', label: 'Sales' },
  { key: 'reports', label: 'Reports' },
  { key: 'products', label: 'Products' },
  { key: 'banners', label: 'Banners' },
  { key: 'flashSales', label: 'Flash Sales' },
  { key: 'vouchers', label: 'Vouchers' },
  { key: 'auditLogs', label: 'Audit Logs' },
  { key: 'userManagement', label: 'User Management' },
  { key: 'rolePermissions', label: 'Role Permissions' },
];

const HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'ngrok-skip-browser-warning': '1',
});

function defaultRow() {
  const row = {};
  SECTIONS.forEach((s) => {
    row[s.key] = s.key === 'dashboard';
  });
  return row;
}

function mergeRolePermissions(apiRow) {
  const base = defaultRow();
  if (!apiRow || typeof apiRow !== 'object') return base;
  SECTIONS.forEach((s) => {
    if (typeof apiRow[s.key] === 'boolean') {
      base[s.key] = apiRow[s.key];
    }
  });
  base.dashboard = true;
  return base;
}

const SECTION_GROUPS = [
  { label: 'Operations', keys: ['orderRequests', 'orders', 'jobOrders', 'pos'] },
  { label: 'Inventory', keys: ['inventory', 'vendors', 'badOrders'] },
  { label: 'Analytics', keys: ['sales', 'reports'] },
  { label: 'Catalog', keys: ['products', 'banners', 'flashSales', 'vouchers'] },
  { label: 'Admin', keys: ['auditLogs', 'userManagement', 'rolePermissions'] },
];

function ToggleSwitch({ checked, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      style={{
        position: 'relative',
        width: '36px',
        height: '20px',
        borderRadius: '10px',
        background: disabled ? 'rgba(255,255,255,0.1)' : checked ? '#D4A843' : 'rgba(255,255,255,0.12)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0,
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: '2px',
        left: checked ? '18px' : '2px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

export default function RolePermissionsPage() {
  const router = useRouter();
  const { token, currentUser } = useAuth();

  const [permissionsData, setPermissionsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState({});
  const [saveError, setSaveError] = useState({});
  const [saveSuccess, setSaveSuccess] = useState({});
  const successTimersRef = useRef({});

  const isPrivilegedRole = (role) => role === 'admin' || role === 'owner';

  useEffect(() => {
    if (!currentUser) return;
    if (!isPrivilegedRole(currentUser.role)) {
      setLoading(false);
      router.replace('/dashboard/business/dashboardoverview');
    }
  }, [currentUser, router]);

  const fetchPermissions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/role-permissions`, {
        headers: HEADERS(token),
      }, 30000);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to load role permissions.');
      }
      const raw = data.data || {};
      const next = {};
      STAFF_ROLES.forEach(({ value }) => {
        next[value] = mergeRolePermissions(raw[value]);
      });
      setPermissionsData(next);
    } catch (err) {
      setError(err.message || 'Failed to load role permissions.');
      setPermissionsData({});
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!currentUser) return;
    if (!isPrivilegedRole(currentUser.role)) return;
    if (!token) {
      setLoading(false);
      setError('Missing authentication.');
      return;
    }
    fetchPermissions();
  }, [token, currentUser, fetchPermissions]);

  useEffect(() => {
    const timers = successTimersRef.current;
    return () => {
      Object.values(timers).forEach((id) => clearTimeout(id));
    };
  }, []);

  const clearSuccessTimer = (role) => {
    if (successTimersRef.current[role]) {
      clearTimeout(successTimersRef.current[role]);
      successTimersRef.current[role] = null;
    }
  };

  const handleToggle = (role, sectionKey) => {
    if (sectionKey === 'dashboard') return;
    if (!token) return;

    const prevSnapshot = { ...permissionsData[role] };
    const current = permissionsData[role] || defaultRow();
    const nextVal = !current[sectionKey];
    const updated = { ...current, [sectionKey]: nextVal, dashboard: true };

    setPermissionsData((prev) => ({ ...prev, [role]: updated }));
    setSaving((prev) => ({ ...prev, [role]: true }));
    setSaveError((prev) => ({ ...prev, [role]: null }));
    clearSuccessTimer(role);
    setSaveSuccess((prev) => ({ ...prev, [role]: false }));

    (async () => {
      try {
        const res = await fetchWithTimeout(
          `${API_URL}/api/admin/role-permissions/${encodeURIComponent(role)}`,
          {
            method: 'PUT',
            headers: HEADERS(token),
            body: JSON.stringify({ permissions: updated }),
          },
          30000
        );
        const data = await res.json();
        if (!res.ok) {
          const msg =
            data.message ||
            (data.errors && Object.values(data.errors).flat().join(' ')) ||
            'Save failed.';
          throw new Error(msg);
        }
        const serverPerms = data.data?.permissions;
        if (serverPerms && typeof serverPerms === 'object') {
          setPermissionsData((prev) => ({
            ...prev,
            [role]: mergeRolePermissions(serverPerms),
          }));
        }
        setSaveSuccess((prev) => ({ ...prev, [role]: true }));
        clearSuccessTimer(role);
        successTimersRef.current[role] = setTimeout(() => {
          setSaveSuccess((prev) => ({ ...prev, [role]: false }));
          successTimersRef.current[role] = null;
        }, 2000);
      } catch (err) {
        setPermissionsData((prev) => ({ ...prev, [role]: prevSnapshot }));
        setSaveError((prev) => ({ ...prev, [role]: err.message || 'Save failed.' }));
      } finally {
        setSaving((prev) => ({ ...prev, [role]: false }));
      }
    })();
  };

  if (currentUser && !isPrivilegedRole(currentUser.role)) {
    return null;
  }

  return (
    <ErrorBoundary>
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>
          Home › Admin › Role Permissions
        </div>
        <h1 className="page-title">Role Permissions</h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--gray)' }}>
          Control which sections each staff role can access. Dashboard access is always granted.
        </p>
      </header>

      {/* Admin/Owner notice */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.875rem 1rem', marginBottom: '1.5rem',
        background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)',
        borderRadius: '10px',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
        <span style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>
          <strong style={{ color: 'var(--gold)' }}>Administrator</strong> and <strong style={{ color: 'var(--gold)' }}>Owner</strong> roles have unrestricted access to all sections and cannot be configured here.
        </span>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: '120px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', animation: 'pulse 1.4s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div style={{
          padding: '1rem 1.25rem', borderRadius: '12px',
          border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)',
          color: '#ef4444', marginBottom: '1rem',
          display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: '0.9rem' }}>{error}</span>
          <button
            type="button"
            onClick={() => fetchPermissions()}
            style={{
              padding: '0.5rem 1rem', borderRadius: '8px',
              border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.12)',
              color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {STAFF_ROLES.map(({ value: role, label }) => {
            const row = permissionsData[role] || defaultRow();
            const enabledCount = SECTIONS.filter(s => s.key !== 'dashboard' && row[s.key]).length;
            const totalCount = SECTIONS.filter(s => s.key !== 'dashboard').length;
            return (
              <div
                key={role}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.03)',
                  overflow: 'hidden',
                }}
              >
                {/* Role header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '8px',
                      background: 'rgba(212,168,67,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--white)' }}>{label}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '1px' }}>
                        {enabledCount} of {totalCount} sections enabled
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {saving[role] && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--gold)', fontWeight: 600 }}>Saving...</span>
                    )}
                    {!saving[role] && saveSuccess[role] && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600 }}>Saved</span>
                    )}
                    {!saving[role] && saveError[role] && (
                      <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>{saveError[role]}</span>
                    )}
                    <div style={{
                      padding: '0.25rem 0.75rem', borderRadius: '999px',
                      background: enabledCount > 0 ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${enabledCount > 0 ? 'rgba(212,168,67,0.3)' : 'var(--border)'}`,
                      fontSize: '0.72rem', fontWeight: 700,
                      color: enabledCount > 0 ? 'var(--gold)' : 'var(--gray)',
                    }}>
                      {enabledCount}/{totalCount}
                    </div>
                  </div>
                </div>

                {/* Permission groups */}
                <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {SECTION_GROUPS.map((group) => (
                    <div key={group.label}>
                      <div style={{
                        fontSize: '0.68rem', fontWeight: 700, color: 'var(--gray)',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        marginBottom: '0.5rem',
                      }}>
                        {group.label}
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '0.5rem',
                      }}>
                        {group.keys.map((key) => {
                          const section = SECTIONS.find(s => s.key === key);
                          if (!section) return null;
                          const checked = !!row[key];
                          const disabled = key === 'dashboard';
                          return (
                            <div
                              key={key}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '8px',
                                background: checked ? 'rgba(212,168,67,0.06)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${checked ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.06)'}`,
                                transition: 'all 0.15s',
                              }}
                            >
                              <span style={{
                                fontSize: '0.82rem',
                                color: disabled ? 'var(--gray)' : checked ? 'var(--white)' : 'var(--gray)',
                                fontWeight: checked ? 600 : 400,
                              }}>
                                {section.label}
                              </span>
                              <ToggleSwitch
                                checked={checked}
                                disabled={disabled}
                                onChange={() => handleToggle(role, key)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Always-on dashboard row */}
                  <div>
                    <div style={{
                      fontSize: '0.68rem', fontWeight: 700, color: 'var(--gray)',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      marginBottom: '0.5rem',
                    }}>
                      Always On
                    </div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem', borderRadius: '8px',
                      background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)',
                      minWidth: '200px', gap: '2rem',
                    }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--gray)', fontWeight: 600 }}>Dashboard</span>
                      <ToggleSwitch checked={true} disabled={true} onChange={() => {}} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
