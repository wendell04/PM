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
            'orders' => ['label' => 'Orders', 'items' => [
                'orders.view'         => ['See orders', 'The list, the details, the customer'],
                'orders.create'       => ['Take an order', 'Place one on a customer\'s behalf'],
                'orders.edit'         => ['Edit an order', 'Change items, addresses, delivery dates'],
                'orders.updateStatus' => ['Move an order along', 'Mark it made, ready, delivered'],
                'orders.delete'       => ['Cancel or archive', 'Cancelling can mean refunding money'],
            ]],
            'design' => ['label' => 'Designs and proofs', 'items' => [
                'design.view'    => ['See designs', 'Open the customer\'s file and the notes'],
                'design.proof'   => ['Send proofs and mockups', 'Goes to the customer'],
                'design.approve' => ['Approve or reject a design', 'Approving releases it to production'],
            ]],
            'production' => ['label' => 'Production', 'items' => [
                'jobOrders.view'         => ['See job orders', ''],
                'jobOrders.create'       => ['Create job orders', ''],
                'jobOrders.updateStatus' => ['Start and finish jobs', 'Starting commits material'],
                'qc'                     => ['Quality control', 'Pass, fail and record scrap'],
            ]],
            'inventory' => ['label' => 'Inventory', 'items' => [
                'inventory.view'   => ['See stock', 'Materials, levels, To Buy'],
                'inventory.create' => ['Add materials', ''],
                'inventory.edit'   => ['Receive stock and adjust', 'Changes what the shelf says'],
                'inventory.delete' => ['Archive materials', ''],
                'vendors.view'     => ['See suppliers', ''],
                'vendors.edit'     => ['Manage suppliers', ''],
                'badOrders.view'   => ['See bad orders', ''],
                'badOrders.create' => ['Record a bad order', ''],
            ]],
            'catalog' => ['label' => 'Catalog and storefront', 'items' => [
                'products.view'   => ['See products', ''],
                'products.create' => ['Add products', ''],
                'products.edit'   => ['Edit products and prices', 'Prices are what customers pay'],
                'products.delete' => ['Remove products', ''],
                'banners'         => ['Banners and homepage', ''],
                'flashSales'      => ['Flash sales', ''],
                'vouchers'        => ['Vouchers', 'Discounts come out of your margin'],
            ]],
            'quotes' => ['label' => 'Quotations', 'items' => [
                'orderRequests.view'    => ['See quotations', ''],
                'orderRequests.create'  => ['Send a quotation', 'Sets a price for a customer'],
                'orderRequests.edit'    => ['Edit a quotation', ''],
                'orderRequests.approve' => ['Approve a quotation', ''],
                'pos.view'              => ['Open POS', ''],
                'pos.sell'              => ['Sell on POS', ''],
                'pos.void'              => ['Void a POS sale', ''],
            ]],
            'money' => ['label' => 'Money', 'items' => [
                'sales.view'      => ['See sales', ''],
                'sales.export'    => ['Export sales', 'Leaves the system as a file'],
                'payments.view'   => ['See payments', ''],
                'payments.create' => ['Record a payment', ''],
                'payments.refund' => ['Refund', 'Moves real money'],
                'reports.view'    => ['See reports', ''],
                'reports.export'  => ['Export reports', ''],
            ]],
            'admin' => ['label' => 'Administration', 'items' => [
                'userManagement.view'   => ['See staff', ''],
                'userManagement.create' => ['Add staff', ''],
                'userManagement.edit'   => ['Edit staff and permissions', 'Can grant what they hold'],
                'rolePermissions.view'  => ['See templates', ''],
                'rolePermissions.edit'  => ['Edit templates', ''],
                'auditLogs.view'        => ['Audit logs', ''],
                'settings'              => ['Shop settings', 'Owner only in practice'],
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
