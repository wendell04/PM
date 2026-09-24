/**
 * Where a quotation or an ask has actually got to.
 *
 * The stored `status` is not the whole answer: a quotation that has been paid is an order, one
 * whose date has passed is expired, and an ask the shop replied to is answered - which is written
 * two different ways depending on when it happened. This is the one place that decides, so the
 * list, the tiles and the counts cannot drift apart.
 */

export const STAGES = ['ask', 'quoted', 'accepted', 'expired', 'answered', 'cancelled'];

export function stageOf(req) {
  if (!req) return 'ask';
  if (req.convertedOrderId) return 'accepted';
  if (['downpayment_paid', 'partial', 'paid'].includes(String(req.paymentStatus ?? ''))) return 'accepted';
  const st = String(req.status ?? 'pending_review');
  // Two spellings, one meaning. Asks answered from 2026-09-24 are stored as 'answered'; everything
  // before that is 'cancelled' with answeredByQuoteId beside it. Reading only the old shape would
  // have shown every newly answered ask as one still waiting on the shop.
  if (st === 'answered' || (st === 'cancelled' && req.answeredByQuoteId)) return 'answered';
  if (st === 'cancelled') return 'cancelled';
  if (['processing', 'ready', 'delivered'].includes(st)) return 'accepted';   // legacy pipeline: work happened
  if (st === 'confirmed') {
    const t = req.expiresAt ? new Date(req.expiresAt) : null;
    if (t && !isNaN(t) && t < new Date()) return 'expired';
    return 'quoted';
  }
  return 'ask';
}

export default stageOf;
