"use client";

/**
 * QC DASHBOARD PREVIEW
 * 
 * ACCESS: /dashboard/business/qc-preview
 * 
 * What QC team sees:
 * - Only JOs marked "QC Pending"
 * - Can inspect, upload photos, pass/fail
 * - If fail: must provide defect details
 * 
 * This is a PREVIEW with mock data.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchJobOrders } from '@/lib/jobOrderApi';
import ErrorBoundary from '@/components/ErrorBoundary';

function normalizeJobForQC(jo) {
  const prod = jo.product || {};
  const items = Array.isArray(jo.items) && jo.items.length > 0
    ? jo.items.map(i => ({ name: i.product_name || i.productName || i.name || '', qty: Number(i.qty || i.quantity || 1) }))
    : prod.name
      ? [{ name: prod.name + (prod.variant ? ` (${prod.variant})` : ''), qty: Number(prod.quantity || 1) }]
      : [];
  const fp = jo.designFilePath || jo.design_file_path || null;
  return {
    _id:             String(jo.id ?? jo._id),
    id:              jo.joId || String(jo.id ?? jo._id),
    orderId:         jo.orderId || '',
    customer:        jo.order?.userSnapshot?.name || jo.order?.customer?.name || jo.customerName || '—',
    items,
    designFile:      fp ? fp.split('/').pop() : null,
    targetDate:      jo.targetCompletion || null,
    isRush:          !!jo.isRush,
    submittedBy:     jo.assignedTo || '',
    submittedAt:     jo.updatedAt || jo.completedAt || null,
    productionPhotos: jo.productionPhotos || [],
    notes:           jo.notes || '',
  };
}

const QC_STATUSES = new Set(['qc_pending', 'qc pending', 'qc-pending', 'pending qc', 'quality_check', 'quality check']);

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

export default function QCPreviewPage() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [qcResult, setQcResult] = useState('');
  const [defectNotes, setDefectNotes] = useState('');
  const [qcNotes, setQcNotes] = useState('');

  const loadJobs = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchJobOrders(token);
      const all = Array.isArray(data) ? data : (data?.data ?? []);
      const qcJobs = all.filter(jo => {
        const s = (jo.joStatus || jo.status || '').toLowerCase();
        return QC_STATUSES.has(s) || s.includes('qc') || s.includes('quality');
      });
      setJobs(qcJobs.map(normalizeJobForQC));
    } catch (err) {
      setError(err.message || 'Failed to load job orders');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  if (isLoading) {
    return (
      <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
        <style>{`@keyframes qcPageSkel { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            style={{
              height: '56px',
              background: 'var(--dark2)',
              borderRadius: '8px',
              marginBottom: '0.5rem',
              animation: 'qcPageSkel 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div
          style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '8px',
            padding: '1rem',
            color: 'var(--white)',
          }}
        >
          <p style={{ margin: 0 }}>{error}</p>
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: '0.75rem' }}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'rgba(6,182,212,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(6,182,212,0.2)', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--cyan)' }}>{jobs.length}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.25rem' }}>Pending QC</div>
        </div>
        <div style={{ background: 'rgba(139,92,246,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(139,92,246,0.2)', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--purple)' }}>—</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.25rem' }}>Completed Today</div>
        </div>
      </div>

      {/* QC Job Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {jobs.map((job) => (
          <div
            key={job.id}
            onClick={() => { setSelectedJob(job); setQcResult(''); setDefectNotes(''); setQcNotes(''); }}
            style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.06)',
              padding: '1.25rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(6,182,212,0.3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--white)', fontSize: '1rem' }}>{job.id}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(6,182,212,0.15)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.3)' }}>
                    QC Pending
                  </span>
                  {job.isRush && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' }}>
                      RUSH
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{job.customer} | Order #{job.orderId}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>Submitted</div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)' }}>{formatDate(job.submittedAt)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>by {job.submittedBy}</div>
              </div>
            </div>

            {/* Items */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {job.items.map((item, idx) => (
                <span key={idx} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', color: 'var(--white)' }}>
                  {item.name} × {item.qty}
                </span>
              ))}
            </div>

            {/* Production Photos + Inspect Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {job.productionPhotos.length > 0 && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--gray)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                    {job.productionPhotos.length} photo{job.productionPhotos.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button onClick={(e) => { e.stopPropagation(); setSelectedJob(job); setQcResult(''); setDefectNotes(''); setQcNotes(''); }} style={{ padding: '0.375rem 0.75rem', background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: '6px', color: 'var(--cyan)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                Inspect
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* QC Inspection Panel */}
      {selectedJob && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} onClick={() => setSelectedJob(null)} />
          <div style={{ position: 'fixed', top: 0, right: 0, width: '480px', height: '100vh', background: 'var(--dark)', borderLeft: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', zIndex: 1000 }}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>{selectedJob.id}</div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--white)' }}>QC Inspection</h2>
                </div>
                <button onClick={() => setSelectedJob(null)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--gray)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div style={{ padding: '1.25rem' }}>
              {/* Job Info */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--white)' }}>{selectedJob.customer}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Order #{selectedJob.orderId} | Target: {formatDate(selectedJob.targetDate)}</div>
              </div>

              {/* Items */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Items to Inspect</h4>
                {selectedJob.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', marginBottom: idx < selectedJob.items.length - 1 ? '0.375rem' : 0 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--white)' }}>{item.name}</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'monospace' }}>× {item.qty}</span>
                  </div>
                ))}
              </div>

              {/* Production Photos */}
              {selectedJob.productionPhotos.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Production Photos</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    {selectedJob.productionPhotos.map((photo, idx) => (
                      <div key={idx} style={{ height: '100px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>{photo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* QC Decision */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>QC Decision</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <button
                    onClick={() => setQcResult('passed')}
                    style={{
                      padding: '1rem',
                      background: qcResult === 'passed' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)',
                      border: qcResult === 'passed' ? '2px solid var(--green)' : '2px solid rgba(255,255,255,0.08)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={qcResult === 'passed' ? 'var(--green)' : 'var(--gray)'} strokeWidth="2" style={{ marginBottom: '0.5rem' }}>
                      <circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-5" />
                    </svg>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: qcResult === 'passed' ? 'var(--green)' : 'var(--white)' }}>Pass</div>
                  </button>
                  <button
                    onClick={() => setQcResult('failed')}
                    style={{
                      padding: '1rem',
                      background: qcResult === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)',
                      border: qcResult === 'failed' ? '2px solid var(--red)' : '2px solid rgba(255,255,255,0.08)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={qcResult === 'failed' ? 'var(--red)' : 'var(--gray)'} strokeWidth="2" style={{ marginBottom: '0.5rem' }}>
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: qcResult === 'failed' ? 'var(--red)' : 'var(--white)' }}>Fail</div>
                  </button>
                </div>
              </div>

              {/* Defect Details (shown if failed) */}
              {qcResult === 'failed' && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase' }}>Defect Details *</h4>
                  <textarea
                    value={defectNotes}
                    onChange={(e) => setDefectNotes(e.target.value)}
                    placeholder="Describe the defects found..."
                    rows={3}
                    style={{ width: '100%', padding: '0.625rem 0.75rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.85rem', outline: 'none', resize: 'vertical' }}
                  />
                </div>
              )}

              {/* QC Notes */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>QC Notes</h4>
                <textarea
                  value={qcNotes}
                  onChange={(e) => setQcNotes(e.target.value)}
                  placeholder="Additional notes (optional)..."
                  rows={2}
                  style={{ width: '100%', padding: '0.625rem 0.75rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.85rem', outline: 'none', resize: 'vertical' }}
                />
              </div>

              {/* Submit */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  disabled={!qcResult || (qcResult === 'failed' && !defectNotes)}
                  style={{
                    padding: '0.625rem',
                    background: qcResult && !(qcResult === 'failed' && !defectNotes)
                      ? qcResult === 'passed' ? 'var(--green)' : 'var(--red)'
                      : 'rgba(255,255,255,0.06)',
                    border: 'none',
                    borderRadius: '8px',
                    color: qcResult && !(qcResult === 'failed' && !defectNotes) ? 'var(--white)' : 'var(--gray)',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: qcResult && !(qcResult === 'failed' && !defectNotes) ? 'pointer' : 'not-allowed',
                  }}
                >
                  Submit QC Result
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </ErrorBoundary>
  );
}
