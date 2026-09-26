<?php

namespace App\Support;

/**
 * What a settings save actually changed, as "Rush fee: 150 -> 200".
 *
 * The audit entry said "Changed the shipping and delivery settings" with `fields: []` - the list was
 * the keys present in the request that happened to be on a short list, so a save of the shop
 * address recorded nothing at all. An audit log is only worth keeping if it answers what changed
 * from what to what; this compares the record before and after the save, key by key.
 */
class SettingsDiff
{
    /** Readable names for the settings people change. Anything unlisted keeps its key. */
    public const LABELS = [
        'storeAddress' => 'Shop address', 'storeLat' => 'Map pin (lat)', 'storeLng' => 'Map pin (lng)',
        'designRequestFee' => 'Design fee', 'designFeeMode' => 'Design fee charged',
        'shippingMode' => 'Shipping method', 'shippingBaseRate' => 'Base delivery rate',
        'shippingPerKmRate' => 'Rate per km', 'shippingPerKmRateFar' => 'Rate per km (far)', 'shippingTierKm' => 'Near/far split (km)',
        'flatRateInsideMetro' => 'Flat rate - Metro Manila', 'flatRateOutsideMetro' => 'Flat rate - outside Metro',
        'productionLeadDays' => 'Production days', 'depositDueDays' => 'Days to pay after approving',
        'unpaidOrderDays' => 'Days before an unpaid order is cancelled', 'unpaidReadyHoldDays' => 'Days a finished order is held',
        'refundDays' => 'Refund days', 'freeRevisions' => 'Free revisions', 'extraRevisionFee' => 'Extra revision fee',
        'maxRevisions' => 'Most revisions', 'shippingZones' => 'Delivery days by area', 'workingDays' => 'Working days',
        'holidays' => 'Holidays', 'shippingDaysMin' => 'Delivery days (min)', 'shippingDaysMax' => 'Delivery days (max)',
        'rushEnabled' => 'Rush orders', 'rushLeadDays' => 'Rush production days', 'rushFee' => 'Rush fee',
        'contactFormEnabled' => 'Contact form', 'contactSuccessMessage' => 'Contact form thank-you',
        'contactClosedMessage' => 'Contact form closed message', 'googleMapsEnabled' => 'Google Maps',
        'freeDeliveryFrom' => 'Free delivery from', 'firstOrderPercent' => 'First-order discount (%)', 'firstOrderCap' => 'First-order discount cap',
        'storeName' => 'Shop name', 'storeDescription' => 'Shop description', 'storeEmail' => 'Shop email', 'storePhone' => 'Shop phone',
    ];

    /** The current values of these keys on a record, for comparing after the save. */
    public static function snapshot($record, array $keys): array
    {
        $out = [];
        foreach ($keys as $k) $out[$k] = $record->{$k} ?? null;
        return $out;
    }

    /** [['field' => 'Rush fee', 'key' => 'rushFee', 'from' => '150', 'to' => '200'], ...] */
    public static function changes(array $before, $record): array
    {
        $out = [];
        foreach ($before as $k => $old) {
            $new = $record->{$k} ?? null;
            if (self::norm($old) === self::norm($new)) continue;
            $out[] = ['field' => self::LABELS[$k] ?? $k, 'key' => $k, 'from' => self::show($old), 'to' => self::show($new)];
        }
        return $out;
    }

    /** "Rush fee 150 -> 200, Production days 3 -> 4 and 2 more" - for the entry's one-line title. */
    public static function sentence(array $changes, int $max = 3): string
    {
        $parts = array_map(fn ($c) => strlen($c['from'] . $c['to']) <= 40
            ? "{$c['field']} {$c['from']} -> {$c['to']}"
            : $c['field'], array_slice($changes, 0, $max));
        $more = count($changes) - $max;
        return implode(', ', $parts) . ($more > 0 ? " and {$more} more" : '');
    }

    private static function norm($v): string
    {
        if (is_bool($v)) return $v ? '1' : '0';
        if (is_numeric($v)) return (string) (0 + $v);
        if (is_array($v) || is_object($v)) return json_encode($v);
        return trim((string) $v);
    }

    private static function show($v): string
    {
        if ($v === null || $v === '') return '(blank)';
        if (is_bool($v)) return $v ? 'on' : 'off';
        if (is_numeric($v)) return (string) (0 + $v);
        if (is_array($v) || is_object($v)) {
            $s = json_encode($v);
            return mb_strlen($s) > 120 ? mb_substr($s, 0, 117) . '...' : $s;
        }
        $s = (string) $v;
        return mb_strlen($s) > 120 ? mb_substr($s, 0, 117) . '...' : $s;
    }
}
