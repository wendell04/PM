<?php

namespace App\Support;

use App\Models\RolePermission;

/**
 * What a person can be granted: one row per sidebar entry.
 *
 * Each row has two levels - See and Work - and, where an action deserves its own decision, a few
 * extra ticks (cancelling orders, refunds, deleting job orders). Work includes See; an extra needs
 * at least See. That is the whole model: the owner picks Off / See / Work per page and ticks the
 * risky extras, instead of reading forty checkboxes.
 *
 * Before this, the rows did not match the sidebar - one "jobOrders" tick opened Job Orders,
 * Production and Quality Control at once - and the server mostly asked "any tick in this module?".
 * Now every row is one sidebar entry and every key is checked exactly by the action it names.
 *
 * Kept on the server on purpose: a permission list that lives in the frontend is a permission list
 * that can disagree with the checks.
 */
class PermissionCatalog
{
    /**
     * section, label, note; view/work = ['keys' => [...], 'hint' => '...'] (work keys exclude the
     * view keys - the Work level grants both); extras = key => [label, hint].
     */
    public static function rows(): array
    {
        $v = fn (string $k, string $hint) => ['keys' => [$k], 'hint' => $hint];

        return [
            // ── Operations ──
            'orders' => ['section' => 'Operations', 'label' => 'Orders',
                'note'   => 'Seeing an order shows the customer\'s name, phone and address.',
                'view'   => $v('orders.view', 'The order list and each order, read only.'),
                'work'   => ['keys' => ['orders.edit', 'orders.updateStatus'], 'hint' => 'Move orders along and change delivery dates and notes. The customer is emailed at each stage.'],
                'extras' => [
                    'orders.create'  => ['Take orders for customers', 'Enter an order someone placed by phone, chat or at the counter.'],
                    'design.proof'   => ['Send design proofs', 'Upload the adjusted artwork for the customer to approve.'],
                    'design.approve' => ['Approve or reject files', 'Approving releases the order to production and starts the delivery countdown.'],
                    'orders.delete'  => ['Cancel and archive orders', 'Cancelling a paid order can mean money owed back.'],
                    // Money on an order - the total, what has been paid, what is still owed - without
                    // handing over the Payments module, which is every customer's balances and
                    // payment references. Off unless ticked: seeing the work is not seeing its price.
                    'orders.money'   => ['See order amounts', 'Totals, what has been paid and what is still owed, on Orders only. Does not open Payments.'],
                ]],
            'pos' => ['section' => 'Operations', 'label' => 'Counter (POS)', 'note' => '',
                'view'   => $v('pos.view', 'Open the counter screen, read only.'),
                'work'   => $v('pos.sell', 'Ring up a sale or take an order to produce.'),
                'extras' => ['pos.void' => ['Void counter sales', 'Undo a counter sale.']]],
            'orderRequests' => ['section' => 'Operations', 'label' => 'Quotations', 'note' => '',
                'view'   => $v('orderRequests.view', 'The quotations sent and what became of them.'),
                'work'   => ['keys' => ['orderRequests.create', 'orderRequests.edit'], 'hint' => 'Send, re-price and extend quotations. The customer can pay one straight away.'],
                'extras' => ['orderRequests.approve' => ['Close or decline quotations', 'Mark a quotation answered or declined.']]],

            // ── Production ──
            'jobOrders' => ['section' => 'Production', 'label' => 'Job Orders', 'note' => '',
                'view'   => $v('jobOrders.view', 'Every job order, its due date and files, read only.'),
                'work'   => ['keys' => ['jobOrders.create', 'jobOrders.edit'], 'hint' => 'Create job orders, change dates and rush, attach the print files.'],
                'extras' => ['jobOrders.delete' => ['Delete job orders', 'Remove a job order that should not exist.']]],
            'production' => ['section' => 'Production', 'label' => 'Production', 'note' => '',
                'view'   => $v('production.view', 'The bench: what is queued and in progress.'),
                'work'   => $v('production.work', 'Start and finish jobs, report spoilage. Starting a job takes its materials off the shelf.'),
                'extras' => []],
            'qc' => ['section' => 'Production', 'label' => 'Quality Control', 'note' => '',
                'view'   => $v('qc.view', 'The jobs waiting on QC.'),
                'work'   => $v('qc.work', 'Pass or fail finished work and record what was scrapped.'),
                'extras' => []],

            // ── Inventory ──
            'masterData' => ['section' => 'Inventory', 'label' => 'Master Data', 'note' => '',
                'view'   => $v('masterData.view', 'Materials, suppliers and product recipes (BOMs), read only.'),
                'work'   => $v('masterData.work', 'Add and edit materials, suppliers, units and recipes.'),
                'extras' => ['masterData.archive' => ['Archive materials and recipes', 'Retire a material or delete a recipe.']]],
            'stock' => ['section' => 'Inventory', 'label' => 'Stock (Overview)', 'note' => '',
                'view'   => $v('stock.view', 'Product stock, stock-ins, actual stock and stock-out history.'),
                'work'   => $v('stock.work', 'Receive stock and record stock-outs - this changes what the shelf says.'),
                'extras' => []],
            'toBuy' => ['section' => 'Inventory', 'label' => 'To Buy', 'note' => '',
                'view'   => $v('toBuy.view', 'What to buy for the orders already taken.'),
                'work'   => ['keys' => [], 'hint' => ''],
                'extras' => []],
            'badOrders' => ['section' => 'Inventory', 'label' => 'Bad Orders', 'note' => '',
                'view'   => $v('badOrders.view', 'Damaged, defective or wrong deliveries, read only.'),
                'work'   => $v('badOrders.create', 'Record a bad delivery for return or write-off.'),
                'extras' => []],

            // ── Products ──
            'products' => ['section' => 'Products', 'label' => 'Catalog', 'note' => 'Everything in Products is what customers see.',
                'view'   => $v('products.view', 'The catalog as the shop sees it, read only.'),
                'work'   => ['keys' => ['products.create', 'products.edit'], 'hint' => 'Add and edit products, prices and their recipes.'],
                'extras' => ['products.delete' => ['Remove products', 'Take a product off the shop.']]],
            'collections' => ['section' => 'Products', 'label' => 'Collections', 'note' => '',
                'view'   => $v('collections.view', 'The collections, read only.'),
                'work'   => $v('collections.work', 'Create, edit and publish collections.'),
                'extras' => []],
            'banners' => ['section' => 'Products', 'label' => 'Banners', 'note' => '',
                'view'   => $v('banners.view', 'The banners, read only.'),
                'work'   => $v('banners.work', 'Add, edit and publish the rotating banners.'),
                'extras' => []],
            'homepage' => ['section' => 'Products', 'label' => 'Homepage', 'note' => '',
                'view'   => $v('homepage.view', 'The homepage text, read only.'),
                'work'   => $v('homepage.work', 'Edit the homepage and landing page text.'),
                'extras' => []],
            'reviews' => ['section' => 'Products', 'label' => 'Reviews', 'note' => '',
                'view'   => $v('reviews.view', 'Customer reviews, read only.'),
                'work'   => $v('reviews.work', 'Hide, show and reply to reviews.'),
                'extras' => []],
            'promotions' => ['section' => 'Products', 'label' => 'Promotions', 'note' => 'Discounts come out of your margin.',
                'view'   => $v('promotions.view', 'Flash sales and vouchers, read only.'),
                'work'   => $v('promotions.work', 'Create and edit flash sales and vouchers.'),
                'extras' => []],

            // ── Finance ──
            'sales' => ['section' => 'Finance', 'label' => 'Sales', 'note' => 'Finance rows show revenue and what customers owe.',
                'view'   => $v('sales.view', 'Revenue, profit and the sales list, read only.'),
                'work'   => ['keys' => [], 'hint' => ''],
                'extras' => ['sales.export' => ['Export sales', 'Download the sales list - it leaves the system.']]],
            'payments' => ['section' => 'Finance', 'label' => 'Payments', 'note' => '',
                'view'   => $v('payments.view', 'Who paid and who still owes, read only.'),
                'work'   => $v('payments.create', 'Record cash, GCash or bank money received, and send balance reminders.'),
                'extras' => [
                    'payments.edit'   => ['Write off balances', 'Close what a customer owes without collecting it.'],
                    'payments.refund' => ['Refunds', 'Mark money as sent back, or waive a refund. Moves real money.'],
                ]],
            'reports' => ['section' => 'Finance', 'label' => 'Reports', 'note' => '',
                'view'   => $v('reports.view', 'Sales, inventory and demand reports.'),
                'work'   => ['keys' => [], 'hint' => ''],
                'extras' => ['reports.export' => ['Export reports', 'Download a report as a file.']]],
            'forecast' => ['section' => 'Finance', 'label' => 'Forecast', 'note' => '',
                'view'   => $v('forecast.view', 'The sales forecast.'),
                'work'   => ['keys' => [], 'hint' => ''],
                'extras' => []],

            // ── Admin ──
            'auditLogs' => ['section' => 'Admin', 'label' => 'Audit Logs', 'note' => 'Staff, roles, customers, messages and shop settings are the owner\'s alone and cannot be granted.',
                'view'   => $v('auditLogs.view', 'Who changed what, and when.'),
                'work'   => ['keys' => [], 'hint' => ''],
                'extras' => []],
        ];
    }

