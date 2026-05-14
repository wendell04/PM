<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
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
use App\Http\Controllers\AdminAnalyticsController;
use App\Http\Controllers\ReviewController;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\CollectionController;
use App\Http\Controllers\HealthController;

// ─── Health Check ─────────────────────────────────────────────────────────────
Route::get('/health', [HealthController::class, 'check']);

// ─── Auth (Public) ────────────────────────────────────────────────────────────
Route::post('/register',        [AuthController::class, 'register'])->middleware('throttle:10,1');
Route::post('/login',           [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/logout',          [AuthController::class, 'logout'])->middleware('auth:sanctum');
// Aliases (tooling / documentation compatibility)
Route::post('/auth/login',      [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/auth/logout',     [AuthController::class, 'logout'])->middleware('auth:sanctum');
Route::get('/auth/me', function (Request $request) {
    return response()->json($request->user());
})->middleware('auth:sanctum');
Route::post('/verify-email',    [AuthController::class, 'verify'])->middleware('throttle:5,1');
Route::post('/resend-code',     [AuthController::class, 'resend'])->middleware('throttle:5,1');
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
Route::post('/verify-reset-token', [AuthController::class, 'verifyResetToken'])->middleware('throttle:10,1');
Route::post('/send-reset-code', [AuthController::class, 'sendResetCode'])->middleware('throttle:5,1');
Route::post('/verify-reset-code', [AuthController::class, 'verifyResetCode'])->middleware('throttle:10,1');
Route::post('/reset-password',  [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');
Route::post('/contact',         [AuthController::class, 'contact'])->middleware('throttle:5,1');
Route::post('/unlock-request',  [AuthController::class, 'unlockRequest'])->middleware('throttle:3,1');

// ─── Auth (Protected — any logged-in user) ───────────────────────────────────
Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

// ─── Public Store Settings ───────────────────────────────────────────────────
Route::get('/public/settings', [SettingsController::class, 'public']);

// ─── Products (Public — no auth required) ────────────────────────────────────
Route::middleware('throttle:60,1')->group(function () {
    Route::get('/products/search',        [ProductController::class, 'search']);
    Route::get('/products',               [ProductController::class, 'index']);
    Route::get('/products/{id}',          [ProductController::class, 'show']);
    Route::get('/products/{id}/reviews',  [ReviewController::class, 'productReviews']);
    Route::get('/storefront/reviews',     [ReviewController::class, 'storefrontReviews']);
    Route::get('/storefront/collections',          [CollectionController::class, 'storefrontIndex']);
    Route::get('/storefront/collections/{slug}',   [CollectionController::class, 'storefrontShow']);
});

// ─── Protected — any authenticated user ──────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    // Reverb broadcasting auth
    Route::post('/broadcasting/auth', function (Request $request) {
        return Broadcast::auth($request);
    });

    // ─── Profile ─────────────────────────────────────────────────────────────
    Route::put('/profile',               [ProfileController::class, 'update']);
    Route::put('/profile/password',      [ProfileController::class, 'updatePassword']);
    Route::post('/profile/avatar',       [ProfileController::class, 'updateAvatar']);
    Route::post('/profile/upload-avatar',[ProfileController::class, 'uploadAvatar']);

    // ─── Orders (Customer) ────────────────────────────────────────────────────
    Route::get('/orders/my',                            [OrderController::class, 'myOrders']);
    Route::get('/orders/my/{id}',                       [OrderController::class, 'myOrderShow']);
    Route::post('/orders/my/{id}/cancel',               [OrderController::class, 'cancelMyOrder']);
    Route::post('/orders/my/{id}/reupload-design',       [OrderController::class, 'reuploadDesign']);
    Route::post('/orders/my/{id}/approve-admin-design', [OrderController::class, 'approveAdminDesign']);
    Route::post('/orders/my/{id}/request-revision',     [OrderController::class, 'requestDesignRevision']);
    Route::post('/orders',                              [OrderController::class, 'store']);

    // ─── Reviews (Customer) ───────────────────────────────────────────────────
    Route::get('/orders/my/{orderId}/review',           [ReviewController::class, 'myOrderReview']);
    Route::post('/orders/my/{orderId}/review',          [ReviewController::class, 'store']);

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

    // ─── Chat ────────────────────────────────────────────────────────────────
    Route::get('/chat/conversations',             [ChatController::class, 'index']);
    Route::get('/chat/conversations/{id}',        [ChatController::class, 'show']);
    Route::post('/chat/messages',                 [ChatController::class, 'store']);
    Route::post('/chat/upload-image',             [ChatController::class, 'uploadImage']);
    Route::patch('/chat/conversations/{id}/read', [ChatController::class, 'markAsRead']);
    Route::patch('/chat/heartbeat',              [ChatController::class, 'heartbeat']);
});

// ─── Owner/Admin only — store config, staff management, role permissions ─────
Route::middleware(['auth:sanctum', 'isAdmin:owner,admin'])->group(function () {
    Route::get('/admin/settings',                   [SettingsController::class, 'show']);
    Route::put('/admin/settings',                   [SettingsController::class, 'update']);
    Route::put('/admin/settings/shipping',          [SettingsController::class, 'shippingUpdate']);

    Route::get('/admin/role-permissions',            [RolePermissionController::class, 'index']);
    Route::post('/admin/role-permissions',           [RolePermissionController::class, 'store']);
    Route::put('/admin/role-permissions/{role}',     [RolePermissionController::class, 'update']);
    Route::delete('/admin/role-permissions/{role}',  [RolePermissionController::class, 'destroy']);
Route::get('/admin/staff',                            [StaffController::class, 'index']);
    Route::post('/admin/staff',                           [StaffController::class, 'store']);
    Route::put('/admin/staff/{id}',                       [StaffController::class, 'update']);
    Route::delete('/admin/staff/{id}',                    [StaffController::class, 'destroy']);
    Route::get('/admin/customers',                        [StaffController::class, 'customers']);
    Route::post('/admin/customers/{id}/unlock',           [StaffController::class, 'unlockCustomer']);
    Route::get('/admin/unlock-requests',                  [StaffController::class, 'unlockRequests']);
    Route::post('/admin/unlock-requests/{id}/approve',    [StaffController::class, 'approveUnlock']);
    Route::post('/admin/unlock-requests/{id}/deny',       [StaffController::class, 'denyUnlock']);
});

// ─── Admin (authenticated + any staff role) ───────────────────────────────────
Route::middleware(['auth:sanctum', 'isAdmin'])->group(function () {

    // ─── Suppliers ────────────────────────────────────────────────────────────
    Route::get('/admin/suppliers',               [SupplierController::class, 'index']);
    Route::post('/admin/suppliers',              [SupplierController::class, 'store']);
    Route::put('/admin/suppliers/{id}',          [SupplierController::class, 'update']);
    Route::delete('/admin/suppliers/{id}',       [SupplierController::class, 'destroy']);

    // ─── Order Stats ──────────────────────────────────────────────────────────
    Route::get('/admin/orders/stats',            [OrderController::class, 'stats']);

    // ─── Dashboard & reports (stubs — see AdminAnalyticsController) ───────────
    Route::get('/admin/dashboard/stats',         [AdminAnalyticsController::class, 'dashboardStats']);
    Route::get('/admin/reports/sales',           [AdminAnalyticsController::class, 'reportsSales']);
    Route::get('/admin/reports/inventory',       [AdminAnalyticsController::class, 'reportsInventory']);

    // ─── Collections ─────────────────────────────────────────────────────────
    Route::get('/admin/collections',                         [CollectionController::class, 'adminIndex']);
    Route::post('/admin/collections',                        [CollectionController::class, 'store']);
    Route::put('/admin/collections/{id}',                    [CollectionController::class, 'update']);
    Route::delete('/admin/collections/{id}',                 [CollectionController::class, 'destroy']);
    Route::patch('/admin/collections/{id}/toggle-publish',   [CollectionController::class, 'togglePublish']);
    Route::get('/admin/collections/{id}/products',           [CollectionController::class, 'adminProducts']);

    // ─── Products ─────────────────────────────────────────────────────────────
    Route::get('/admin/products',                [ProductController::class, 'adminIndex']);
    Route::get('/admin/products/available-inventory', [ProductController::class, 'availableInventory']);
    Route::get('/admin/products/{id}',           [ProductController::class, 'adminShow']);
    Route::post('/admin/products',               [ProductController::class, 'store']);
    Route::put('/admin/products/{id}',           [ProductController::class, 'update']);
    Route::delete('/admin/products/{id}',        [ProductController::class, 'destroy']);
    Route::post('/admin/products/{id}/toggle-publish', [ProductController::class, 'togglePublish']);
    Route::post('/admin/upload-image',           [ProductController::class, 'uploadImage']);
    Route::post('/admin/upload-file',            [ProductController::class, 'uploadFile']);

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
    Route::get('/admin/units',                        [MasterlistController::class, 'units']);
    Route::post('/admin/units',                      [MasterlistController::class, 'saveUnit']);

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
    Route::get('/admin/orders/{id}',    [OrderController::class, 'show']);

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
    Route::post('/admin/orders/{id}/upload-design',   [OrderController::class, 'adminUploadDesign']);
    Route::post('/admin/orders/{id}/approve-upload',  [OrderController::class, 'approveUploadDesign']);

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

    // ─── Bill of Materials ─────────────────────────────────────────────────────────────────────
    Route::get('/admin/bom',                          [BillOfMaterialController::class, 'index']);
    Route::post('/admin/bom',                         [BillOfMaterialController::class, 'store']);
    Route::get('/admin/bom/by-product/{name}',        [BillOfMaterialController::class, 'byProduct']);
    Route::get('/admin/bom/{id}',                     [BillOfMaterialController::class, 'show']);
    Route::put('/admin/bom/{id}',                     [BillOfMaterialController::class, 'update']);
    Route::delete('/admin/bom/{id}',                  [BillOfMaterialController::class, 'destroy']);

    // ─── QC Endpoint ───────────────────────────────────────────────────────────────────────────
    Route::post('/admin/job-orders/{id}/qc',          [JobOrderController::class, 'submitQC']);

    // ─── Admin notifications (aliases — same handlers as /api/notifications) ────
    Route::get('/admin/notifications',                 [NotificationController::class, 'index']);
    Route::patch('/admin/notifications/{id}/read',     [NotificationController::class, 'markRead']);

    // ─── Order delete (hard) ──────────────────────────────────────────────────────────────────
    Route::delete('/admin/orders/{id}',               [OrderController::class, 'hardDelete']);

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

    // ─── Reviews (Admin) ─────────────────────────────────────────────────────
    Route::get('/admin/reviews',                        [ReviewController::class, 'adminIndex']);
    Route::patch('/admin/reviews/{id}/visibility',      [ReviewController::class, 'toggleVisibility']);
    Route::delete('/admin/reviews/{id}',                [ReviewController::class, 'destroy']);
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
    Route::post('/2fa/toggle',        [TwoFactorController::class, 'toggle']);

    // Device token revoke
    Route::delete('/2fa/device/{token}', [TwoFactorController::class, 'revokeDevice']);
});

// ─── Payments (PayMongo) ─────────────────────────────────────────────────────
Route::post('/payment/webhook',     [PaymentController::class, 'webhook']);
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/payment/create-link',              [PaymentController::class, 'createLink']);
    Route::post('/payment/initiate',                 [PaymentController::class, 'initiatePayment']);
    Route::post('/payment/verify-intent',            [PaymentController::class, 'verifyIntent']);
    Route::post('/payment/order-request-link',       [PaymentController::class, 'createOrderRequestLink']);
    Route::post('/payment/create-order-pay-link',    [PaymentController::class, 'createOrderPayLink']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/2fa/send',            [TwoFactorController::class, 'sendOtp']);
    Route::post('/2fa/verify',          [TwoFactorController::class, 'verifyOtp']);
    Route::post('/2fa/remember-device', [TwoFactorController::class, 'rememberDevice']);
    Route::post('/2fa/check-device',    [TwoFactorController::class, 'checkDevice']);
    Route::post('/2fa/toggle',          [TwoFactorController::class, 'toggle']);
    Route::post('/2fa/method',          [TwoFactorController::class, 'updateMethod']);
    Route::delete('/2fa/device/{token}',[TwoFactorController::class, 'revokeDevice']);

    // ── Google Authenticator (TOTP) ──────────────────────────────────────
    Route::post('/2fa/totp/setup',      [TwoFactorController::class, 'setupTotp']);
    Route::post('/2fa/totp/confirm',    [TwoFactorController::class, 'confirmTotp']);
    Route::post('/2fa/totp/verify',     [TwoFactorController::class, 'verifyTotp']);
    Route::delete('/2fa/totp',          [TwoFactorController::class, 'removeTotp']);
});
