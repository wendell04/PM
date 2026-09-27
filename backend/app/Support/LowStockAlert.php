<?php

namespace App\Support;

use App\Models\Inventory;
use App\Models\Notification;
use App\Models\User;

/**
 * "White T-Shirt XL is below its minimum" - to the people who buy stock.
 *
 * Home and To Buy already show it, but only to someone who opens them; a bell reaches the owner
 * when it happens. Sent to the shop's owners and admins and to any staff member whose access
 * includes To Buy or stock, so a production hand without stock duties is not paged.
 */
class LowStockAlert
{
    public static function send(Inventory $m): void
    {
        $min   = (int) ($m->minStockLevel ?? 0);
        $stock = (float) ($m->stockQty ?? 0);
        $uom   = $m->uom ?: 'units';
        $short = max(0, $min - $stock);

        $title   = $stock <= 0 ? "Out of stock: {$m->name}" : "Below minimum: {$m->name}";
        $message = ($stock <= 0 ? 'None left' : rtrim(rtrim(number_format($stock, 2, '.', ''), '0'), '.') . " {$uom} left")
            . " - your minimum is {$min}. Buy at least " . rtrim(rtrim(number_format($short, 2, '.', ''), '0'), '.') . " {$uom} to get back to it."
            . ($m->isOnDemand ? ' (Bought per order, so sales are not blocked.)' : '');

        $recipients = User::whereNotIn('role', ['customer'])->get()->filter(function ($u) {
            if (in_array($u->role, ['superAdmin', 'admin', 'owner'], true)) return true;
            foreach (['toBuy.view', 'stock.view', 'masterData.view'] as $key) {
                if (Rbac::allowsFor($u, $key, false)) return true;
            }
            return false;
        });

        foreach ($recipients as $u) {
            Notification::create([
                'user_id'    => (string) $u->_id,
                'type'       => 'low_stock',
                'title'      => $title,
                'message'    => $message,
                'is_read'    => false,
                'data'       => ['inventoryId' => (string) $m->_id, 'link' => '/dashboard/business/to-buy?show=minimum', 'linkLabel' => 'Open To Buy'],
                'created_at' => now(),
            ]);
        }
    }
}
