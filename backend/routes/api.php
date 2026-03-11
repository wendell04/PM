<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\OrderController;

// ─── Auth (Public) ────────────────────────────────────────────────────────────
Route::post('/register',        [AuthController::class, 'register']);
Route::post('/login',           [AuthController::class, 'login']);
Route::post('/logout',          [AuthController::class, 'logout']);
Route::post('/verify-email',    [AuthController::class, 'verifyEmail']);
Route::post('/resend-code',     [AuthController::class, 'resendCode']);
Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/reset-password',  [AuthController::class, 'resetPassword']);

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
Route::get('/products',         [ProductController::class, 'index']);
Route::get('/products/{id}',    [ProductController::class, 'show']);

// ─── Orders (Protected — authenticated customers only) ───────────────────────
Route::get('/orders/my',        [OrderController::class, 'myOrders']);
Route::get('/orders/my/{id}',   [OrderController::class, 'myOrderShow']);
Route::post('/orders',          [OrderController::class, 'store']);

// ─── Admin Routes (Protected — owner/admin only) ─────────────────────────────
// Middleware checks are done inside each controller method via isAdmin() helper.
// You can later move these behind a middleware group when needed.
Route::get('/admin/products',        [ProductController::class, 'adminIndex']);
Route::post('/admin/products',       [ProductController::class, 'store']);
Route::put('/admin/products/{id}',   [ProductController::class, 'update']);
Route::delete('/admin/products/{id}',[ProductController::class, 'destroy']);

Route::get('/admin/orders',          [OrderController::class, 'adminIndex']);
Route::put('/admin/orders/{id}',     [OrderController::class, 'adminUpdate']);