<?php

namespace App\Support;

use App\Models\Product;

/**
 * What a product's chosen options cost, worked out on the server.
 *
 * The shop showed Kisscut at +P5 a piece and the order was saved without it: every checkout path
 * re-priced the line from the tiers alone, and the options only travelled as words in the variant
 * name. The price is the server's to decide, so the options are priced here, from the product's
 * own option groups - never from a figure the browser sends.
 *
 * Two kinds of charge, kept apart (as in lib/shopUtils.js): per piece goes into the unit price,
 * per order is added once to the line.
 */
class OptionPricing
{
    /**
     * @param array|null  $selection   {groupId|groupName: optionId|optionLabel} from the shop
     * @param string|null $variantName the line's name, "Glossy · Kisscut" - read only when no
     *                                 selection came (a cart saved before options were sent)
     * @return array{unit: float, order: float, chosen: array, missing: string[]}
     */
    public static function price(Product $product, ?array $selection, ?string $variantName = null): array
    {
        $groups = array_values(array_filter((array) ($product->optionGroups ?? []), fn ($g) => !empty($g['options'])));
        $out = ['unit' => 0.0, 'order' => 0.0, 'chosen' => [], 'missing' => []];
        if (!$groups) return $out;

        $words = $variantName !== null && $variantName !== ''
            ? array_map(fn ($w) => mb_strtolower(trim($w)), preg_split('/\s*\x{00B7}\s*/u', $variantName))
            : [];

        foreach ($groups as $gi => $g) {
            $want = null;
            if (is_array($selection)) {
                foreach ([$g['id'] ?? null, $g['name'] ?? null, (string) $gi] as $k) {
                    if ($k !== null && array_key_exists((string) $k, $selection)) { $want = (string) $selection[(string) $k]; break; }
                }
            }

            $pick = null;
            foreach ((array) $g['options'] as $oi => $o) {
                $byKey  = $want !== null && in_array($want, array_filter([(string) ($o['id'] ?? ''), (string) ($o['label'] ?? ''), (string) $oi], fn ($v) => $v !== ''), true);
                $byName = $want === null && $words && in_array(mb_strtolower(trim((string) ($o['label'] ?? ''))), $words, true);
                if ($byKey || $byName) { $pick = $o; break; }
            }

            if (!$pick) { $out['missing'][] = (string) ($g['name'] ?? 'an option'); continue; }

            $add  = max(0.0, (float) ($pick['priceAdd'] ?? 0));
            $mode = ($pick['priceMode'] ?? 'unit') === 'order' ? 'order' : 'unit';
            $out[$mode] += $add;
            $out['chosen'][] = ['group' => (string) ($g['name'] ?? ''), 'label' => (string) ($pick['label'] ?? ''), 'priceAdd' => $add, 'priceMode' => $mode];
        }

        $out['unit']  = round($out['unit'], 2);
        $out['order'] = round($out['order'], 2);
        return $out;
    }
}
