<?php

use Illuminate\Support\Facades\Broadcast;

// Private channel per user (for notifications, order updates)
Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id
        || (string) $user->_id === (string) $id;
});

// Private admin channel (for new order alerts, stock alerts)
Broadcast::channel('admin.notifications', function ($user) {
    return in_array($user->role ?? null, ['admin', 'owner']);
});

// Private channel per-user for real-time in-app notifications
Broadcast::channel('user.{userId}', function ($user, $userId) {
    return (string) ($user->_id ?? $user->id) === (string) $userId;
});

// Private channel for individual order tracking
Broadcast::channel('order.{orderId}', function ($user, $orderId) {
    $order = \App\Models\Order::find($orderId);
    if (!$order) return false;
    return (string) ($order->userId ?? '') === (string) $user->_id
        || in_array($user->role ?? null, ['admin', 'owner']);
});
