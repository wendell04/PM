<?php

namespace App\Support;

/**
 * One answer to "is this line produced, or does it ship from the shelf".
 *
 * The distinction decides what happens to inventory at every stage: a produced line RESERVES its
 * materials and consumes them at QC pass, while a ready-made line DEDUCTS them the moment the
 * order is placed. Get it wrong in one place and the two stop agreeing - which is how the
 * purchase list came to count ready-made demand a second time, against stock that had already
 * been taken for it.
 *
 * OrderController has held this logic privately since the beginning. It lives here now so that
 * anything asking the same question gets the same answer.
 */
final class OrderLine
{
    public static function isProduced($product, array $item): bool
    {
        if ((bool) ($product->isMadeToOrder ?? false)) {
            return true;
        }

        return !empty($item['designUrl'])
            || !empty($item['designFiles'])
            || !empty($item['designRequested'])
            || ($item['designMode'] ?? null) === 'request'
            || !empty($item['isCustom']);
    }
}
