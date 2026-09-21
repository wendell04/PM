<?php

namespace App\Support;

/**
 * An order-level discount, shared across the order's lines by value.
 *
 * Sales are recorded per line, and a voucher is taken off the whole order - so without this every
 * Sale row carried the undiscounted price and the discount never reached revenue or profit. The
 * shares add up to the discount exactly (the last line takes the rounding remainder).
 */
class DiscountAllocator
{
    /** @return array<int, float> index => share */
    public static function shares(array $lines, float $discount): array
    {
        $out = [];
        $discount = round(max(0.0, $discount), 2);
        $totals = array_map(fn ($l) => max(0.0, (float) ($l['lineTotal'] ?? 0)), array_values($lines));
        $sum = array_sum($totals);
        if ($discount <= 0 || $sum <= 0) return array_fill(0, count($totals), 0.0);

        $discount = min($discount, $sum);
        $given = 0.0;
        $last = count($totals) - 1;
        foreach ($totals as $i => $t) {
            $share = $i === $last ? round($discount - $given, 2) : round($discount * $t / $sum, 2);
            $out[$i] = $share;
            $given += $share;
        }
        return $out;
    }
}
