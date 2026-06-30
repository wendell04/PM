'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const SECTIONS = [
  { key: 'orderRequests', label: 'Order Requests' },
  { key: 'orders',        label: 'Orders' },
  { key: 'jobOrders',     label: 'Job Orders' },
  { key: 'pos',           label: 'Point of Sale' },
  { key: 'inventory',     label: 'Inventory' },
  { key: 'vendors',       label: 'Vendors' },
  { key: 'badOrders',     label: 'Bad Orders' },
  { key: 'sales',         label: 'Sales' },
  { key: 'reports',       label: 'Reports' },
  { key: 'products',      label: 'Products' },
  { key: 'banners',       label: 'Banners' },
  { key: 'flashSales',    label: 'Flash Sales' },
  { key: 'vouchers',      label: 'Vouchers' },
  { key: 'auditLogs',     label: 'Audit Logs' },
  { key: 'userManagement',label: 'User Management' },
  { key: 'rolePermissions',label: 'Role Permissions' },
];

const SECTION_GROUPS = [
  { label: 'Operations', keys: ['orderRequests', 'orders', 'jobOrders', 'pos'] },
  { label: 'Inventory',  keys: ['inventory', 'vendors', 'badOrders'] },
  { label: 'Analytics',  keys: ['sales', 'reports'] },
  { label: 'Catalog',    keys: ['products', 'banners', 'flashSales', 'vouchers'] },
  { label: 'Admin',      keys: ['auditLogs', 'userManagement', 'rolePermissions'] },
];

const HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'ngrok-skip-browser-warning': '1',
});

function defaultRow() {
  const row = { dashboard: true };
  SECTIONS.forEach((s) => { row[s.key] = false; });
  return row;
}

function mergePerms(apiRow) {
  const base = defaultRow();
  if (!apiRow || typeof apiRow !== 'object') return base;
  SECTIONS.forEach((s) => {
    if (typeof apiRow[s.key] === 'boolean') base[s.key] = apiRow[s.key];
  });
  base.dashboard = true;
  return base;
}

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
        width: '34px', height: '18px',
        borderRadius: '9px',
        background: disabled ? 'var(--dark3)' : checked ? '#D4A843' : 'var(--dark3)',
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
        left: checked ? '16px' : '2px',
        width: '14px', height: '14px',
        borderRadius: '50%',
        background: disabled ? 'var(--gray)' : 'var(--dark)',
        transition: 'left 0.18s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