    /** Every grantable key, flat. */
    public static function keys(): array
    {
        $out = [];
        foreach (self::rows() as $r) {
            foreach ([...$r['view']['keys'], ...$r['work']['keys'], ...array_keys($r['extras'])] as $k) $out[] = $k;
        }
        return $out;
    }

    /**
     * The same rows in the older group/items shape (key => [label, hint]) - what the Access screen
     * rendered before it learned levels. Kept so anything still reading `groups` keeps working.
     */
    public static function groups(): array
    {
        $out = [];
        foreach (self::rows() as $id => $r) {
            $items = [];
            foreach ($r['view']['keys'] as $k) $items[$k] = ['See ' . strtolower($r['label']), $r['view']['hint']];
            foreach ($r['work']['keys'] as $k) $items[$k] = ['Work in ' . strtolower($r['label']), $r['work']['hint']];
            foreach ($r['extras'] as $k => $e) $items[$k] = $e;
            $out[$id] = ['label' => $r['label'], 'note' => $r['note'], 'items' => $items];
        }
        return $out;
    }

    /** Drop anything not in the catalogue - a saved grid may only contain real keys. */
    public static function sanitize(array $grid): array
    {
        $valid = array_flip(self::keys());
        $out = [];
        foreach ($grid as $k => $v) {
            if (isset($valid[$k]) && $v) $out[$k] = true;
        }
        return self::completeLevels($out);
    }

