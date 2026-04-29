<?php

namespace App\Providers;

use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\ServiceProvider;

class BroadcastServiceProvider extends ServiceProvider
{
    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Route registered in api.php as /api/broadcasting/auth with auth:sanctum.
        // Channels are loaded via withRouting(channels:) in bootstrap/app.php.
    }
}
