<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/logout', [AuthController::class, 'logout']);
Route::post('/verify', [AuthController::class, 'verify']);
Route::post('/resend-code', [AuthController::class, 'resend']);
Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/reset-password', [AuthController::class, 'resetPassword']);
Route::post('/profile', [AuthController::class, 'updateProfile']);
Route::post('/profile/password', [AuthController::class, 'updatePassword']);

Route::get('/user', function (Request $request) {
    
    $token = $request->bearerToken();
    if (!$token) return response()->json(['message' => 'unauthenticated'], 401);
    
    $user = \App\Models\User::where('api_token', hash('sha256', $token))->first();
    if (!$user) return response()->json(['message' => 'unauthenticated'], 401);
    return $user;
});
