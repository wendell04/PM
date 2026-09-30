'use client';

/**
 * Sales made outside the system - "Recorded by hand" on Reports.
 *
 * Two ways in, the usual pair (QuickBooks, Xero, Shopify POS):
 *   Record sale   - one sale like one receipt: a date, a channel, one or more items.
 *   Import sales  - many sales from a spreadsheet, checked row by row before anything is saved, and
 *                   kept as one batch that can be undone.
 * Both count in Sales, Reports and the forecast like any other sale. Dates are YYYY-MM-DD: the
 * 2023-2025 history lost 127 sales to the wrong month when a day/month spreadsheet read month/day.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import { formatPrice } from '@/src/utils/format';
import { S, SummaryCard, SearchBar, PaginationBar, EmptyState, CustomSelect } from '../inventory-v2/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const CHANNELS = ['Walk-in', 'Online', 'Bulk/B2B', 'Other'];
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);   // Manila
const peso = (n) => formatPrice(Number(n) || 0);
const TEMPLATE_COLUMNS = ['Date', 'Product', 'Channel', 'Qty', 'Price per unit', 'Cost per unit', 'Category', 'Notes'];

const input = { width: '100%', padding: '8px 10px', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--white)', fontSize: 13, boxSizing: 'border-box' };
const label = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 };
const btn = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--dark)', color: 'var(--white)', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const btnGold = { ...btn, background: 'var(--gold)', borderColor: 'var(--gold)', color: '#111', fontWeight: 700 };

function Modal({ title, sub, onClose, children, footer, wide }) {
  useLockBodyScroll(true);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ width: '100%', maxWidth: wide ? 980 : 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--white)' }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 3, lineHeight: 1.5 }}>{sub}</div>}
        </div>
        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>{children}</div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>{footer}</div>
      </div>
    </div>
  );
}

// ── Record sale: one receipt, one or more items ──────────────────────────────
function RecordSaleModal({ token, catalog, editing, onClose, onSaved }) {
  const blank = () => ({ productId: '', variantName: '', productName: '', category: '', quantity: '1', unitPrice: '', costPerUnit: '', other: false, bands: null, priceTouched: false });
  // The listed price for this many, from the product's quantity bands (same resolver as checkout).
  const bandPrice = (bands, qty) => {
    if (!bands?.length) return null;
    const q = Math.max(1, Number(qty) || 1);
    const hit = bands.find(b => q >= b.min && (b.max == null || q <= b.max)) ?? (q < bands[0].min ? bands[0] : bands[bands.length - 1]);
    return hit?.price ?? null;
  };
  const [date, setDate] = useState(editing?.date ?? today());
  const [channel, setChannel] = useState(editing?.channel || 'Walk-in');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [items, setItems] = useState(() => editing
    ? [{ productId: editing.productId || '', variantName: editing.variantName || '', productName: editing.productName, category: editing.category,
        quantity: String(editing.quantity), unitPrice: String(editing.unitPrice), costPerUnit: String(editing.costPerUnit), other: !editing.productId }]
    : [blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const options = useMemo(() => {
    const out = [{ value: '', label: 'Choose a product...' }];
    for (const p of catalog) {
      if (p.variants.length) for (const v of p.variants) out.push({ value: `${p.id}|${v.id}`, label: `${p.name} - ${v.name}` });
      else out.push({ value: `${p.id}|`, label: p.name });
    }
    return out;
  }, [catalog]);

  const set = (i, patch) => setItems(list => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const pick = (i, value) => {
    if (!value) { set(i, { productId: '', variantName: '', productName: '' }); return; }
    const [pid, vid] = value.split('|');
    const p = catalog.find(x => x.id === pid);
    const v = p?.variants.find(x => x.id === vid);
    const bands = v?.bands ?? p.bands ?? null;
    setItems(list => list.map((it, j) => (j !== i ? it : { ...it, productId: pid, variantName: v?.name || '', productName: v ? `${p.name} (${v.name})` : p.name,
      category: p.category || '', bands, priceTouched: false,
      unitPrice: String(bandPrice(bands, it.quantity) ?? v?.price ?? p.price ?? ''), costPerUnit: String(v?.cost ?? p.cost ?? '') })));
  };
  const n = (v) => Number(String(v).replace(/,/g, ''));
  const lines = items.map(it => ({ total: n(it.quantity) * n(it.unitPrice), cost: n(it.quantity) * n(it.costPerUnit) }));
  const total = lines.reduce((s, l) => s + (Number.isFinite(l.total) ? l.total : 0), 0);
  const cost = lines.reduce((s, l) => s + (Number.isFinite(l.cost) ? l.cost : 0), 0);

  const save = async () => {
    setError('');
    const bad = items.findIndex(it => !it.productName.trim() || !(n(it.quantity) >= 1) || it.unitPrice === '' || it.costPerUnit === '');
    if (!date) { setError('Pick the date of the sale.'); return; }
    if (bad >= 0) { setError(`${items.length > 1 ? `Item ${bad + 1}: ` : ''}fill in the product, qty, price and cost.`); return; }
    setBusy(true);
    try {
      const payloadItems = items.map(it => ({ productId: it.productId || null, variantName: it.variantName || null, productName: it.productName.trim(),
        category: it.category, quantity: n(it.quantity), unitPrice: n(it.unitPrice), costPerUnit: n(it.costPerUnit) }));
      const res = await fetchWithTimeout(editing ? `${API_URL}/api/admin/sales/manual/${editing.id}` : `${API_URL}/api/admin/sales/manual`, {
        method: editing ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { date, channel, notes, ...payloadItems[0] } : { date, channel, notes, items: payloadItems }),
      }, 30000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not save the sale.');
      onSaved(d.message || 'Saved.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? 'Edit recorded sale' : 'Record a sale'} onClose={() => !busy && onClose()}
      sub={editing ? 'Changes are kept in the audit log.' : 'For a sale made outside the system, like one receipt. It counts in Sales, Reports and the forecast. Stock is not changed - adjust it in Inventory if the materials were never taken off.'}
      footer={<>
        {error && <span style={{ fontSize: 12, color: 'var(--st-red-fg)', marginRight: 'auto' }}>{error}</span>}
        <button type="button" onClick={onClose} disabled={busy} style={btn}>Cancel</button>
        <button type="button" onClick={save} disabled={busy} style={btnGold}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Record sale'}</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
        <div><label style={label} htmlFor="rs-date">Date of sale</label>
          <input id="rs-date" type="date" value={date} max={today()} min="2015-01-01" onChange={e => setDate(e.target.value)} style={input} /></div>
        <div><label style={label}>Channel</label>
          <CustomSelect value={channel} onChange={setChannel} options={CHANNELS.map(c => ({ value: c, label: c }))} /></div>
        <div style={{ gridColumn: 'span 2', minWidth: 0 }}><label style={label} htmlFor="rs-notes">Notes (optional)</label>
          <input id="rs-notes" value={notes} maxLength={500} placeholder="Invoice no., customer, anything to remember" onChange={e => setNotes(e.target.value)} style={input} /></div>
      </div>

      {items.map((it, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10, background: 'var(--dark)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)' }}>{items.length > 1 ? `Item ${i + 1}` : 'Item'}</span>
            <button type="button" onClick={() => set(i, { other: !it.other, productId: '', variantName: '', productName: '', category: '' })}
              style={{ ...btn, padding: '3px 9px', fontSize: 11.5, marginLeft: 'auto' }}>{it.other ? 'Pick from catalog' : 'Different product'}</button>
            {items.length > 1 && <button type="button" onClick={() => setItems(list => list.filter((_, j) => j !== i))}
              style={{ ...btn, padding: '3px 9px', fontSize: 11.5, color: 'var(--st-red-fg)' }}>Remove</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
              <label style={label}>Product</label>
              {it.other
                ? <input value={it.productName} maxLength={160} placeholder="Product name, e.g. Button Pins" onChange={e => set(i, { productName: e.target.value })} style={input} />
                : <CustomSelect searchable value={it.productId ? `${it.productId}|${catalog.find(p => p.id === it.productId)?.variants.find(v => v.name === it.variantName)?.id ?? ''}` : ''}
                    onChange={v => pick(i, v)} options={options} />}
            </div>
            {it.other && <div><label style={label}>Category <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
              {/* Suggests the shop's own categories so Reports does not end up with "Souvenir" and "Souvenirs". */}
              <input value={it.category} maxLength={80} list="rs-categories" placeholder="Pick or type" onChange={e => set(i, { category: e.target.value })} style={input} /></div>}
            <div><label style={label}>Qty</label>
              <input inputMode="numeric" value={it.quantity} maxLength={6} onChange={e => { const q = e.target.value.replace(/\D/g, ''); const bp = !it.priceTouched ? bandPrice(it.bands, q) : null; set(i, bp != null ? { quantity: q, unitPrice: String(bp) } : { quantity: q }); }} style={input} /></div>
            <div><label style={label}>Price per unit</label>
              <input inputMode="decimal" value={it.unitPrice} maxLength={10} onChange={e => set(i, { unitPrice: e.target.value.replace(/[^\d.]/g, ''), priceTouched: true })} style={input} />
              {it.bands?.length > 1 && !it.priceTouched && <div style={{ fontSize: 10.5, color: 'var(--gray)', marginTop: 3 }}>Listed price for this qty</div>}</div>
            <div><label style={label}>Cost per unit</label>
              <input inputMode="decimal" value={it.costPerUnit} maxLength={10} onChange={e => set(i, { costPerUnit: e.target.value.replace(/[^\d.]/g, '') })} style={input} /></div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 8 }}>
            Sale {peso(lines[i].total)} - cost {peso(lines[i].cost)} = <b style={{ color: lines[i].total - lines[i].cost >= 0 ? 'var(--st-green-fg)' : 'var(--st-red-fg)' }}>profit {peso(lines[i].total - lines[i].cost)}</b>
          </div>
        </div>
      ))}
      <datalist id="rs-categories">{[...new Set(catalog.map(p => p.category).filter(Boolean))].sort().map(c => <option key={c} value={c} />)}</datalist>
      {!editing && items.length < 50 && <button type="button" onClick={() => setItems(list => [...list, blank()])} style={btn}>+ Add item</button>}
      <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: 'var(--dark)', border: '1px solid var(--border)', display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
        <span>Total <b>{peso(total)}</b></span><span>Cost <b>{peso(cost)}</b></span>
        <span>Profit <b style={{ color: total - cost >= 0 ? 'var(--st-green-fg)' : 'var(--st-red-fg)' }}>{peso(total - cost)}</b></span>
      </div>
    </Modal>
  );
}

