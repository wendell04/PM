// ── MOCK DATA — inventory-v2 prototype ───────────────────────────────────────
// Replace with real API calls once prototype is approved.

export const initVendors = [
  { id:'v1', name:'Tiara Garments Supply',  contact:'0917-123-4567', email:'tiara@supply.ph',     address:'Divisoria, Manila',    itemsSupplied:['Garments','Bags'] },
  { id:'v2', name:'PrintMart Philippines',  contact:'0918-234-5678', email:'sales@printmart.ph',  address:'Quiapo, Manila',       itemsSupplied:['Print Materials'] },
  { id:'v3', name:'Sublimation Hub PH',     contact:'0919-345-6789', email:'orders@sublimhub.ph', address:'Binondo, Manila',      itemsSupplied:['Drinkware','Print Materials'] },
  { id:'v4', name:'Accessories Depot',      contact:'0920-456-7890', email:'info@accsdepot.ph',   address:'Caloocan City',        itemsSupplied:['Accessories','Office'] },
];

export const initMaterials = [
  { id:'m1',  sku:'GAR-0001', name:'Blank White T-Shirt',   unit:'pcs',    category:'Garments',       vendorId:'v1', baseCost:95,  minStock:30  },
  { id:'m2',  sku:'GAR-0002', name:'Blank Black T-Shirt',   unit:'pcs',    category:'Garments',       vendorId:'v1', baseCost:100, minStock:30  },
  { id:'m3',  sku:'PRT-0001', name:'Sublimation Paper A4',  unit:'sheets', category:'Print Materials',vendorId:'v2', baseCost:4,   minStock:200 },
  { id:'m4',  sku:'PRT-0002', name:'DTF Film Roll',         unit:'meters', category:'Print Materials',vendorId:'v2', baseCost:85,  minStock:20  },
  { id:'m5',  sku:'DRW-0001', name:'Inner Color Mug 11oz',  unit:'pcs',    category:'Drinkware',      vendorId:'v3', baseCost:65,  minStock:20  },
  { id:'m6',  sku:'PKG-0001', name:'Mug Gift Box',          unit:'pcs',    category:'Packaging',      vendorId:'v3', baseCost:15,  minStock:20  },
  { id:'m7',  sku:'ACC-0001', name:'Button Pin Base 2.25"', unit:'pcs',    category:'Accessories',    vendorId:'v4', baseCost:8,   minStock:100 },
  { id:'m8',  sku:'PRT-0003', name:'Sticker Vinyl Roll',    unit:'meters', category:'Print Materials',vendorId:'v2', baseCost:120, minStock:10  },
  { id:'m9',  sku:'BAG-0001', name:'Eco Bag Canvas',        unit:'pcs',    category:'Bags',           vendorId:'v1', baseCost:55,  minStock:15  },
  { id:'m10', sku:'ACC-0002', name:'Mousepad Base 22x18',   unit:'pcs',    category:'Accessories',    vendorId:'v4', baseCost:45,  minStock:10  },
  { id:'m11', sku:'ACC-0003', name:'Ref Magnet Blank',      unit:'pcs',    category:'Accessories',    vendorId:'v4', baseCost:12,  minStock:50  },
  { id:'m12', sku:'OFF-0001', name:'Ballpen Body',          unit:'pcs',    category:'Office',         vendorId:'v4', baseCost:18,  minStock:100 },
  { id:'m13', sku:'DRW-0002', name:'Ceramic Mug White 11oz',      unit:'pcs', category:'Drinkware', vendorId:'v3', baseCost:55,  minStock:20 },
  { id:'m14', sku:'DRW-0003', name:'Black Inner Color Mug 11oz',  unit:'pcs', category:'Drinkware', vendorId:'v3', baseCost:68,  minStock:20 },
  { id:'m15', sku:'DRW-0004', name:'Red Inner Color Mug 11oz',    unit:'pcs', category:'Drinkware', vendorId:'v3', baseCost:68,  minStock:20 },
  { id:'m16', sku:'DRW-0005', name:'Magic Mug 11oz',              unit:'pcs', category:'Drinkware', vendorId:'v3', baseCost:85,  minStock:15 },
];

