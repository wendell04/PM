<?php

namespace App\Support;

/**
 * One answer to "is this cash on delivery".
 *
 * The paymentMethod field is written by six different paths with six different vocabularies -
 * 'cod' from the shop checkout, 'online' from the payment intent flow, 'gcash'/'paymaya'/'card'
 * from the webhook handlers, and null from anything that forgot. Ten places then compared it to
 * the literal 'cod', one of them without lowercasing first, so a value of 'COD' passed nine
 * checks and failed the tenth. A COD order that reads as prepaid is not a cosmetic problem: it
 * is told it already paid for goods it has not paid for, and it is never marked collected on
 * delivery.
 */
final class PaymentMethod
{
    /** Every spelling of cash on delivery that has been seen in, or could reach, the database. */
    private const COD_ALIASES = [
        'cod',
        'cash_on_delivery',
        'cash-on-delivery',
        'cash on delivery',
        'cashondelivery',
    ];

    public static function isCod($method): bool
    {
        $normal = strtolower(trim((string) ($method ?? '')));

        return $normal !== '' && in_array($normal, self::COD_ALIASES, true);
    }
}