    /**
     * Keep every grid expressible as levels: part of a Work level becomes the whole level, and any
     * grant in a row brings that row's See with it (you cannot act on a page you cannot open).
     */
    public static function completeLevels(array $grid): array
    {
        foreach (self::rows() as $r) {
            $work = $r['work']['keys'];
            if ($work && array_intersect($work, array_keys($grid))) {
                foreach ($work as $k) $grid[$k] = true;
            }
            $rowKeys = [...$work, ...array_keys($r['extras'])];
            if (array_intersect($rowKeys, array_keys($grid))) {
                foreach ($r['view']['keys'] as $k) $grid[$k] = true;
            }
        }
        return $grid;
    }

    /** Any stored grid, old or new, in today's keys. */
    public static function normalize(array $grid): array
    {
        return self::isLegacy($grid) ? self::upgrade($grid) : self::sanitize($grid);
    }

    /** Does this grid still carry keys from before the row model? */
    public static function isLegacy(array $grid): bool
    {
        $valid = array_flip(self::keys());
        foreach ($grid as $k => $v) {
            if ($v && !isset($valid[$k])) return true;
        }
        return false;
    }

    /**
     * An older grid in today's keys. Used by the server as it reads a grid (so nobody is locked
     * out between the deploy and the conversion) and by rbac:convert-grids, which saves the result.
     *
     * One deliberate difference from how the old grids behaved: a module switch sitting next to
     * that module's own ticks ("inventory" beside "inventory.view") was the old editor's "module is
     * visible" flag, and the server read it as FULL access to the module - so a production template
     * ticked "See stock" could in fact receive and adjust stock. Here the ticks decide. A module
     * switch with no ticks of its own still means the whole module, as it always did.
     */
    public static function upgrade(array $grid): array
    {
        $on = array_keys(array_filter($grid));
        $valid = array_flip(self::keys());
        $out = [];
        foreach ($on as $k) {
            if (!is_string($k)) continue;
            if (isset($valid[$k]) && !isset(self::LEGACY[$k])) { $out[$k] = true; continue; }
            if (!str_contains($k, '.')) {
                $hasTicks = false;
                foreach ($on as $o) if (is_string($o) && str_starts_with($o, $k . '.')) { $hasTicks = true; break; }
                if ($hasTicks) continue;
                foreach (self::LEGACY_MODULE[$k] ?? [] as $n) $out[$n] = true;
                continue;
            }
            foreach (self::LEGACY[$k] ?? [] as $n) $out[$n] = true;
        }
        return self::completeLevels($out);
    }