// Each batch = one stock receive event.
// remainingQty = qtyReceived minus FIFO deductions from stock outs/reductions.
export const initBatches = [
  // White T-Shirt — 2 batches (different unit costs)
  { id:'bt1',  matId:'m1',  invoiceNo:'OR-2025-001', date:'2025-03-15', vendorId:'v1', vendorName:'Tiara Garments Supply', qtyReceived:80,  unitCost:92,  remainingQty:75,  notes:'' },
  { id:'bt2',  matId:'m1',  invoiceNo:'OR-2025-008', date:'2025-04-10', vendorId:'v1', vendorName:'Tiara Garments Supply', qtyReceived:50,  unitCost:95,  remainingQty:45,  notes:'Price increase from supplier' },
  // Black T-Shirt
  { id:'bt3',  matId:'m2',  invoiceNo:'OR-2025-001', date:'2025-03-15', vendorId:'v1', vendorName:'Tiara Garments Supply', qtyReceived:85,  unitCost:100, remainingQty:85,  notes:'' },
  // Sublimation Paper — 2 batches
  { id:'bt4',  matId:'m3',  invoiceNo:'OR-2025-002', date:'2025-04-05', vendorId:'v2', vendorName:'PrintMart Philippines', qtyReceived:300, unitCost:4,   remainingQty:280, notes:'' },
  { id:'bt5',  matId:'m3',  invoiceNo:'OR-2025-009', date:'2025-04-20', vendorId:'v3', vendorName:'Sublimation Hub PH',    qtyReceived:200, unitCost:4.5, remainingQty:200, notes:'Switched supplier — slight price diff' },
  // DTF Film Roll (low stock)
  { id:'bt6',  matId:'m4',  invoiceNo:'OR-2025-003', date:'2025-03-28', vendorId:'v2', vendorName:'PrintMart Philippines', qtyReceived:20,  unitCost:85,  remainingQty:18,  notes:'' },
  // Mugs
  { id:'bt7',  matId:'m5',  invoiceNo:'OR-2025-004', date:'2025-04-08', vendorId:'v3', vendorName:'Sublimation Hub PH',    qtyReceived:65,  unitCost:65,  remainingQty:60,  notes:'' },
  // Mug Boxes
  { id:'bt8',  matId:'m6',  invoiceNo:'OR-2025-004', date:'2025-04-08', vendorId:'v3', vendorName:'Sublimation Hub PH',    qtyReceived:60,  unitCost:15,  remainingQty:55,  notes:'' },
  // Button Pins
  { id:'bt9',  matId:'m7',  invoiceNo:'OR-2025-005', date:'2025-04-02', vendorId:'v4', vendorName:'Accessories Depot',     qtyReceived:300, unitCost:8,   remainingQty:300, notes:'' },
  // Sticker Roll (low stock)
  { id:'bt10', matId:'m8',  invoiceNo:'OR-2025-003', date:'2025-03-28', vendorId:'v2', vendorName:'PrintMart Philippines', qtyReceived:10,  unitCost:120, remainingQty:8,   notes:'' },
  // Eco Bags
  { id:'bt11', matId:'m9',  invoiceNo:'OR-2025-001', date:'2025-03-15', vendorId:'v1', vendorName:'Tiara Garments Supply', qtyReceived:40,  unitCost:55,  remainingQty:40,  notes:'' },
  // Mousepads
  { id:'bt12', matId:'m10', invoiceNo:'OR-2025-006', date:'2025-04-03', vendorId:'v4', vendorName:'Accessories Depot',     qtyReceived:25,  unitCost:45,  remainingQty:25,  notes:'' },
  // Ref Magnets
  { id:'bt13', matId:'m11', invoiceNo:'OR-2025-006', date:'2025-04-03', vendorId:'v4', vendorName:'Accessories Depot',     qtyReceived:150, unitCost:12,  remainingQty:150, notes:'' },
  // Ballpens
  { id:'bt14', matId:'m12', invoiceNo:'OR-2025-007', date:'2025-04-01', vendorId:'v4', vendorName:'Accessories Depot',     qtyReceived:200, unitCost:18,  remainingQty:200, notes:'' },
  // Ceramic Mug White 11oz
  { id:'bt15', matId:'m13', invoiceNo:'OR-2025-010', date:'2025-04-15', vendorId:'v3', vendorName:'Sublimation Hub PH',    qtyReceived:50,  unitCost:55,  remainingQty:48,  notes:'' },
  // Black Inner Color Mug 11oz
  { id:'bt16', matId:'m14', invoiceNo:'OR-2025-010', date:'2025-04-15', vendorId:'v3', vendorName:'Sublimation Hub PH',    qtyReceived:40,  unitCost:68,  remainingQty:40,  notes:'' },
  // Red Inner Color Mug 11oz
  { id:'bt17', matId:'m15', invoiceNo:'OR-2025-010', date:'2025-04-15', vendorId:'v3', vendorName:'Sublimation Hub PH',    qtyReceived:30,  unitCost:68,  remainingQty:28,  notes:'' },
  // Magic Mug 11oz
  { id:'bt18', matId:'m16', invoiceNo:'OR-2025-011', date:'2025-04-20', vendorId:'v3', vendorName:'Sublimation Hub PH',    qtyReceived:25,  unitCost:85,  remainingQty:22,  notes:'' },
];

