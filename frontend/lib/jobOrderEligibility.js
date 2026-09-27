import { normalizeStatus } from '@/lib/orderStatus';
import { isCodMethod } from '@/lib/paymentMethod';

// Statuses a custom order passes through before its artwork is settled. Nothing here can be
// produced yet, whatever the money says.
const PRE_APPROVAL = ['pending_review', 'pending_design', 'proof_sent', 'revision_requested', 'rejected'];

/**
 * Does this order still need a job order created?
 *
 * The Job Orders dropdown and the Home dashboard each had their own answer, and they disagreed:
 * Home counted anything paid and in processing, so it included ready-made orders that never need
 * a job order at all and custom orders whose design was not approved yet. It reported five things
 * needing attention when two could actually be created, which teaches the owner to distrust the
 * number. One definition, used by both.
 */
export function needsJobOrder(order) {
  if (!order || order.joId) return false;
  if (order.productionJobs?.length) return false;

  const st = normalizeStatus(order.orderStatus);
  if (['delivered', 'cancelled', 'returned'].includes(st)) return false;

  // COD is unpaid by definition until the rider collects, so it counts as committed.
  const paid = isCodMethod(order.paymentMethod)
    || ['partial', 'paid'].includes(order.paymentStatus)
    || Number(order.downPayment) > 0;
  if (!paid) return false;

  const isCustom = order.isCustomOrder ?? order.isCustom;
  const rawStatus = String(order.orderStatus || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (isCustom && PRE_APPROVAL.includes(rawStatus)) return false;

  // The real artwork gate, mirroring JobOrderController. Listing an order whose design is not
  // approved only moves the refusal to the moment the owner clicks Create.
  if (isCustom && order.designStatus && order.designStatus !== 'approved') return false;

  // Something on it has to actually be made. A stocked ready-made item ships from the shelf and
  // never sees a bench.
  if (!(order.items || []).some(it => it.isCustom || it.isMadeToOrder)) return false;

  // And at least one of those has its artwork settled - the same per-item rule the Create form
  // uses to let an item be ticked. A quotation keeps "awaiting design approval" on the ITEM, so
  // the order-level check above let paid, unapproved quotes into the list with nothing selectable.
  const needsDesign = (it) => !!it?.isCustom && !!(it?.designRequested || it?.designFiles?.length || it?.designUrl);
  const ready = (it) => !needsDesign(it) || (it?.designStatus ? it.designStatus === 'approved' : order.designStatus === 'approved');
  if (!(order.items || []).some(it => (it.isCustom || it.isMadeToOrder) && ready(it))) return false;

  return true;
}
