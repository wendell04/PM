'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { S, TabBar, ToastContainer, useToast } from './shared';
import { loadInventory, loadSuppliers, loadBoms, loadReturns, loadStockOuts, loadAdminProducts } from './api';

const INIT_CATEGORIES = ['Garments','Print Materials','Drinkware','Packaging','Accessories','Bags','Office','Other'];
const INIT_UNITS      = ['pcs','sheets','meters','rolls','boxes','packs','sets','kg','liters'];

import MaterialsTab       from './MaterialsTab';
import VendorsTab         from './VendorsTab';
import ProductCreationTab from './ProductCreationTab';
import ProductStockTab    from './ProductStockTab';
import StockInTab         from './StockInTab';
import GoodsStockTab      from './GoodsStockTab';
import ActualStockTab     from './ActualStockTab';
import BadOrdersTab       from './BadOrdersTab';

const TAB_GROUPS = {
  'master-data': [
    { id:'materials',    label:'Materials'        },
    { id:'vendors',      label:'Vendors'          },
    { id:'bom',          label:'Product Creation' },
  ],
  'overview': [
    { id:'productstock', label:'Product Stock'    },
    { id:'stockin',      label:'Stock In'         },
    { id:'goods',        label:'Goods Stock'      },
    { id:'actual',       label:'Actual Stock'     },
  ],
  'badorders': [
    { id:'badorders',    label:'Bad Orders'       },
  ],
};

function getSection(tabId) {
  for (const [section, tabs] of Object.entries(TAB_GROUPS)) {
    if (tabs.some(t => t.id === tabId)) return section;
  }
  return 'master-data';
}

export default function InventoryV2() {
  const { token } = useAuth();
  const searchParams = useSearchParams();

  const [tab,        setTab]        = useState(() => searchParams.get('tab') || 'materials');
  const [materials,  setMaterials]  = useState([]);
  const [vendors,    setVendors]    = useState([]);
  const [boms,       setBoms]       = useState([]);
  const [products,   setProducts]   = useState([]);
  const [batches,    setBatches]    = useState([]);
  const [badOrders,  setBadOrders]  = useState([]);
  const [stockOuts,  setStockOuts]  = useState([]);
  const [categories, setCategories] = useState(INIT_CATEGORIES);
  const [units,      setUnits]      = useState(INIT_UNITS);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t) setTab(t);
  }, [searchParams]);

  const { toasts, push: toast, dismiss } = useToast();

  const refresh = useCallback(async (keys = ['all']) => {
    if (!token) return;
    const targets = keys.includes('all')
      ? ['materials','vendors','boms','products','badOrders','stockOuts']
      : keys;
    const results = await Promise.allSettled(targets.map(async key => {
      if (key === 'materials') {
        const { mats, bats } = await loadInventory(token);
        setMaterials(mats);
        setBatches(bats);
      } else if (key === 'vendors') {
        setVendors(await loadSuppliers(token));
      } else if (key === 'boms') {
        setBoms(await loadBoms(token));
      } else if (key === 'products') {
        setProducts(await loadAdminProducts(token));
      } else if (key === 'badOrders') {
        setBadOrders(await loadReturns(token));
      } else if (key === 'stockOuts') {
        setStockOuts(await loadStockOuts(token));
      }
    }));
    const failed = results.find(r => r.status === 'rejected');
    if (failed) toast(failed.reason?.message ?? 'Some data failed to load.', 'error');
  }, [token, toast]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    refresh(['all']).finally(() => setLoading(false));
  }, [token]);

  const pending_bo = badOrders.filter(b => b.status === 'pending').length;
  const section    = getSection(tab);
  const visibleTabs = TAB_GROUPS[section].map(t =>
    t.id === 'badorders' ? { ...t, count: pending_bo || undefined } : t
  );

  const SECTION_LABELS = { 'master-data':'Master Data', 'overview':'Overview', 'badorders':'Bad Orders' };

  return (
    <div style={S.page}>
      <div style={{ marginBottom:'20px' }}>
        <TabBar tabs={visibleTabs} active={tab} onChange={setTab} />
      </div>

      {tab === 'materials'  && (
        <MaterialsTab
          materials={materials} setMaterials={setMaterials}
          vendors={vendors} setVendors={setVendors}
          batches={batches}
          boms={boms}
          categories={categories} setCategories={setCategories}
          units={units} setUnits={setUnits}
          token={token} onRefresh={refresh} toast={toast}
        />
      )}
      {tab === 'vendors'    && (
        <VendorsTab
          vendors={vendors} setVendors={setVendors}
          materials={materials}
          categories={categories}
          onAddCategory={cat => setCategories(prev => prev.includes(cat) ? prev : [...prev, cat])}
          token={token} onRefresh={refresh} toast={toast}
        />
      )}
      {tab === 'productstock' && (
        <ProductStockTab
          boms={boms}
          materials={materials}
          products={products}
        />
      )}
      {tab === 'bom'        && (
        <ProductCreationTab
          boms={boms} setBoms={setBoms}
          materials={materials}
          batches={batches}
          token={token} onRefresh={refresh} toast={toast}
        />
      )}
      {tab === 'stockin'    && (
        <StockInTab
          materials={materials}
          vendors={vendors}
          batches={batches}     setBatches={setBatches}
          badOrders={badOrders} setBadOrders={setBadOrders}
          token={token} onRefresh={refresh}
          toast={toast}
        />
      )}
      {tab === 'goods'      && (
        <GoodsStockTab
          materials={materials}
          batches={batches}
          badOrders={badOrders}
        />
      )}
      {tab === 'actual'     && (
        <ActualStockTab
          materials={materials}
          batches={batches}     setBatches={setBatches}
          badOrders={badOrders}
          stockOuts={stockOuts} setStockOuts={setStockOuts}
          token={token} onRefresh={refresh}
          toast={toast}
        />
      )}
      {tab === 'badorders'  && (
        <BadOrdersTab
          badOrders={badOrders} setBadOrders={setBadOrders}
          materials={materials}
          batches={batches}
          vendors={vendors}
          token={token} onRefresh={refresh}
          toast={toast}
        />
      )}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
