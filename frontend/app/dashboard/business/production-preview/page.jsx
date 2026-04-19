"use client";

/**
 * PRODUCTION DASHBOARD PREVIEW
 * 
 * ACCESS: /dashboard/business/production-preview
 * 
 * What production team sees:
 * - Only their assigned Job Orders
 * - Can start, update progress, upload photos/notes
 * - Can mark as complete (triggers QC)
 * 
 * This is a PREVIEW with mock data.
 */

import { useMemo, useState } from 'react';

const MOCK_JOBS = [
  {
    id: 'JO-2026-045',
    orderId: 'ORD-2026-001',
    customer: 'Juan Dela Cruz',
    items: [
      { name: 'Custom Ceramic Mug 11oz', qty: 10 },
      { name: 'Magic Mug Black 15oz', qty: 5 },
    ],
    designFile: 'company-logo.png',
    targetDate: '2026-04-15',
    isRush: false,
    status: 'queued',
    assignedTo: 'Production Team A',
    notes: 'Custom name printing on all mugs',
    timeline: [
      { action: 'JO Created', date: '2026-04-11T09:00', by: 'Admin' },
    ],
  },
  {
    id: 'JO-2026-042',
    orderId: 'ORD-2026-003',
    customer: 'Pedro Reyes',
    items: [
      { name: 'Sticker Pack A4', qty: 50 },
      { name: 'Custom Ceramic Mug 11oz', qty: 8 },
    ],
    designFile: 'sticker-artwork.pdf',
    targetDate: '2026-04-14',
    isRush: true,
    status: 'in_progress',
    assignedTo: 'Production Team A',
    notes: 'Rush order — event on April 20',
    timeline: [
      { action: 'JO Created', date: '2026-04-09T08:00', by: 'Admin' },
      { action: 'Started', date: '2026-04-10T10:00', by: 'You' },
    ],
  },
  {
    id: 'JO-2026-038',
    orderId: 'ORD-2026-004',
    customer: 'Ana Garcia',
    items: [
      { name: 'Custom Ceramic Mug 11oz', qty: 10 },
    ],
    designFile: null,
    targetDate: '2026-04-12',
    isRush: false,
    status: 'completed',
    assignedTo: 'Production Team B',
    notes: '',
    timeline: [
      { action: 'JO Created', date: '2026-04-06T09:00', by: 'Admin' },
      { action: 'Started', date: '2026-04-07T10:00', by: 'You' },
      { action: 'Marked Complete', date: '2026-04-10T11:00', by: 'You', note: 'Sent to QC' },
    ],
  },
];

const STATUS_CONFIG = {
  queued: { label: 'Queued', color: 'var(--color-text-warning)', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
  in_progress: { label: 'In Progress', color: 'var(--blue)', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)' },
  completed: { label: 'Completed', color: 'var(--gray)', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)' },
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

export default function ProductionPreviewPage() {
  const [jobs] = useState(MOCK_JOBS);
  const [selectedJob, setSelectedJob] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return jobs;
    return jobs.filter((j) => j.status === filterStatus);
  }, [jobs, filterStatus]);

  const stats = useMemo(() => ({
    queued: jobs.filter((j) => j.status === 'queued').length,
    inProgress: jobs.filter((j) => j.status === 'in_progress').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
  }), [jobs]);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>
          Home › Production › My Jobs
        </div>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--white)' }}>
          Production Dashboard
        </h1>
        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--gray)' }}>
          Your assigned job orders. Start, track progress, and submit for QC.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Queued', value: stats.queued, color: 'var(--color-text-warning)' },
          { label: 'In Progress', value: stats.inProgress, color: 'var(--blue)' },
          { label: 'Completed', value: stats.completed, color: 'var(--gray)' },
        ].map((s) => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.25rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.85rem', outline: 'none' }}>
          <option value="all" style={{ background: 'var(--dark)' }}>All Jobs</option>
          <option value="queued" style={{ background: 'var(--dark)' }}>Queued</option>
          <option value="in_progress" style={{ background: 'var(--dark)' }}>In Progress</option>
          <option value="completed" style={{ background: 'var(--dark)' }}>Completed</option>
        </select>
      </div>

      {/* Job Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filtered.map((job) => {
          const config = STATUS_CONFIG[job.status];
          return (
            <div
              key={job.id}
              onClick={() => setSelectedJob(job)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.06)',
                padding: '1.25rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--white)', fontSize: '1rem' }}>{job.id}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', background: config.bg, color: config.color, border: `1px solid ${config.border}` }}>
                      {config.label}
                    </span>
                    {job.isRush && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' }}>
                        RUSH
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                    {job.customer} | Order #{job.orderId}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>Target</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--white)' }}>{formatDate(job.targetDate)}</div>
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

              {/* Design + Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {job.designFile && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.7rem', color: 'var(--indigo)', fontWeight: 600 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                      {job.designFile}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {job.status === 'queued' && (
                    <button onClick={(e) => { e.stopPropagation(); }} style={{ padding: '0.375rem 0.75rem', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '6px', color: 'var(--blue)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                      Start
                    </button>
                  )}
                  {job.status === 'in_progress' && (
                    <button onClick={(e) => { e.stopPropagation(); }} style={{ padding: '0.375rem 0.75rem', background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: '6px', color: 'var(--cyan)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                      Submit for QC
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Job Detail Panel */}
      {selectedJob && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} onClick={() => setSelectedJob(null)} />
          <div style={{ position: 'fixed', top: 0, right: 0, width: '460px', height: '100vh', background: 'var(--dark)', borderLeft: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', zIndex: 1000 }}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>{selectedJob.id}</div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--white)' }}>{selectedJob.customer}</h2>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.25rem' }}>Order #{selectedJob.orderId}</div>
                </div>
                <button onClick={() => setSelectedJob(null)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', color: 'var(--gray)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div style={{ padding: '1.25rem' }}>
              {/* Items */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Items to Produce</h4>
                {selectedJob.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', marginBottom: idx < selectedJob.items.length - 1 ? '0.375rem' : 0 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--white)' }}>{item.name}</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'monospace' }}>× {item.qty}</span>
                  </div>
                ))}
              </div>

              {/* Design */}
              {selectedJob.designFile && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Design File</h4>
                  <div style={{ padding: '0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--indigo)' }}>{selectedJob.designFile}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>Click to view full design</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedJob.notes && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Notes</h4>
                  <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--white)', lineHeight: 1.5 }}>{selectedJob.notes}</div>
                </div>
              )}

              {/* Timeline */}
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Activity Log</h4>
                {selectedJob.timeline.map((event, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--gold)', marginTop: '0.375rem', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--white)' }}>{event.action}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>{formatDate(event.date)} at {formatTime(event.date)} — {event.by}</div>
                      {event.note && <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontStyle: 'italic', marginTop: '0.15rem' }}>{event.note}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {selectedJob.status === 'queued' && (
                  <button type="button" style={{ padding: '0.625rem 0.75rem', background: 'var(--gold)', border: 'none', borderRadius: '8px', color: '#000', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>Start Production</button>
                )}
                {selectedJob.status === 'in_progress' && (
                  <>
                    <button style={{ padding: '0.625rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                      Upload Photo/Note
                    </button>
                    <button style={{ padding: '0.625rem', background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: '8px', color: 'var(--cyan)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>Submit for QC</button>
                  </>
                )}
                {selectedJob.status === 'completed' && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', textAlign: 'center', padding: '0.75rem', background: 'var(--color-background-success)', border: '1px solid var(--color-border-success)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--color-text-success)', fontWeight: 600 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Submitted for Quality Check
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
