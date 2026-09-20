<?php

namespace App\Support;

/**
 * How long the courier actually takes, by where it is going.
 *
 * The shop had ONE shipping range for the whole country - 1 to 2 days - so an order to
 * Maguindanao was promised the same transit as one crossing Quezon City. Live orders have gone to
 * Lanao del Sur, Apayao, Sorsogon and Oriental Mindoro on that promise. It is not a disclaimer
 * problem; the figure itself was wrong, and no wording fixes a wrong figure.
 *
 * Provinces are grouped the way couriers here price and schedule them: Metro Manila, the rest of
 * Luzon, Visayas, Mindanao. The owner sets the days per zone; this only decides which zone an
 * address falls in, so adding a province never means editing a schedule.
 *
 * Unknown or missing province falls back to the WIDEST zone rather than the narrowest. A promise
 * guessed short is a promise broken; guessed long is a delivery that arrives early.
 */
class ShippingZones
{
    public const METRO   = 'metro';
    public const LUZON   = 'luzon';
    public const VISAYAS = 'visayas';
    public const MINDANAO = 'mindanao';

    /** Sensible starting figures; every one is overridable in Settings. */
    private const DEFAULTS = [
        self::METRO    => ['label' => 'Metro Manila',      'min' => 1, 'max' => 2],
        self::LUZON    => ['label' => 'Rest of Luzon',     'min' => 2, 'max' => 4],
        self::VISAYAS  => ['label' => 'Visayas',           'min' => 3, 'max' => 6],
        self::MINDANAO => ['label' => 'Mindanao',          'min' => 4, 'max' => 7],
    ];

    /** Province name (lowercased, punctuation-stripped) => zone. Anything unlisted is Luzon-or-wider. */
    private const VISAYAS_PROVINCES = [
        'aklan', 'antique', 'capiz', 'guimaras', 'iloilo', 'negros occidental', 'negros oriental',
        'bohol', 'cebu', 'siquijor', 'biliran', 'eastern samar', 'leyte', 'northern samar',
        'samar', 'southern leyte', 'western samar',
    ];

    private const MINDANAO_PROVINCES = [
        'zamboanga del norte', 'zamboanga del sur', 'zamboanga sibugay', 'bukidnon', 'camiguin',
        'lanao del norte', 'misamis occidental', 'misamis oriental', 'davao de oro',
        'compostela valley', 'davao del norte', 'davao del sur', 'davao occidental',
        'davao oriental', 'cotabato', 'north cotabato', 'sarangani', 'south cotabato',
        'sultan kudarat', 'agusan del norte', 'agusan del sur', 'dinagat islands',
        'surigao del norte', 'surigao del sur', 'basilan', 'lanao del sur', 'maguindanao',
        'maguindanao del norte', 'maguindanao del sur', 'sulu', 'tawi-tawi', 'tawi tawi',
    ];

    private const METRO_NAMES = [
        'metro manila', 'ncr', 'national capital region', 'metropolitan manila',
    ];

    public static function zoneFor(?string $province): string
    {
        $p = self::normalise($province);
        if ($p === '') return self::MINDANAO;                       // unknown: quote the widest
        if (in_array($p, self::METRO_NAMES, true))      return self::METRO;
        if (in_array($p, self::VISAYAS_PROVINCES, true)) return self::VISAYAS;
        if (in_array($p, self::MINDANAO_PROVINCES, true)) return self::MINDANAO;
        return self::LUZON;                                          // the mainland default
    }

    /**
     * @return array{zone: string, label: string, min: int, max: int}
     */
    public static function transitFor(?string $province): array
    {
        $zone = self::zoneFor($province);
        $conf = self::configured();
        $row  = $conf[$zone] ?? self::DEFAULTS[$zone];

        return [
            'zone'  => $zone,
            'label' => self::DEFAULTS[$zone]['label'],
            'min'   => max(0, (int) ($row['min'] ?? self::DEFAULTS[$zone]['min'])),
            'max'   => max(0, (int) ($row['max'] ?? self::DEFAULTS[$zone]['max'])),
        ];
    }

    /** Every zone with its current figures, for the settings screen and the storefront. */
    public static function all(): array
    {
        $conf = self::configured();
        $out  = [];
        foreach (self::DEFAULTS as $zone => $d) {
            $row = $conf[$zone] ?? [];
            $out[] = [
                'zone'  => $zone,
                'label' => $d['label'],
                'min'   => max(0, (int) ($row['min'] ?? $d['min'])),
                'max'   => max(0, (int) ($row['max'] ?? $d['max'])),
            ];
        }
        return $out;
    }

    private static function configured(): array
    {
        $raw = ShopSettings::get('shippingZones', null);
        if (!is_array($raw)) return [];
        $out = [];
        foreach ($raw as $k => $v) {
            if (is_array($v)) $out[(string) $k] = $v;
        }
        return $out;
    }

    private static function normalise(?string $province): string
    {
        $p = strtolower(trim((string) $province));
        $p = str_replace(['province of ', ' province', '.'], '', $p);
        $p = preg_replace('/\s+/', ' ', $p);
        return trim($p);
    }
}