// type: damaged | defective | shortage | wrong_item | expired
// status: pending | replaced | written_off
export const initBadOrders = [
  { id:'bo1', batchId:'bt4',  matId:'m3',  matName:'Sublimation Paper A4',  invoiceNo:'OR-2025-002', date:'2025-04-05', qty:20, type:'shortage',   notes:'20 sheets short in one ream', status:'pending',    resolvedDate:null, resolvedNotes:'' },
  { id:'bo2', batchId:'bt7',  matId:'m5',  matName:'Inner Color Mug 11oz',  invoiceNo:'OR-2025-004', date:'2025-04-08', qty:5,  type:'damaged',    notes:'Broken during shipping',      status:'replaced',   resolvedDate:'2025-04-12', resolvedNotes:'Vendor sent 5 replacement mugs via courier' },
  { id:'bo3', batchId:'bt6',  matId:'m4',  matName:'DTF Film Roll',         invoiceNo:'OR-2025-003', date:'2025-03-28', qty:2,  type:'defective',  notes:'Splice defects on 2 rolls',   status:'pending',    resolvedDate:null, resolvedNotes:'' },
  { id:'bo4', batchId:'bt2',  matId:'m1',  matName:'Blank White T-Shirt',   invoiceNo:'OR-2025-008', date:'2025-04-10', qty:5,  type:'wrong_item', notes:'Received gray instead of white', status:'pending', resolvedDate:null, resolvedNotes:'' },
];

// type: adjustment | production
// reason: production | damaged | lost | write_off | quality_check | other
export const initStockOuts = [
  { id:'so1', ref:'JO-2025-045', type:'production', matId:'m7',  matName:'Button Pin Base 2.25"', date:'2025-04-12', qty:0,  reason:'production', unitCost:8,  totalCost:0,   notes:'JO-2025-045 batch' },
  { id:'so2', ref:'ADJ-001',     type:'adjustment', matId:'m5',  matName:'Inner Color Mug 11oz',  date:'2025-04-08', qty:5,  reason:'write_off',  unitCost:65, totalCost:325, notes:'Broken mugs from bad order batch — written off' },
  { id:'so3', ref:'JO-2025-048', type:'production', matId:'m3',  matName:'Sublimation Paper A4',  date:'2025-04-15', qty:20, reason:'production', unitCost:4,  totalCost:80,  notes:'JO-2025-048 batch' },
  { id:'so4', ref:'ADJ-002',     type:'adjustment', matId:'m1',  matName:'Blank White T-Shirt',   date:'2025-04-16', qty:5,  reason:'damaged',    unitCost:95, totalCost:475, notes:'Water damage in stockroom' },
];

// resolutionType: credit | replacement | pending
// status: pending | completed
export const initReturns = [
  { id:'ret1', matId:'m4',  matName:'DTF Film Roll',        vendorId:'v2', vendorName:'PrintMart Philippines', date:'2025-03-30', qty:2,  unitCost:85,  totalValue:170,  reason:'Defective — splice defects',      resolutionType:'replacement', replacementQty:0, notes:'Awaiting vendor replacement',  status:'pending',   linkedBadOrderId:'bo3' },
  { id:'ret2', matId:'m3',  matName:'Sublimation Paper A4', vendorId:'v2', vendorName:'PrintMart Philippines', date:'2025-04-06', qty:20, unitCost:4,   totalValue:80,   reason:'Shortage — 20 sheets unreceived', resolutionType:'credit',      replacementQty:0, notes:'Credit applied to next order', status:'completed', linkedBadOrderId:'bo1' },
];

export const initBoms = [
  { id:'b1', productName:'Custom White T-Shirt',   items:[{ matId:'m1', qty:1 },{ matId:'m3', qty:1 }] },
  { id:'b2', productName:'Custom Black T-Shirt',   items:[{ matId:'m2', qty:1 },{ matId:'m3', qty:1 }] },
  { id:'b3',  productName:'Custom Mug 11oz (legacy)',      items:[{ matId:'m5',  qty:1 },{ matId:'m6', qty:1 },{ matId:'m3', qty:1 }] },
  { id:'b8',  productName:'Ceramic Mug 11oz',             items:[{ matId:'m13', qty:1 },{ matId:'m6', qty:1 },{ matId:'m3', qty:1 }] },
  { id:'b9',  productName:'Inner Color Mug 11oz - Black', items:[{ matId:'m14', qty:1 },{ matId:'m6', qty:1 },{ matId:'m3', qty:1 }] },
  { id:'b10', productName:'Inner Color Mug 11oz - Red',   items:[{ matId:'m15', qty:1 },{ matId:'m6', qty:1 },{ matId:'m3', qty:1 }] },
  { id:'b11', productName:'Magic Mug 11oz',               items:[{ matId:'m16', qty:1 },{ matId:'m6', qty:1 },{ matId:'m3', qty:1 }] },
  { id:'b4', productName:'Custom Button Pin 2.25"', items:[{ matId:'m7', qty:1 }] },
  { id:'b5', productName:'Custom Eco Bag',          items:[{ matId:'m9', qty:1 }] },
  { id:'b6', productName:'Custom Mousepad',         items:[{ matId:'m10', qty:1 },{ matId:'m3', qty:1 }] },
  { id:'b7', productName:'Custom Ref Magnet',       items:[{ matId:'m11', qty:1 }] },
];
