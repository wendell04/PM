<?php

namespace App\Support;

use App\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use MongoDB\BSON\ObjectId;

/**
 * Gives a cancelled order's promotions back.
 *
 * A voucher is claimed and a flash sale's sold count raised when the order is placed. Cancelling
 * returned the stock but never these, so a customer whose payment failed could not use their
 * voucher again ("You have already used this voucher"), and every cancelled flash-sale order ate
 * into the sale's cap for good.
 *
 * Runs once per order whichever cancel path arrives first: the order is flagged atomically before
 * anything is released, so two paths cancelling the same order cannot release twice.
 */
class PromotionRelease
{
    public static function forCancelledOrder(Order $order): void
    {
        $voucherCode = strtoupper(trim((string) ($order->voucherCode ?? '')));
        $flashLines  = array_values(array_filter(
            (array) ($order->items ?? []),
            fn ($item) => !empty($item['flashSaleId'])
        ));
        if ($voucherCode === '' && empty($flashLines)) return;

        try {
            $db = DB::connection('mongodb');

            $flagged = $db->getCollection('orders')->updateOne(
                ['_id' => new ObjectId((string) $order->_id), 'promotionsReleased' => ['$ne' => true]],
                ['$set' => ['promotionsReleased' => true]]
            );
            if ($flagged->getModifiedCount() !== 1) return;
            $order->promotionsReleased = true;

            $userId = (string) ($order->userId ?? '');
            if ($voucherCode !== '' && $userId !== '') {
                // Only a claim this customer actually holds is handed back, so the count can never
                // drop below what was really used.
                $db->getCollection('vouchers')->updateOne(
                    ['code' => $voucherCode, 'usedBy' => $userId],
                    ['$inc' => ['usedCount' => -1], '$pull' => ['usedBy' => $userId]]
                );
            }

            foreach ($flashLines as $line) {
                $qty = (int) ($line['qty'] ?? 0);
                if ($qty <= 0) continue;
                try {
                    $db->getCollection('flash_sales')->updateOne(
                        ['_id' => new ObjectId((string) $line['flashSaleId']), 'stockUsed' => ['$gte' => $qty]],
                        ['$inc' => ['stockUsed' => -$qty]]
                    );
                } catch (\Throwable $e) {
                    Log::warning('PromotionRelease: flash sale not released', [
                        'orderId' => (string) $order->_id, 'flashSaleId' => $line['flashSaleId'], 'error' => $e->getMessage(),
                    ]);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('PromotionRelease: failed for order ' . $order->_id, ['error' => $e->getMessage()]);
        }
    }
}
