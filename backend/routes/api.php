<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\JobOrderController;
use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\SaleController;
use App\Http\Controllers\CartController;
use App\Http\Controllers\SupplierController;

// ─── Auth (Public) ────────────────────────────────────────────────────────────
Route::post('/register',        [AuthController::class, 'register'])->middleware('throttle:10,1');
Route::post('/login',           [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/logout',          [AuthController::class, 'logout']);
Route::post('/verify-email',    [AuthController::class, 'verify']);
Route::post('/resend-code',     [AuthController::class, 'resend'])->middleware('throttle:5,1');
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
Route::post('/verify-reset-token', [AuthController::class, 'verifyResetToken'])->middleware('throttle:10,1');
Route::post('/send-reset-code', [AuthController::class, 'sendResetCode'])->middleware('throttle:5,1');
Route::post('/verify-reset-code', [AuthController::class, 'verifyResetCode'])->middleware('throttle:10,1');
Route::post('/reset-password',  [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');
Route::post('/contact',         [AuthController::class, 'contact']); // Contact form

// ─── Auth (Protected — any logged-in user) ───────────────────────────────────
Route::get('/user', function (Request $request) {
    $token = $request->bearerToken();
    if (!$token) return response()->json(['message' => 'unauthenticated'], 401);
    $user = \App\Models\User::where('api_token', hash('sha256', $token))->first();
    if (!$user) return response()->json(['message' => 'unauthenticated'], 401);
    return $user;
});

Route::put('/profile',          [ProfileController::class, 'update']);
Route::put('/profile/password', [ProfileController::class, 'updatePassword']);

// ─── Products (Public — any logged-in customer can browse) ───────────────────
Route::get('/products',             [ProductController::class, 'index']);
Route::get('/products/{id}',        [ProductController::class, 'show']);

// ─── Orders (Protected — authenticated customers only) ───────────────────────
Route::get('/orders/my',        [OrderController::class, 'myOrders']);
Route::get('/orders/my/{id}',   [OrderController::class, 'myOrderShow']);
Route::post('/orders',          [OrderController::class, 'store']);

// ─── Cart (Protected — authenticated customers only) ─────────────────────────
Route::middleware('auth.token')->group(function () {
    Route::get('/cart', [CartController::class, 'index']);
    Route::post('/cart/sync', [CartController::class, 'sync']);
    Route::post('/cart/merge', [CartController::class, 'merge']);
    Route::delete('/cart/clear', [CartController::class, 'clear']);

    // Suppliers Admin (Protected by auth.token + isAdmin() check)
    Route::get('/admin/suppliers',               [SupplierController::class, 'index']);
    Route::post('/admin/suppliers',              [SupplierController::class, 'store']);
    Route::put('/admin/suppliers/{id}',          [SupplierController::class, 'update']);
    Route::delete('/admin/suppliers/{id}',       [SupplierController::class, 'destroy']);

    // Order Stats (Protected by auth.token + getAuthUser() check)
    Route::get('/admin/orders/stats',            [OrderController::class, 'stats']);

    // ─── Admin Routes (Protected — owner/admin only) ─────────────────────────
    // All other admin routes moved here under auth.token middleware

    // Products Admin
    Route::get('/admin/products',              [ProductController::class, 'adminIndex']);
    Route::get('/admin/products/available-inventory', [ProductController::class, 'availableInventory']);
    Route::post('/admin/products',             [ProductController::class, 'store']);
    Route::put('/admin/products/{id}',         [ProductController::class, 'update']);
    Route::delete('/admin/products/{id}',      [ProductController::class, 'destroy']);
    Route::post('/admin/products/{id}/toggle-publish', [ProductController::class, 'togglePublish']);
    Route::post('/admin/upload-image',         [ProductController::class, 'uploadImage']);

    // Inventory Admin
    Route::get('/admin/inventory',              [InventoryController::class, 'index']);
    Route::get('/admin/inventory/{id}',         [InventoryController::class, 'show']);
    Route::get('/admin/inventory/{id}/history', [InventoryController::class, 'history']);
    Route::post('/admin/inventory',             [InventoryController::class, 'store']);
    Route::put('/admin/inventory/{id}',         [InventoryController::class, 'update']);
    Route::post('/admin/inventory/{id}/adjust-stock', [InventoryController::class, 'adjustStock']);
    Route::delete('/admin/inventory/{id}',      [InventoryController::class, 'destroy']);

    // Orders Admin
    Route::get('/admin/orders',          [OrderController::class, 'adminIndex']);
    Route::put('/admin/orders/{id}',     [OrderController::class, 'adminUpdate']);

    // Job Orders Admin (Production Schedule)
    Route::get('/admin/job-orders',              [JobOrderController::class, 'index']);
    Route::get('/admin/job-orders/schedule',     [JobOrderController::class, 'schedule']);
    Route::get('/admin/job-orders/{id}',         [JobOrderController::class, 'show']);
    Route::post('/admin/job-orders',             [JobOrderController::class, 'store']);
    Route::put('/admin/job-orders/{id}',         [JobOrderController::class, 'update']);

    // Audit Logs Admin
    Route::get('/admin/audit-logs',              [AuditLogController::class, 'index']);
    Route::get('/admin/audit-logs/summary',      [AuditLogController::class, 'summary']);
    Route::get('/admin/audit-logs/inventory/{id}', [AuditLogController::class, 'byInventory']);
    Route::post('/admin/audit-logs',             [AuditLogController::class, 'store']);

    // Sales Admin
    Route::get('/admin/sales',                   [SaleController::class, 'index']);
    Route::get('/admin/sales/summary',           [SaleController::class, 'summary']);
    Route::get('/admin/sales/{id}',              [SaleController::class, 'show']);
    Route::post('/admin/sales',                  [SaleController::class, 'store']);
    Route::put('/admin/sales/{id}',              [SaleController::class, 'update']);
});