export default function RolePermissionsPage() {
  const router = useRouter();
  const { token, currentUser } = useAuth();

  const [roles, setRoles] = useState([]);
  const [permissionsData, setPermissionsData] = useState({});
  const [staffByRole, setStaffByRole] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
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

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [permRes, staffRes] = await Promise.all([
        fetchWithTimeout(`${API_URL}/api/admin/role-permissions`, { headers: HEADERS(token) }, 30000),
        fetchWithTimeout(`${API_URL}/api/admin/staff`,            { headers: HEADERS(token) }, 30000),
      ]);
      const permData  = await permRes.json();
      const staffData = await staffRes.json();

      if (!permRes.ok) throw new Error(permData.message || 'Failed to load role permissions.');

      const raw = permData.data || {};
      const roleList = Object.entries(raw).map(([value, info]) => ({
        value,
        label: info.label || value,
      }));
      setRoles(roleList);

      const perms = {};
      roleList.forEach(({ value }) => {
        perms[value] = mergePerms(raw[value]?.permissions ?? raw[value]);
      });
      setPermissionsData(perms);

      if (staffRes.ok) {
        const grouped = {};
        (staffData.data || []).forEach((s) => {
          if (!grouped[s.role]) grouped[s.role] = [];
          grouped[s.role].push(s);
        });
        setStaffByRole(grouped);
      }
    } catch (err) {
      setError(err.message || 'Failed to load role permissions.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!currentUser || !isPrivilegedRole(currentUser.role) || !token) {
      if (token !== undefined) setLoading(false);
      return;
    }
    fetchData();
  }, [token, currentUser, fetchData]);

  useEffect(() => {
    const timers = successTimersRef.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  const handleToggle = (role, key) => {
    if (key === 'dashboard' || !token) return;
    const prev = { ...permissionsData[role] };
    const updated = { ...prev, [key]: !prev[key], dashboard: true };
    setPermissionsData((p) => ({ ...p, [role]: updated }));
    setSaving((p) => ({ ...p, [role]: true }));
    setSaveError((p) => ({ ...p, [role]: null }));
    if (successTimersRef.current[role]) clearTimeout(successTimersRef.current[role]);
    setSaveSuccess((p) => ({ ...p, [role]: false }));

    (async () => {
      try {
        const res = await fetchWithTimeout(
          `${API_URL}/api/admin/role-permissions/${encodeURIComponent(role)}`,
          { method: 'PUT', headers: HEADERS(token), body: JSON.stringify({ permissions: updated }) },
          30000
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Save failed.');
        const serverPerms = data.data?.permissions;
        if (serverPerms) setPermissionsData((p) => ({ ...p, [role]: mergePerms(serverPerms) }));
        setSaveSuccess((p) => ({ ...p, [role]: true }));
        successTimersRef.current[role] = setTimeout(() => {
          setSaveSuccess((p) => ({ ...p, [role]: false }));
        }, 2000);
      } catch (err) {
        setPermissionsData((p) => ({ ...p, [role]: prev }));
        setSaveError((p) => ({ ...p, [role]: err.message || 'Save failed.' }));
      } finally {
        setSaving((p) => ({ ...p, [role]: false }));
      }
    })();
  };

  const activeRoles = roles.filter((r) => (staffByRole[r.value] || []).length > 0);

  if (currentUser && !isPrivilegedRole(currentUser.role)) return null;

  return (
    <ErrorBoundary>
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem' }}>

        {/* Admin/Owner notice */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.75rem 1rem', marginBottom: '1.5rem',
          background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.2)',
          borderRadius: '10px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
            <strong style={{ color: 'var(--gold)' }}>Administrator</strong> and <strong style={{ color: 'var(--gold)' }}>Owner</strong> roles have unrestricted access and cannot be configured here.
          </span>
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ height: '60px', borderRadius: i === 0 ? '12px 12px 0 0' : i === 3 ? '0 0 12px 12px' : '0', background: 'var(--dark3)', border: '1px solid var(--border)', borderTop: i > 0 ? 'none' : undefined, animation: 'pulse 1.4s ease-in-out infinite' }} />
            ))}
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.9rem' }}>{error}</span>
            <button type="button" onClick={fetchData} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.12)', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Retry</button>
          </div>
        )}

        {!loading && !error && activeRoles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--gray)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--white)', marginBottom: '6px' }}>No staff assigned yet</p>
            <p style={{ margin: 0, fontSize: '0.82rem' }}>Add staff members with roles in the <strong style={{ color: 'var(--gold)' }}>Users</strong> page. Once assigned, their role will appear here for permission configuration.</p>
          </div>
        )}

        {!loading && !error && activeRoles.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>

            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 180px 100px 40px',
              padding: '0.65rem 1.25rem',
              background: 'var(--dark3)',
              borderBottom: '1px solid var(--border)',
              fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)',
              textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              <span>Role</span>
              <span>Staff Members</span>
              <span style={{ textAlign: 'center' }}>Permissions</span>
              <span />
            </div>

            {/* Table rows */}
            {activeRoles.map(({ value: role, label }, idx) => {
              const row        = permissionsData[role] || defaultRow();
              const members    = staffByRole[role] || [];
              const enabledCount = SECTIONS.filter((s) => row[s.key]).length;
              const totalCount   = SECTIONS.length;
              const isExpanded   = !!expanded[role];

              return (
                <div key={role} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }}>

                  {/* Summary row — clickable */}
                  <div
                    onClick={() => setExpanded((p) => ({ ...p, [role]: !p[role] }))}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 180px 100px 40px',
                      padding: '0.9rem 1.25rem',
                      alignItems: 'center',
                      cursor: 'pointer',
                      background: isExpanded ? 'rgba(212,168,67,0.04)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    {/* Role name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(212,168,67,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--white)' }}>{label}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '1px' }}>
                          {members.length} staff member{members.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>

                    {/* Staff avatars + names */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {members.slice(0, 3).map((s) => (
                        <div key={s._id || s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 700, color: '#D4A843', flexShrink: 0 }}>
                            {((s.firstName || '').charAt(0) + (s.lastName || '').charAt(0)).toUpperCase() || '?'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {`${s.firstName || ''} ${s.lastName || ''}`.trim() || '—'}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--gray)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.email || '—'}
                            </div>
                          </div>
                        </div>
                      ))}
                      {members.length > 3 && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--gray)', paddingLeft: '26px' }}>+{members.length - 3} more</div>
                      )}
                    </div>

                    {/* Permissions count + save status */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <div style={{ padding: '3px 10px', borderRadius: '999px', background: enabledCount > 0 ? 'rgba(212,168,67,0.12)' : 'var(--dark3)', border: `1px solid ${enabledCount > 0 ? 'rgba(212,168,67,0.3)' : 'var(--border)'}`, fontSize: '0.72rem', fontWeight: 700, color: enabledCount > 0 ? 'var(--gold)' : 'var(--gray)' }}>
                        {enabledCount}/{totalCount}
                      </div>
                      {saving[role] && <span style={{ fontSize: '0.65rem', color: 'var(--gold)' }}>Saving...</span>}
                      {!saving[role] && saveSuccess[role] && <span style={{ fontSize: '0.65rem', color: 'var(--green)' }}>Saved ✓</span>}
                      {!saving[role] && saveError[role] && <span style={{ fontSize: '0.65rem', color: 'var(--red)' }}>Error</span>}
                    </div>

                    {/* Chevron */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  </div>

                  {/* Expanded permissions panel */}
                  {isExpanded && (
                    <div style={{ padding: '1rem 1.25rem 1.25rem', borderTop: '1px solid var(--border)', background: 'var(--dark3)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {SECTION_GROUPS.map((group) => (
                        <div key={group.label}>
                          <div style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                            {group.label}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '6px' }}>
                            {group.keys.map((key) => {
                              const section = SECTIONS.find((s) => s.key === key);
                              if (!section) return null;
                              const checked = !!row[key];
                              return (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.75rem', borderRadius: '8px', background: checked ? 'rgba(212,168,67,0.06)' : 'var(--dark2)', border: `1px solid ${checked ? 'rgba(212,168,67,0.2)' : 'var(--border)'}`, transition: 'all 0.15s' }}>
                                  <span style={{ fontSize: '0.8rem', color: checked ? 'var(--white)' : 'var(--gray)', fontWeight: checked ? 600 : 400 }}>
                                    {section.label}
                                  </span>
                                  <ToggleSwitch checked={checked} disabled={false} onChange={() => handleToggle(role, key)} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {/* Always-on dashboard */}
                      <div>
                        <div style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                          Always On
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.75rem', borderRadius: '8px', background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)', minWidth: '180px', gap: '2rem' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--gray)', fontWeight: 600 }}>Dashboard</span>
                          <ToggleSwitch checked={true} disabled={true} onChange={() => {}} />
                        </div>
                      </div>

                      {saveError[role] && (
                        <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--red)', fontSize: '0.8rem' }}>
                          {saveError[role]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </ErrorBoundary>
  );
}