// ── Import sales: template, file, row-by-row check, then one batch ──────────
function ImportModal({ token, onClose, onDone }) {
  const [step, setStep] = useState('pick');   // pick -> review
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [show, setShow] = useState('all');
  const [mixedDates, setMixedDates] = useState(null);
  const [datesOk, setDatesOk] = useState(false);   // mixed dates: import only once someone says they checked

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS,
      ['2025-01-17', 'Stickers', 'Bulk/B2B', 22, 40, 25, 'Stickers & Labels', 'Invoice 0142'],
      ['2025-01-18', 'Custom Mug 11oz (Ceramic White)', 'Walk-in', 10, 95, 50, '', '']]);
    sheet['!cols'] = [12, 34, 12, 6, 14, 14, 18, 24].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, sheet, 'Sales');
    const help = XLSX.utils.aoa_to_sheet([['How to fill this in'],
      ['Date', 'YYYY-MM-DD, for example 2025-01-17. Type it as text or use an Excel date. 01/05/2025 is refused: it can mean Jan 5 or May 1.'],
      ['Product', 'The product name. A name from the catalog links it; any other name is saved as written.'],
      ['Channel', 'Walk-in, Online, Bulk/B2B or Other.'],
      ['Qty', 'A whole number, 1 or more.'],
      ['Price per unit', 'What one piece sold for, in pesos. No peso sign needed.'],
      ['Cost per unit', 'What one piece cost you. 0 only if it really cost nothing.'],
      ['Category', 'Optional. Taken from the catalog when the product is found there.'],
      ['Notes', 'Optional. Invoice number, customer, anything to remember.'],
      [''], ['Delete the two example rows before uploading. One row is one line of a sale. Up to 2,000 rows per file.']]);
    help['!cols'] = [{ wch: 16 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, help, 'How to fill in');
    XLSX.writeFile(wb, 'PersonalizeMe-sales-import-template.xlsx');
  };

  const readFile = async (file) => {
    setError(''); setCheck(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('That file is over 5 MB. Split it into smaller files.'); return; }
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
      const key = (o, names) => { for (const k of Object.keys(o)) if (names.includes(k.trim().toLowerCase())) return o[k]; return ''; };
      // A real Excel date comes through as a Date: taken as the calendar day it shows. Text stays text,
      // so the server can refuse 01/05/2025 instead of guessing which month it means.
      const dateOf = (v) => v instanceof Date && !isNaN(v)
        ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
        : String(v ?? '').trim();
      const parsed = raw.map(o => ({
        date: dateOf(key(o, ['date', 'sale date'])),
        productName: String(key(o, ['product', 'product name', 'item']) ?? '').trim(),
        channel: String(key(o, ['channel', 'sales channel']) ?? '').trim(),
        quantity: key(o, ['qty', 'quantity', 'units sold', 'units']),
        unitPrice: key(o, ['price per unit', 'price', 'unit price']),
        costPerUnit: key(o, ['cost per unit', 'cost', 'unit cost']),
        category: String(key(o, ['category']) ?? '').trim(),
        notes: String(key(o, ['notes', 'note', 'remarks']) ?? '').trim(),
      })).filter(r => Object.values(r).some(v => String(v).trim() !== ''));
      if (!parsed.length) throw new Error('No sales rows found. Use the template: the first row must be the column names.');
      // The signature of a month/day sheet opened as day/month: Excel turned every date with a day of
      // 12 or less into a real date (with day and month swapped) and left the rest as text. Row by row
      // the swapped ones look fine, so the file as a whole is what gives it away.
      const realDates = raw.filter(o => key(o, ['date', 'sale date']) instanceof Date).length;
      const slashText = raw.filter(o => /^\d{1,2}\/\d{1,2}\/\d{2,5}$/.test(String(key(o, ['date', 'sale date'])).trim())).length;
      setMixedDates(realDates > 0 && slashText > 0 ? { realDates, slashText } : null);
      setDatesOk(false);
      if (parsed.length > 2000) throw new Error(`${parsed.length} rows - up to 2,000 per file. Split it into smaller files.`);
      const res = await fetchWithTimeout(`${API_URL}/api/admin/sales/manual/import/check`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsed }),
      }, 60000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not check the file.');
      setFileName(file.name); setRows(parsed); setCheck(d.data); setStep('review');
    } catch (e) { setError(e.message || 'Could not read that file. Save it as .xlsx or .csv and try again.'); }
    finally { setBusy(false); }
  };

  const doImport = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/sales/manual/import`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, fileName }),
      }, 120000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Import failed.');
      onDone(d.message || 'Imported.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const shown = (check?.rows ?? []).filter(r => show === 'all' || (show === 'bad' ? r.errors.length : show === 'warn' ? (!r.errors.length && r.warnings.length) : false));
  return (
    <Modal wide title="Import sales" onClose={() => !busy && onClose()}
      sub="Many sales at once from a spreadsheet. Every row is checked first; nothing is saved until you press Import. The whole import can be undone later."
      footer={<>
        {error && <span style={{ fontSize: 12, color: 'var(--st-red-fg)', marginRight: 'auto', maxWidth: 520 }}>{error}</span>}
        {step === 'review' && <button type="button" onClick={() => { setStep('pick'); setCheck(null); setRows([]); }} disabled={busy} style={btn}>Choose another file</button>}
        <button type="button" onClick={onClose} disabled={busy} style={btn}>Cancel</button>
        {step === 'review' && <button type="button" onClick={doImport} disabled={busy || !check?.good || (mixedDates && !datesOk)} style={{ ...btnGold, opacity: busy || !check?.good || (mixedDates && !datesOk) ? 0.5 : 1 }}>
          {busy ? 'Importing...' : `Import ${check?.good ?? 0} sale${check?.good === 1 ? '' : 's'}`}</button>}
      </>}>
      {step === 'pick' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--dark)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>1. Download the template</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray)', marginBottom: 10, lineHeight: 1.5 }}>
              Columns: {TEMPLATE_COLUMNS.join(', ')}. Dates as <b>YYYY-MM-DD</b> (2025-01-17) - a date like 01/05/2025 is refused, because it can mean January 5 or May 1.
            </div>
            <button type="button" onClick={downloadTemplate} style={btn}>Download template (.xlsx)</button>
          </div>
          <div style={{ padding: 14, border: '1px dashed var(--border)', borderRadius: 10, background: 'var(--dark)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>2. Upload the filled file</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray)', marginBottom: 10 }}>.xlsx, .xls or .csv, up to 2,000 rows and 5 MB.</div>
            <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={e => readFile(e.target.files?.[0])} style={{ fontSize: 13, color: 'var(--white)' }} />
            {busy && <div style={{ fontSize: 12.5, color: 'var(--gray)', marginTop: 8 }}>Reading and checking...</div>}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ flex: '1 1 150px' }}><SummaryCard label="Will import" value={check.good} sub={peso(check.revenue)} accent /></div>
            <div style={{ flex: '1 1 150px' }}><SummaryCard label="Check these" value={check.warned} sub="Imported, but worth a look" color={check.warned ? 'var(--st-orange-fg)' : undefined} /></div>
            <div style={{ flex: '1 1 150px' }}><SummaryCard label="Left out" value={check.bad} sub="Errors - fix and import again" color={check.bad ? 'var(--st-red-fg)' : undefined} /></div>
          </div>
          {mixedDates && (
            <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 12, background: 'var(--st-red-bg)', color: 'var(--st-red-fg)', fontSize: 12.5, lineHeight: 1.55 }}>
              <b>Check the dates before importing.</b> {mixedDates.realDates} dates in this file are real Excel dates and {mixedDates.slashText} are text like 01/15/2025.
              That mix usually means the sheet was typed month/day but opened as day/month: Excel swapped day and month on every date with a day of 12 or less
              (January 5 became May 1), and those look normal. Retype the Date column as YYYY-MM-DD and upload again.
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, color: 'var(--white)', cursor: 'pointer' }}>
                <input type="checkbox" checked={datesOk} onChange={e => setDatesOk(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--gold)' }} />
                I checked the dates in this file and they are right
              </label>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <CustomSelect value={show} onChange={setShow} style={{ width: 190 }} options={[{ value: 'all', label: `All rows (${check.rows.length})` }, { value: 'bad', label: `Errors (${check.bad})` }, { value: 'warn', label: `Check these (${check.warned})` }]} />
            <span style={{ fontSize: 12, color: 'var(--gray)' }}>{fileName}</span>
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table className="pmp-rt" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr>{['Row', 'Date', 'Product', 'Channel', 'Qty', 'Price', 'Cost', 'Total', 'Check'].map(h => <th key={h} style={{ ...S.th }}>{h}</th>)}</tr></thead>
              <tbody>
                {shown.length === 0 ? <tr><td colSpan={9}><EmptyState message="Nothing here" sub="Pick another filter." /></td></tr> : shown.slice(0, 500).map(r => (
                  <tr key={r.row} style={{ ...S.tr, background: r.errors.length ? 'var(--st-red-bg)' : r.warnings.length ? 'var(--st-orange-bg)' : undefined }}>
                    <td style={{ ...S.td, color: 'var(--gray)' }}>{r.row}</td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{r.clean.date || rows[r.row - 2]?.date || '-'}</td>
                    <td style={S.td}>{r.clean.productName || '-'}</td>
                    <td style={S.td}>{r.clean.channel}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{r.clean.quantity || '-'}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{peso(r.clean.unitPrice)}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{peso(r.clean.costPerUnit)}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{peso(r.clean.total)}</td>
                    <td style={{ ...S.td, fontSize: 12, color: r.errors.length ? 'var(--st-red-fg)' : 'var(--st-orange-fg)', minWidth: 220 }}>
                      {r.errors.length ? r.errors.join(' ') : r.warnings.join(' ') || <span style={{ color: 'var(--st-green-fg)' }}>OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length > 500 && <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 6 }}>Showing the first 500 of {shown.length}.</div>}
        </>
      )}
    </Modal>
  );
}

// ── The tab ──────────────────────────────────────────────────────────────────
export default function RecordedSales({ token, toast }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [batch, setBatch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [catalog, setCatalog] = useState([]);
  const [recording, setRecording] = useState(null);   // null | 'new' | row
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, Accept: 'application/json' }), [token]);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ search, batch, page: String(page), perPage: String(perPage) });
      const res = await fetchWithTimeout(`${API_URL}/api/admin/sales/manual?${qs}`, { headers }, 20000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || 'Could not load recorded sales.');
      setData(d.data); setError('');
    } catch (e) { setError(e.message); }
  }, [headers, search, batch, page, perPage]);
  useEffect(() => { if (token) load(); }, [token, load]);
  useEffect(() => { setPage(1); }, [search, batch]);
  useEffect(() => {
    if (!token || !data?.canRecord || catalog.length) return;
    fetchWithTimeout(`${API_URL}/api/admin/sales/manual/catalog`, { headers }, 20000)
      .then(r => r.json()).then(d => setCatalog(Array.isArray(d?.data) ? d.data : [])).catch(() => {});
  }, [token, data?.canRecord, headers, catalog.length]);

  const done = (msg) => { setRecording(null); setImporting(false); setNote(msg); toast?.(msg, 'success'); load(); };
  const undo = async (b) => {
    const res = await fetchWithTimeout(`${API_URL}/api/admin/sales/manual/import/${b.id}/undo`, { method: 'POST', headers }, 60000);
    const d = await res.json().catch(() => ({}));
    setNote(d.message || (res.ok ? 'Import undone.' : 'Could not undo.'));
    if (res.ok) { if (batch === b.id) setBatch(''); load(); }
  };
  const [undoing, setUndoing] = useState(null);
  const remove = async () => {
    if (!reason.trim()) return;
    const res = await fetchWithTimeout(`${API_URL}/api/admin/sales/manual/${removing.id}`, {
      method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }, 20000);
    const d = await res.json().catch(() => ({}));
    setNote(d.message || ''); setRemoving(null); setReason('');
    if (res.ok) load();
  };

  const rows = data?.rows ?? [];
  const batches = data?.batches ?? [];
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 160px' }}><SummaryCard label="Recorded by hand" value={data ? peso(data.revenue) : '-'} sub={data ? `${data.total} line${data.total === 1 ? '' : 's'}${batch ? ' in this import' : ''}` : ''} accent /></div>
        <div style={{ flex: '1 1 160px' }}><SummaryCard label="Gross profit" value={data ? peso(data.revenue - data.cost) : '-'} sub={data && data.revenue ? `${Math.round(((data.revenue - data.cost) / data.revenue) * 100)}% margin` : ''} color="var(--st-green-fg)" /></div>
      </div>

      <div style={{ ...S.card, ...S.rowBetween, marginBottom: 10, padding: '12px 16px', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ ...S.row, gap: 8, flex: 1, flexWrap: 'wrap' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search product..." style={{ width: 240 }} />
          <CustomSelect value={batch} onChange={setBatch} style={{ width: 230 }}
            options={[{ value: '', label: 'All recorded sales' }, ...batches.filter(b => !b.undoneAt).map(b => ({ value: b.id, label: `Import: ${b.fileName} (${b.rows})` }))]} />
        </div>
        {data?.canRecord && (
          <div style={{ ...S.row, gap: 8 }}>
            <button type="button" onClick={() => setImporting(true)} style={btn}>Import sales</button>
            <button type="button" onClick={() => setRecording('new')} style={btnGold}>+ Record sale</button>
          </div>
        )}
      </div>

      {note && <div style={{ ...S.note, marginBottom: 10 }}>{note}</div>}
      {error && <div style={{ ...S.note, background: 'var(--st-red-bg)', color: 'var(--st-red-fg)', marginBottom: 10 }}>{error}</div>}

      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="pmp-rt" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Date', 'Product', 'Channel', 'Qty', 'Sale', 'Cost', 'Profit', ''].map((h, i) => <th key={i} style={{ ...S.th, textAlign: i >= 3 && i <= 6 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {!data ? <tr><td colSpan={8} style={{ ...S.td, color: 'var(--gray)' }}>Loading...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={8}><EmptyState message="No recorded sales" sub={data.canRecord ? 'Record one, or import a spreadsheet.' : 'Nothing has been recorded by hand yet.'} /></td></tr>
                : rows.map(r => (
                  <tr key={r.id} style={S.tr}>
                    <td style={{ ...S.td, whiteSpace: 'nowrap', color: 'var(--gray)', fontSize: 12.5 }}>{r.date}</td>
                    <td style={{ ...S.td, fontWeight: 500 }}>{r.productName}
                      {(r.notes || r.importBatch) && <div style={{ fontSize: 11, color: 'var(--gray)' }}>{[r.importBatch ? 'Imported' : '', r.notes].filter(Boolean).join(' - ')}</div>}</td>
                    <td style={{ ...S.td, fontSize: 12.5 }}>{r.channel || '-'}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{r.quantity}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{peso(r.total)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: 'var(--gray)' }}>{peso(r.cost)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: r.profit >= 0 ? 'var(--st-green-fg)' : 'var(--st-red-fg)', fontWeight: 600 }}>{peso(r.profit)}</td>
                    <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {data.canRecord && <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" onClick={() => setRecording(r)} style={S.btnSmGhost}>Edit</button>
                        <button type="button" onClick={() => { setRemoving(r); setReason(''); }} style={{ ...S.btnSmGhost, color: 'var(--st-red-fg)' }}>Remove</button>
                      </span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {data?.total > 0 && <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <PaginationBar total={data.total} page={page} perPage={perPage} onPage={setPage} onPerPage={n => { setPerPage(n); setPage(1); }} />
        </div>}
      </div>

      {data?.canRecord && batches.length > 0 && (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden', marginTop: 14 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Recent imports</div>
            <div style={{ fontSize: 11.5, color: 'var(--gray)' }}>Undo takes every sale of that file back out - for the wrong file or wrong numbers.</div>
          </div>
          {batches.map((b, i) => (
            <div key={b.id} style={{ ...S.rowBetween, padding: '10px 16px', borderTop: i ? '1px solid var(--border)' : 'none', gap: 10, flexWrap: 'wrap', opacity: b.undoneAt ? 0.55 : 1 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, overflowWrap: 'anywhere' }}>{b.fileName}</div>
                <div style={{ fontSize: 11.5, color: 'var(--gray)' }}>
                  {b.rows} sales, {peso(b.revenue)} - {b.firstDate} to {b.lastDate} - by {b.byName || 'staff'}{b.undoneAt ? ' - undone' : ''}
                </div>
              </div>
              {!b.undoneAt && (undoing === b.id
                ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--st-red-fg)' }}>Remove all {b.rows} sales?</span>
                    <button type="button" onClick={() => { setUndoing(null); undo(b); }} style={{ ...S.btnSmGhost, color: 'var(--st-red-fg)' }}>Yes, undo</button>
                    <button type="button" onClick={() => setUndoing(null)} style={S.btnSmGhost}>Keep</button>
                  </span>
                : <button type="button" onClick={() => setUndoing(b.id)} style={S.btnSmGhost}>Undo import</button>)}
            </div>
          ))}
        </div>
      )}

      {recording && <RecordSaleModal token={token} catalog={catalog} editing={recording === 'new' ? null : recording} onClose={() => setRecording(null)} onSaved={done} />}
      {importing && <ImportModal token={token} onClose={() => setImporting(false)} onDone={done} />}
      {removing && (
        <Modal title="Remove this recorded sale?" onClose={() => setRemoving(null)}
          sub={`${removing.quantity} x ${removing.productName} on ${removing.date}, ${peso(removing.total)}. It comes out of Sales, Reports and the forecast. The reason goes in the audit log.`}
          footer={<>
            <button type="button" onClick={() => setRemoving(null)} style={btn}>Keep it</button>
            <button type="button" onClick={remove} disabled={!reason.trim()} style={{ ...btn, color: 'var(--st-red-fg)', borderColor: 'var(--st-red-fg)', opacity: reason.trim() ? 1 : 0.5 }}>Remove</button>
          </>}>
          <label style={label} htmlFor="rm-reason">Why?</label>
          <input id="rm-reason" value={reason} maxLength={200} autoFocus placeholder="e.g. recorded twice" onChange={e => setReason(e.target.value)} style={input} />
        </Modal>
      )}
    </div>
  );
}
