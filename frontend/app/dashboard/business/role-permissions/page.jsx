'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';

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

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
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
      const res = await fetch(`${API_URL}/api/admin/role-permissions`, {
        headers: HEADERS(token),
      });
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
        const res = await fetch(
          `${API_URL}/api/admin/role-permissions/${encodeURIComponent(role)}`,
          {
            method: 'PUT',
            headers: HEADERS(token),
            body: JSON.stringify({ permissions: updated }),
          }
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

  const gridTemplate = `minmax(176px, 1fr) repeat(${SECTIONS.length}, minmax(44px, 56px))`;

  const cellBorder = '1px solid var(--border)';

  return (
    <ErrorBoundary>
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1rem' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 className="page-title">Permissions</h1>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--gray)' }}>
          Configure section access per staff role
        </p>
      </header>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem',
          padding: '1rem' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton skeleton-row" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--red)',
            background: 'rgba(239, 68, 68, 0.08)',
            color: 'var(--red)',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'flex-start',
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchPermissions()}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--dark2)',
              color: 'var(--white)',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div style={{ overflowX: 'auto', marginBottom: '16px', WebkitOverflowScrolling: 'touch' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: gridTemplate,
                minWidth: `${280 + SECTIONS.length * 48}px`,
                border: cellBorder,
                borderRadius: '12px',
                overflow: 'hidden',
                background: 'var(--dark2)',
              }}
            >
              {/* Header row */}
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: cellBorder,
                  borderRight: cellBorder,
                  background: 'var(--dark)',
                  minHeight: '72px',
                }}
              />
              {SECTIONS.map((section) => (
                <div
                  key={section.key}
                  style={{
                    padding: '8px 4px',
                    borderBottom: cellBorder,
                    borderRight: cellBorder,
                    background: 'var(--dark)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    maxWidth: '60px',
                    margin: '0 auto',
                    width: '100%',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.7rem',
                      color: 'var(--gray)',
                      textAlign: 'center',
                      lineHeight: 1.2,
                      transform: 'rotate(-55deg)',
                      transformOrigin: 'center center',
                      whiteSpace: 'nowrap',
                      maxWidth: '60px',
                    }}
                  >
                    {section.label}
                  </span>
                </div>
              ))}

              {/* Role rows */}
              {STAFF_ROLES.map(({ value: role, label }, rowIdx) => {
                const row = permissionsData[role] || defaultRow();
                const isLastRow = rowIdx === STAFF_ROLES.length - 1;
                return (
                  <div
                    key={role}
                    style={{
                      display: 'contents',
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 16px',
                        borderBottom: isLastRow ? 'none' : cellBorder,
                        borderRight: cellBorder,
                        background: 'var(--dark2)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        gap: '6px',
                        minHeight: '56px',
                      }}
                    >
                      <span style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.875rem' }}>
                        {label}
                      </span>
                      <div style={{ fontSize: '0.7rem', minHeight: '1rem' }}>
                        {saving[role] && (
                          <span style={{ color: 'var(--gold)' }}>Saving...</span>
                        )}
                        {!saving[role] && saveSuccess[role] && (
                          <span style={{ color: 'var(--green)' }}>Saved</span>
                        )}
                        {!saving[role] && saveError[role] && (
                          <span style={{ color: 'var(--red)' }}>{saveError[role]}</span>
                        )}
                      </div>
                    </div>
                    {SECTIONS.map((section) => {
                      const checked = !!row[section.key];
                      const disabled = section.key === 'dashboard';
                      return (
                        <div
                          key={`${role}-${section.key}`}
                          style={{
                            padding: '8px',
                            borderBottom: isLastRow ? 'none' : cellBorder,
                            borderRight: cellBorder,
                            background: rowIdx % 2 === 0 ? 'var(--dark2)' : 'rgba(255,255,255,0.02)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            aria-disabled={disabled}
                            disabled={disabled}
                            onClick={() => handleToggle(role, section.key)}
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              border: checked ? 'none' : '1px solid var(--border)',
                              background: checked ? '#D4A843' : 'var(--dark)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              padding: 0,
                              opacity: disabled ? 0.85 : 1,
                              flexShrink: 0,
                            }}
                          >
                            {checked && <CheckIcon />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--gray)', lineHeight: 1.5 }}>
            Administrator and Owner have full access to all sections.
          </p>
        </>
      )}
    </div>
    </ErrorBoundary>
  );
}
