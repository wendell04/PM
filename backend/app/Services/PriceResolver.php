<?php

namespace App\Services;

use App\Models\FlashSale;
use App\Models\Product;

class PriceResolver
{
    public static function resolve(
        Product $product,
        int $qty,
        ?string $variantId = null,
        ?FlashSale $flashSale = null
    ): ?float {
        $price = null;

        if ($variantId && !empty($product->variantPrices)) {
            if (isset($product->variantPrices[$variantId])) {
                $price = (float) $product->variantPrices[$variantId];
            }
        }

        if ($price === null) {
            $tiers = $product->priceTiers ?? [];
            if (!empty($tiers)) {
                usort($tiers, fn($a, $b) => ($a['minQty'] ?? 0) <=> ($b['minQty'] ?? 0));

                $matchedTier = null;
                foreach ($tiers as $tier) {
                    $min = (int) ($tier['minQty'] ?? 1);
                    $maxRaw = $tier['maxQty'] ?? null;
                    $max = ($maxRaw !== null && $maxRaw !== '') ? (int) $maxRaw : PHP_INT_MAX;
                    if ($qty >= $min && $qty <= $max) {
                        $matchedTier = $tier;
                        break;
                    }
                }
                if ($matchedTier === null && !empty($tiers)) {
                    $matchedTier = end($tiers);
                }

                if ($matchedTier !== null) {
                    if (isset($matchedTier['prices']) && is_array($matchedTier['prices'])) {
                        $prices = $matchedTier['prices'];
                        if ($variantId && isset($prices[$variantId])) {
                            $price = (float) $prices[$variantId];
                        } else {
                            $vals = array_filter(array_map('floatval', array_values($prices)), fn($v) => $v > 0);
                            $price = !empty($vals) ? min($vals) : null;
                        }
                    } elseif (isset($matchedTier['price'])) {
                        $price = (float) $matchedTier['price'];
                    }
                }
            }
        }

        if ($price === null && $product->price !== null) {
            $price = (float) $product->price;
        }

        if ($price === null && $product->flatPrice !== null) {
            $price = (float) $product->flatPrice;
        }

        if ($price !== null && $flashSale !== null) {
            $discounted = $flashSale->discountType === 'percentage'
                ? $price * (1 - $flashSale->discountValue / 100)
                : $price - $flashSale->discountValue;

            $price = max(0, round($discounted, 2));
        }

        return $price;
    }
}
