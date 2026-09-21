<?php

namespace App\Support;

use App\Models\RolePermission;

/**
 * What a person can be granted, grouped and labelled for human beings.
 *
 * The keys are the ones the app has always checked - this invents nothing. What it adds is a
 * single place that says which keys EXIST, what each one means in plain words, and which ones
 * belong together on screen. Before this, the answer was "whatever happens to be in the role
 * documents", so a permission nobody had ever ticked was invisible and unassignable.
 *
 * Kept on the server on purpose: a permission list that lives in the frontend is a permission
 * list that can disagree with the checks.
 */
class PermissionCatalog
{
    /**
     * group => [label, permissions => [key => [label, hint]]]
     */
    public static function groups(): array
    {
        return [
            'orders' => ['label' => 'Orders', 'note' => 'Seeing an order shows the customer\'s name, phone and address.', 'items' => [
                'orders.view'         => ['See orders', 'The order list and each order\'s details. Read only.'],
                'orders.create'       => ['Take orders for customers', 'Enter an order someone placed by phone, chat or at the counter.'],
                'orders.edit'         => ['Change orders', 'Edit items, delivery dates and notes, and do anything else an order allows. Includes design work if Designs is not ticked.'],
                'orders.updateStatus' => ['Move orders along', 'Mark an order as in production, ready or delivered. The customer is emailed each time.'],
                'orders.delete'       => ['Cancel and archive orders', 'Cancelling a paid order can mean money owed back.'],
            ]],
            'design' => ['label' => 'Designs and proofs', 'note' => 'For a designer who does not need the rest of the order screens.', 'items' => [
                'design.view'    => ['Open customer designs', 'See the orders that carry artwork and open the files. Read only.'],
                'design.proof'   => ['Send proofs', 'Upload the adjusted artwork and send it to the customer to approve.'],
                'design.approve' => ['Approve or reject files', 'Approving an uploaded file releases the order to production and starts the delivery countdown.'],
            ]],
            'production' => ['label' => 'Production', 'note' => '', 'items' => [
                'jobOrders.view'         => ['See job orders', 'The bench: what is queued, in progress and due. Read only.'],
                'jobOrders.create'       => ['Create job orders', 'Put an approved, paid order on the bench.'],
                'jobOrders.updateStatus' => ['Start and finish jobs', 'Starting a job takes its materials off the shelf.'],
                'jobOrders.edit'         => ['Attach production files', 'Add or remove the print-ready files on a job.'],
                'qc'                     => ['Quality control', 'Pass or fail finished work and record what was scrapped.'],
            ]],
            'inventory' => ['label' => 'Inventory', 'note' => '', 'items' => [
                'inventory.view'   => ['See stock', 'Materials, stock levels, To Buy. Read only.'],
                'inventory.create' => ['Add materials', 'Create new materials and recipes (BOMs).'],
                'inventory.edit'   => ['Receive and adjust stock', 'Stock-ins and corrections - this changes what the shelf says.'],
                'inventory.delete' => ['Archive materials', 'Retire a material; blocked while a recipe still uses it.'],
                'vendors.view'     => ['See suppliers', 'Read only.'],
                'vendors.edit'     => ['Manage suppliers', 'Add and edit suppliers and their prices.'],
                'badOrders.view'   => ['See bad orders', 'Damaged, defective or wrong stock that came in. Read only.'],
                'badOrders.create' => ['Record bad orders', 'Log a damaged or defective delivery for return or write-off.'],
            ]],
            'catalog' => ['label' => 'Catalog and storefront', 'note' => 'Everything here is what customers see.', 'items' => [
                'products.view'   => ['See products', 'The catalog as the shop sees it. Read only.'],
                'products.create' => ['Add products', 'New products and collections.'],
                'products.edit'   => ['Edit products and prices', 'Prices are what customers pay. Also covers collections, reviews and homepage text.'],
                'products.delete' => ['Remove products', 'Take a product off the shop.'],
                'banners'         => ['Banners', 'The rotating banners on the shop and homepage.'],
                'flashSales'      => ['Flash sales', 'Timed price cuts on products. Discounts come out of your margin.'],
                'vouchers'        => ['Vouchers', 'Discount codes customers type at checkout. Discounts come out of your margin.'],
            ]],
            'quotes' => ['label' => 'Quotations', 'note' => '', 'items' => [
                'orderRequests.view'    => ['See quotations', 'The quotations sent and what became of them. Read only.'],
                'orderRequests.create'  => ['Send quotations', 'Put a price on a customer\'s request. The customer can pay it straight away.'],
                'orderRequests.edit'    => ['Change quotations', 'Re-price, extend or cancel a quotation already sent.'],
                'orderRequests.approve' => ['Close quotations', 'Mark a quotation answered or declined.'],
            ]],
            'counter' => ['label' => 'Counter (POS)', 'note' => '', 'items' => [
                'pos.view' => ['Open the counter', 'See the POS screen. Read only.'],
                'pos.sell' => ['Sell and take orders at the counter', 'Ring up a sale or take an order to produce.'],
                'pos.void' => ['Void counter sales', 'Undo a counter sale.'],
            ]],
            'money' => ['label' => 'Money', 'note' => 'These show revenue and what customers owe.', 'items' => [
                'sales.view'      => ['See sales', 'Revenue, profit and the sales list. Read only.'],
                'sales.export'    => ['Export sales', 'Download the sales list as a file - it leaves the system.'],
                'payments.view'   => ['See payments', 'Who paid, who still owes. Read only.'],
                'payments.create' => ['Record payments', 'Log cash, GCash or bank money received for an order.'],
                'payments.edit'   => ['Write off balances', 'Close what a customer owes without collecting it.'],
                'payments.refund' => ['Refunds', 'Mark money as sent back to a customer, or waive a refund. Moves real money.'],
                'reports.view'    => ['See reports', 'Sales, inventory and demand reports. Read only.'],
                'reports.export'  => ['Export reports', 'Download a report as a file.'],
            ]],
            'admin' => ['label' => 'Records', 'note' => 'Staff, roles and shop settings are the owner\'s alone and cannot be granted.', 'items' => [
                'auditLogs.view' => ['Audit logs', 'Who changed what, and when. Read only.'],
            ]],
        ];
    }

    /** Every grantable key, flat. */
    public static function keys(): array
    {
        $out = [];
        foreach (self::groups() as $g) {
            foreach (array_keys($g['items']) as $k) $out[] = $k;
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
        return $out;
    }

    /** A role template's grid, for pre-filling the ticks. */
    public static function template(string $role): array
    {
        $rec = RolePermission::where('role', $role)->first();
        return $rec ? self::sanitize((array) ($rec->permissions ?? [])) : [];
    }
}
