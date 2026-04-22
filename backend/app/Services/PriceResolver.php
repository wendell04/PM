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

                $matchedPrice = null;
                foreach ($tiers as $tier) {
                    $min = (int) ($tier['minQty'] ?? 1);
                    $max = isset($tier['maxQty']) ? (int) $tier['maxQty'] : PHP_INT_MAX;
                    if ($qty >= $min && $qty <= $max) {
                        $matchedPrice = (float) $tier['price'];
                        break;
                    }
                }

                if ($matchedPrice === null && !empty($tiers)) {
                    $matchedPrice = (float) end($tiers)['price'];
                }

                $price = $matchedPrice;
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
