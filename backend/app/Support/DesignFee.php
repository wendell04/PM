<?php

namespace App\Support;

/**
 * What a customer pays for the shop to make the artwork.
 *
 * Two rules, chosen once in Settings (designFeeMode):
 *
 *   per_order  one fee for the whole order, the highest of the store fee and any product
 *              override - "one artwork across a mug and a totebag is one piece of work". Default.
 *   per_item   one fee for every line that asks for a design - two products with two different
 *              designs are two pieces of work, and the shop was doing the second for free.
 *
 * The system cannot tell one artwork from two, so it does not guess; the owner decides the rule.
 * Three copies of this arithmetic existed (paid checkout, COD checkout, the cart display) - one.
 */
class DesignFee
{
    public const PER_ORDER = 'per_order';
    public const PER_ITEM  = 'per_item';

    public static function mode(): string
    {
        return ShopSettings::get('designFeeMode', self::PER_ORDER) === self::PER_ITEM ? self::PER_ITEM : self::PER_ORDER;
    }

    public static function storeFee(): float
    {
        return max(0.0, (float) (ShopSettings::owner()->designRequestFee ?? 100));
    }

    /**
     * @param array<int, array> $designLines  order lines that asked for a design (each may carry designFee)
     */
    public static function forLines(array $designLines): float
    {
        $lines = array_values($designLines);
        if ($lines === []) return 0.0;

        $store    = self::storeFee();
        $lineFees = array_map(fn ($l) => max(0.0, (float) ($l['designFee'] ?? 0)), $lines);

        if (self::mode() === self::PER_ITEM) {
            // Each line pays its own override when it has one, the store fee otherwise.
            return round(array_sum(array_map(fn ($f) => $f > 0 ? $f : $store, $lineFees)), 2);
        }
        return round(max($store, ...$lineFees), 2);
    }
}
