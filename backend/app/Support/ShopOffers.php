<?php

namespace App\Support;

use App\Models\Order;
use App\Models\User;

/**
 * The two standing offers the shop runs on its own, without a code being typed.
 *
 *   Free delivery once the goods reach a figure  (Settings > Shipping)
 *   A discount on somebody's first order         (Promotions > First order)
 *
 * Both are off until the owner fills the box in, and both come off the GOODS only - never the
 * design fee, the rush fee or the courier, which is the same rule a voucher already follows.
 *
 * Why one class: four different screens create an order (COD checkout, the payment link, the
 * payment intent, and the quote conversion) and each already carried its own copy of the voucher
 * arithmetic. Adding two more offers by hand in each would guarantee they drifted - one path
 * eventually giving a discount another refused. This is the whole rule, once, and the order of
 * operations is fixed here rather than in whichever controller was edited last.
 *
 * Order of operations, decided and kept:
 *
 *   1. goods            the lines, already at flash-sale prices (PriceResolver did that)
 *   2. first order      pct% of goods, never more than the cap
 *   3. voucher          worked out by the caller on the same goods figure
 *   4. together         the two are capped at the goods - a bill can go to zero, never below
 *   5. free delivery    decided on what is LEFT after both, so the shop is not shipping free
 *                       against a figure the order never really reached
 *   6. deposit          the caller works it out after all of this, so nobody is asked for a
 *                       percentage of a price that is about to drop
 *
 * NEITHER offer touches a quotation. A quote is a price the shop already negotiated by hand;
 * discounting it again eats the same margin twice, and the customer never saw an offer on it.
 */
class ShopOffers
{
    /** The goods figure at which delivery stops being charged. Null = the shop is not running it. */
    public static function freeDeliveryFrom(): ?float
    {
        $v = ShopSettings::get('freeDeliveryFrom', null);
        if ($v === null || $v === '') return null;
        $v = (float) $v;
        return $v > 0 ? round($v, 2) : null;
    }

    /** Percent off a first order. 0 = the shop is not running it. */
    public static function firstOrderPercent(): int
    {
        $v = (int) ShopSettings::get('firstOrderPercent', 0);
        return $v > 0 && $v <= 100 ? $v : 0;
    }

    /** The most a first-order discount may take off. Null = uncapped. */
    public static function firstOrderCap(): ?float
    {
        $v = ShopSettings::get('firstOrderCap', null);
        if ($v === null || $v === '') return null;
        $v = (float) $v;
        return $v > 0 ? round($v, 2) : null;
    }

    /**
     * Has this customer ordered before?
     *
     * A checkout that was started and never paid is not an order - it is a row this system writes
     * before sending somebody to the payment page, and it is swept away later. Nor is one that was
     * cancelled: a customer who backed out of their first attempt has still not bought anything,
     * and burning their welcome discount on it is the kind of thing that ends up in chat.
     *
     * Everything else counts, a converted quotation included. The offer welcomes a new customer,
     * and somebody the shop has already served is not one.
     */
    public static function isFirstOrder(?User $user): bool
    {
        if (!$user) return false;

        return Order::where('userId', (string) $user->_id)
            ->where('checkoutPending', '!=', true)
            ->where('voidedCheckout', '!=', true)
            ->whereNotIn('orderStatus', OrderStatus::spellings(OrderStatus::CANCELLED))
            ->limit(1)
            ->count() === 0;
    }

    /**
     * Everything the two offers do to one bill, worked out once.
     *
     * @param  float      $goods            the lines, before any discount
     * @param  float      $voucherDiscount  what the caller's voucher already takes off the goods
     * @param  User|null  $user             who is buying - null means nobody, so no first order
     * @param  bool|null  $firstOrder       pass a known answer to skip the database lookup
     *
     * @return array{firstOrder: float, firstOrderPercent: int|null, firstOrderCap: float|null,
     *               voucher: float, netGoods: float, freeDelivery: bool, freeDeliveryFrom: float|null,
     *               shortOfFreeDelivery: float|null}
     */
    public static function forCheckout(float $goods, float $voucherDiscount = 0.0, ?User $user = null, ?bool $firstOrder = null): array
    {
        $pct = self::firstOrderPercent();

        return self::apply(
            $goods,
            $voucherDiscount,
            // Only ask the database when the offer is actually running.
            $pct > 0 && ($firstOrder ?? self::isFirstOrder($user)),
            $pct,
            self::firstOrderCap(),
            self::freeDeliveryFrom()
        );
    }

    /**
     * The arithmetic on its own - no settings, no database, no customer. forCheckout() looks the
     * rule up and hands it here; a test can hand it any rule it likes. Keeping the sums somewhere
     * they can be checked without a live shop behind them is the whole point of the split.
     */
    public static function apply(float $goods, float $voucherDiscount, bool $isFirst, int $pct, ?float $cap, ?float $freeFrom): array
    {
        $goods   = round(max(0.0, $goods), 2);
        $voucher = round(max(0.0, $voucherDiscount), 2);
        $pct     = $pct > 0 && $pct <= 100 ? $pct : 0;
        $isFirst = $isFirst && $pct > 0;

        $first = 0.0;
        if ($isFirst && $goods > 0) {
            $first = round($goods * $pct / 100, 2);
            if ($cap !== null) $first = min($first, $cap);
        }

        // Two discounts may stack - a new customer holding a code is exactly who the shop wants -
        // but together they can only ever reach the goods, never past them into the fees.
        if ($first + $voucher > $goods) {
            $first = round(max(0.0, $goods - $voucher), 2);
        }

        $netGoods = round(max(0.0, $goods - $first - $voucher), 2);

        $from  = $freeFrom !== null && $freeFrom > 0 ? round($freeFrom, 2) : null;
        $free  = $from !== null && $netGoods >= $from;
        $short = ($from !== null && !$free) ? round($from - $netGoods, 2) : null;

        return [
            'firstOrder'          => $first,
            'firstOrderPercent'   => $first > 0 ? $pct : null,
            'firstOrderCap'       => $first > 0 ? $cap : null,
            'voucher'             => $voucher,
            'netGoods'            => $netGoods,
            'freeDelivery'        => $free,
            'freeDeliveryFrom'    => $from,
            'shortOfFreeDelivery' => $short,
        ];
    }

    /**
     * What gets written onto the order, so the receipt, the chat and the admin screens all read the
     * same decision months later - and so a change to the setting can never rewrite an old bill.
     */
    public static function snapshot(array $offers): array
    {
        return [
            'firstOrderDiscount' => $offers['firstOrder'] > 0 ? $offers['firstOrder'] : null,
            'firstOrderPercent'  => $offers['firstOrderPercent'],
            'firstOrderCap'      => $offers['firstOrderCap'],
            'freeDelivery'       => (bool) $offers['freeDelivery'],
            'freeDeliveryFrom'   => $offers['freeDelivery'] ? $offers['freeDeliveryFrom'] : null,
        ];
    }
}
