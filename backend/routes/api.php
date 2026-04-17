<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\InventoryReturnController;
use App\Http\Controllers\MasterlistController;
use App\Http\Controllers\JobOrderController;
use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\SaleController;
use App\Http\Controllers\CartController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\BannerController;
use App\Http\Controllers\AddressController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\TwoFactorController;
use App\Http\Controllers\SessionController;
use App\Http\Controllers\FlashSaleController;
use App\Http\Controllers\OrderRequestController;
use App\Http\Controllers\ShopOrderRequestController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\RolePermissionController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\BillOfMaterialController;
use App\Http\Controllers\VoucherController;
use App\Http\Controllers\WalkInOrderController;

// ─── Auth (Public) ────────────────────────────────────────────────────────────
Route::post('/register',        [AuthController::class, 'register'])->middleware('throttle:10,1');
Route::post('/login',           [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/logout',          [AuthController::class, 'logout'])->middleware('auth:sanctum');
Route::post('/verify-email',    [AuthController::class, 'verify'])->middleware('throttle:5,1');
Route::post('/resend-code',     [AuthController::class, 'resend'])->middleware('throttle:5,1');
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
Route::post('/verify-reset-token', [AuthController::class, 'verifyResetToken'])->middleware('throttle:10,1');
Route::post('/send-reset-code', [AuthController::class, 'sendResetCode'])->middleware('throttle:5,1');
Route::post('/verify-reset-code', [AuthController::class, 'verifyResetCode'])->middleware('throttle:10,1');
Route::post('/reset-password',  [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');
Route::post('/contact',         [AuthController::class, 'contact'])->middleware('throttle:5,1');

// ─── Auth (Protected — any logged-in user) ───────────────────────────────────
Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

// ─── Products (Public — no auth required) ────────────────────────────────────
Route::get('/products/search', [ProductController::class, 'search'])
    ->middleware('throttle:60,1');
Route::get('/products',             [ProductController::class, 'index']);
Route::get('/products/{id}',        [ProductController::class, 'show']);

// ─── Protected — any authenticated user ──────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    // ─── Profile ─────────────────────────────────────────────────────────────
    Route::put('/profile',               [ProfileController::class, 'update']);
    Route::put('/profile/password',      [ProfileController::class, 'updatePassword']);
    Route::post('/profile/avatar',       [ProfileController::class, 'updateAvatar']);
    Route::post('/profile/upload-avatar',[ProfileController::class, 'uploadAvatar']);

    // ─── Orders (Customer) ────────────────────────────────────────────────────
    Route::get('/orders/my',             [OrderController::class, 'myOrders']);
    Route::get('/orders/my/{id}',        [OrderController::class, 'myOrderShow']);
    Route::post('/orders/my/{id}/cancel',[OrderController::class, 'cancelMyOrder']);
    Route::post('/orders',               [OrderController::class, 'store']);

    // ─── Cart ─────────────────────────────────────────────────────────────────
    Route::get('/cart',                  [CartController::class, 'index']);
    Route::post('/cart/sync',            [CartController::class, 'sync']);
    Route::post('/cart/merge',           [CartController::class, 'merge']);
    Route::delete('/cart/clear',         [CartController::class, 'clear']);

    // ─── Address Book ─────────────────────────────────────────────────────────
    Route::get('/addresses',             [AddressController::class, 'index']);
    Route::post('/addresses',            [AddressController::class, 'store']);
    Route::put('/addresses/{id}',        [AddressController::class, 'update']);
    Route::delete('/addresses/{id}',     [AddressController::class, 'destroy']);
    Route::patch('/addresses/{id}/default', [AddressController::class, 'setDefault']);

    // ─── Notifications ────────────────────────────────────────────────────────
    Route::get('/notifications/unread-count',  [NotificationController::class, 'unreadCount']);
    Route::get('/notifications',               [NotificationController::class, 'index']);
    Route::patch('/notifications/read-all',    [NotificationController::class, 'markAllRead']);
    Route::patch('/notifications/{id}/read',   [NotificationController::class, 'markRead']);

    // ─── Active Sessions ─────────────────────────────────────────────────────
    Route::delete('/sessions/others/all', [SessionController::class, 'destroyOthers']);
    Route::get('/sessions',               [SessionController::class, 'index']);
    Route::delete('/sessions/{id}',       [SessionController::class, 'destroy']);

    // ─── My Permissions (any authenticated staff) ────────────────────────────
    Route::get('/my/permissions',         [RolePermissionController::class, 'myPermissions']);
});

// ─── Admin (authenticated + admin role required) ──────────────────────────────
Route::middleware(['auth:sanctum', 'isAdmin'])->group(function () {
    // ─── Store settings (admin) ───────────────────────────────────────────────
    Route::get('/admin/settings',  [SettingsController::class, 'show']);
    Route::put('/admin/settings',  [SettingsController::class, 'update']);

    // ─── Suppliers ────────────────────────────────────────────────────────────
    Route::get('/admin/suppliers',               [SupplierController::class, 'index']);
    Route::post('/admin/suppliers',              [SupplierController::class, 'store']);
    Route::put('/admin/suppliers/{id}',          [SupplierController::class, 'update']);
    Route::delete('/admin/suppliers/{id}',       [SupplierController::class, 'destroy']);

    // ─── Order Stats ──────────────────────────────────────────────────────────
    Route::get('/admin/orders/stats',            [OrderController::class, 'stats']);

    // ─── Products ─────────────────────────────────────────────────────────────
    Route::get('/admin/products',                [ProductController::class, 'adminIndex']);
    Route::get('/admin/products/available-inventory', [ProductController::class, 'availableInventory']);
    Route::post('/admin/products',               [ProductController::class, 'store']);
    Route::put('/admin/products/{id}',           [ProductController::class, 'update']);
    Route::delete('/admin/products/{id}',        [ProductController::class, 'destroy']);
    Route::post('/admin/products/{id}/toggle-publish', [ProductController::class, 'togglePublish']);
    Route::post('/admin/upload-image',           [ProductController::class, 'uploadImage']);

    // ─── Inventory ───────────────────────────────────────────────────────────
    Route::get('/admin/inventory/recent-movements',   [InventoryController::class, 'recentMovements']);
    Route::get('/admin/inventory',                    [InventoryController::class, 'index']);
    Route::post('/admin/inventory',                   [InventoryController::class, 'store']);
    Route::get('/admin/inventory/{id}',               [InventoryController::class, 'show']);
    Route::get('/admin/inventory/{id}/history',       [InventoryController::class, 'history']);
    Route::put('/admin/inventory/{id}',               [InventoryController::class, 'update']);
    Route::post('/admin/inventory/{id}/adjust-stock', [InventoryController::class, 'adjustStock']);
    Route::delete('/admin/inventory/{id}',            [InventoryController::class, 'destroy']);

    // ─── Masterlist ──────────────────────────────────────────────────────────
    Route::get('/admin/masterlist',                   [MasterlistController::class, 'index']);
    Route::put('/admin/masterlist',                   [MasterlistController::class, 'update']);

    // ─── Returns (RTV) ───────────────────────────────────────────────────────
    Route::get('/admin/returns',                      [InventoryReturnController::class, 'index']);
    Route::get('/admin/returns/stats',                [InventoryReturnController::class, 'stats']);
    Route::post('/admin/returns',                     [InventoryReturnController::class, 'store']);
    Route::put('/admin/returns/{id}',                 [InventoryReturnController::class, 'update']);

    // ─── Orders (Admin) — SECURITY: only admin can list/view all orders ───────
    Route::get('/orders',               [OrderController::class, 'index']);
    Route::get('/orders/{id}',          [OrderController::class, 'show']);
    Route::patch('/orders/{id}/status', [OrderController::class, 'updateStatus']);
    Route::put('/admin/orders/{id}',    [OrderController::class, 'adminUpdate']);
    Route::get('/admin/orders',         [OrderController::class, 'adminIndex']);

    // ─── Job Orders ───────────────────────────────────────────────────────────
    Route::get('/admin/job-orders',              [JobOrderController::class, 'index']);
    Route::get('/admin/job-orders/schedule',     [JobOrderController::class, 'schedule']);
    Route::get('/admin/job-orders/{id}',         [JobOrderController::class, 'show']);
    Route::post('/admin/job-orders',             [JobOrderController::class, 'store']);
    Route::put('/admin/job-orders/{id}',         [JobOrderController::class, 'update']);

    // ─── Activity Logs ────────────────────────────────────────────────────────
    Route::get('/admin/activity-logs',           [ActivityLogController::class, 'index']);
    // ─── Design Approval ──────────────────────────────────────────────────────
    Route::post('/admin/orders/{id}/approve-design', [OrderController::class, 'approveDesign']);
    Route::post('/admin/orders/{id}/reject-design',  [OrderController::class, 'rejectDesign']);

    // ─── Audit Logs ───────────────────────────────────────────────────────────
    Route::get('/admin/audit-logs',              [AuditLogController::class, 'index']);
    Route::get('/admin/audit-logs/summary',      [AuditLogController::class, 'summary']);
    Route::get('/admin/audit-logs/inventory/{id}', [AuditLogController::class, 'byInventory']);
    Route::post('/admin/audit-logs',             [AuditLogController::class, 'store']);

    // ─── Sales ────────────────────────────────────────────────────────────────
    Route::get('/admin/sales',                   [SaleController::class, 'index']);
    Route::get('/admin/sales/summary',           [SaleController::class, 'summary']);
    Route::get('/admin/sales/top-products',      [SaleController::class, 'topProducts']);
    Route::get('/admin/sales/{id}',              [SaleController::class, 'show']);
    Route::post('/admin/sales',                  [SaleController::class, 'store']);
    Route::put('/admin/sales/{id}',              [SaleController::class, 'update']);

    // ─── Banners ──────────────────────────────────────────────────────────────
    Route::get('/admin/banners',                 [BannerController::class, 'index']);
    Route::post('/admin/banners',                [BannerController::class, 'store']);
    Route::put('/admin/banners/{id}',            [BannerController::class, 'update']);
    Route::delete('/admin/banners/{id}',         [BannerController::class, 'destroy']);
    Route::put('/admin/banners/{id}/publish',    [BannerController::class, 'publish']);
    Route::put('/admin/banners/{id}/unpublish',  [BannerController::class, 'unpublish']);

    // ─── Flash Sales ─────────────────────────────────────────────────────────
    Route::get('/admin/flash-sales',              [FlashSaleController::class, 'index']);
    Route::post('/admin/flash-sales',             [FlashSaleController::class, 'store']);
    Route::put('/admin/flash-sales/{id}',         [FlashSaleController::class, 'update']);
    Route::delete('/admin/flash-sales/{id}',      [FlashSaleController::class, 'destroy']);
    Route::patch('/admin/flash-sales/{id}/toggle', [FlashSaleController::class, 'toggle']);

    // ─── Order Requests (Admin) ──────────────────────────────────────────────
    Route::get('/admin/order-requests',               [OrderRequestController::class, 'index']);
    Route::get('/admin/order-requests/stats',         [OrderRequestController::class, 'stats']);
    Route::get('/admin/order-requests/{id}',          [OrderRequestController::class, 'show']);
    Route::patch('/admin/order-requests/{id}/status', [OrderRequestController::class, 'updateStatus']);

    // ─── Role Permissions ────────────────────────────────────────────────────
    Route::get('/admin/role-permissions',             [RolePermissionController::class, 'index']);
    Route::put('/admin/role-permissions/{role}',      [RolePermissionController::class, 'update']);

    // ─── Staff Management ────────────────────────────────────────────────────
    Route::get('/admin/staff',                        [StaffController::class, 'index']);
    Route::post('/admin/staff',                       [StaffController::class, 'store']);
    Route::put('/admin/staff/{id}',                   [StaffController::class, 'update']);
    Route::delete('/admin/staff/{id}',                [StaffController::class, 'destroy']);

    // ─── Bill of Materials ─────────────────────────────────────────────────────────────────────
    Route::get('/admin/bom',                          [BillOfMaterialController::class, 'index']);
    Route::post('/admin/bom',                         [BillOfMaterialController::class, 'store']);
    Route::get('/admin/bom/by-product/{name}',        [BillOfMaterialController::class, 'byProduct']);
    Route::get('/admin/bom/{id}',                     [BillOfMaterialController::class, 'show']);
    Route::put('/admin/bom/{id}',                     [BillOfMaterialController::class, 'update']);
    Route::delete('/admin/bom/{id}',                  [BillOfMaterialController::class, 'destroy']);

    // ─── QC Endpoint ───────────────────────────────────────────────────────────────────────────
    Route::post('/admin/job-orders/{id}/qc',          [JobOrderController::class, 'submitQC']);

    // ─── Record Payment ────────────────────────────────────────────────────────────────────────
    Route::post('/admin/orders/{id}/record-payment',  [OrderController::class, 'recordPayment']);

    // ── Walk-in / POS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    Route::post('/admin/orders/walk-in',       [WalkInOrderController::class, 'store']);

    // ── Vouchers ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    Route::get('/admin/vouchers',              [VoucherController::class, 'index']);
    Route::post('/admin/vouchers',             [VoucherController::class, 'store']);
    Route::put('/admin/vouchers/{id}',         [VoucherController::class, 'update']);
    Route::delete('/admin/vouchers/{id}',      [VoucherController::class, 'destroy']);
    Route::patch('/admin/vouchers/{id}/toggle', [VoucherController::class, 'toggle']);
});

// ─── Order Requests (Customer) ───────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    // ── Vouchers (Customer) ───────────────────────────────────────────────
    Route::post('/vouchers/apply',                [VoucherController::class, 'apply']);

    Route::post('/order-requests',                [OrderRequestController::class, 'store']);
    Route::get('/my/order-requests',              [OrderRequestController::class, 'myRequests']);
    Route::post('/order-requests/upload-design',  [OrderRequestController::class, 'uploadDesign']);
    Route::post('/order-requests/my/{id}/cancel', [ShopOrderRequestController::class, 'cancel']);

    // ─── Shop Order Tracking (Customer) ──────────────────────────────────────
    Route::get('/shop/order-requests',            [ShopOrderRequestController::class, 'index']);
    Route::get('/shop/order-requests/{id}',       [ShopOrderRequestController::class, 'show']);
});

// ─── Storefront (Public — no auth required) ───────────────────────────────────
Route::get('/storefront/banners',                [BannerController::class, 'storefront']);
Route::get('/storefront/flash-sales',            [FlashSaleController::class, 'storefront']);

// ─── 2FA (Protected — auth:sanctum) ─────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/2fa/send',          [TwoFactorController::class, 'sendOtp']);
    Route::post('/2fa/verify',        [TwoFactorController::class, 'verifyOtp']);
    Route::post('/2fa/remember-device', [TwoFactorController::class, 'rememberDevice']);
    Route::post('/2fa/check-device',  [TwoFactorController::class, 'checkDevice']);
});

// ─── Payments (PayMongo) ─────────────────────────────────────────────────────
Route::post('/payment/webhook',     [PaymentController::class, 'webhook']);
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/payment/create-link', [PaymentController::class, 'createLink']);
});