    /** Old action keys that do not map one-to-one. Keys absent here and absent from the catalogue grant nothing. */
    private const LEGACY = [
        // "Change orders" included design work.
        'orders.edit'            => ['orders.edit', 'orders.updateStatus', 'design.proof', 'design.approve'],
        'design.view'            => ['orders.view'],
        // One See tick used to open all three production pages.
        'jobOrders.view'         => ['jobOrders.view', 'production.view', 'qc.view'],
        'jobOrders.updateStatus' => ['production.view', 'production.work'],
        'inventory.view'         => ['masterData.view', 'stock.view', 'toBuy.view'],
        'inventory.create'       => ['masterData.work'],
        'inventory.edit'         => ['stock.work', 'masterData.work'],
        'inventory.delete'       => ['masterData.archive'],
        'vendors.view'           => ['masterData.view'],
        'vendors.create'         => ['masterData.work'],
        'vendors.edit'           => ['masterData.work'],
        'vendors.delete'         => ['masterData.work'],
        'badOrders.edit'         => ['badOrders.create'],
        'badOrders.delete'       => ['badOrders.create'],
        'products.view'          => ['products.view', 'collections.view', 'homepage.view', 'reviews.view'],
        'products.create'        => ['products.create', 'products.edit', 'collections.work'],
        'products.edit'          => ['products.create', 'products.edit', 'collections.work', 'homepage.work', 'reviews.work'],
        'banners.create'         => ['banners.work'],
        'banners.edit'           => ['banners.work'],
        'banners.delete'         => ['banners.work'],
        'flashSales.view'        => ['promotions.view'],
        'flashSales.create'      => ['promotions.work'],
        'flashSales.edit'        => ['promotions.work'],
        'flashSales.delete'      => ['promotions.work'],
        'vouchers.view'          => ['promotions.view'],
        'vouchers.create'        => ['promotions.work'],
        'vouchers.edit'          => ['promotions.work'],
        'vouchers.delete'        => ['promotions.work'],
        // The Sales tick used to open Reports and Forecast in the sidebar too.
        'sales.view'             => ['sales.view', 'forecast.view'],
        'payments.confirm'       => ['payments.create'],
    ];

    /** A module switch with no ticks of its own: the whole module, as it always meant. */
    private const LEGACY_MODULE = [
        'orders'        => ['orders.view', 'orders.edit', 'orders.updateStatus', 'orders.create', 'orders.delete', 'design.proof', 'design.approve'],
        'design'        => ['orders.view', 'design.proof', 'design.approve'],
        'pos'           => ['pos.view', 'pos.sell', 'pos.void'],
        'orderRequests' => ['orderRequests.view', 'orderRequests.create', 'orderRequests.edit', 'orderRequests.approve'],
        'jobOrders'     => ['jobOrders.view', 'jobOrders.create', 'jobOrders.edit', 'jobOrders.delete', 'production.view', 'production.work', 'qc.view', 'qc.work'],
        'production'    => ['jobOrders.view', 'production.view', 'production.work'],
        'qc'            => ['qc.view', 'qc.work'],
        'inventory'     => ['masterData.view', 'masterData.work', 'masterData.archive', 'stock.view', 'stock.work', 'toBuy.view'],
        'vendors'       => ['masterData.view', 'masterData.work'],
        'badOrders'     => ['badOrders.view', 'badOrders.create'],
        'products'      => ['products.view', 'products.create', 'products.edit', 'products.delete', 'collections.view', 'collections.work', 'homepage.view', 'homepage.work', 'reviews.view', 'reviews.work'],
        'banners'       => ['banners.view', 'banners.work'],
        'flashSales'    => ['promotions.view', 'promotions.work'],
        'vouchers'      => ['promotions.view', 'promotions.work'],
        'sales'         => ['sales.view', 'forecast.view'],
        'payments'      => ['payments.view', 'payments.create'],
        'reports'       => ['reports.view'],
        'auditLogs'     => ['auditLogs.view'],
    ];

    /** A role template's grid, for pre-filling the ticks. */
    public static function template(string $role): array
    {
        $rec = RolePermission::where('role', $role)->first();
        return $rec ? self::upgrade((array) ($rec->permissions ?? [])) : [];
    }
}
