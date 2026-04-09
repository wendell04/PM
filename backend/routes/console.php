<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::call(function () {
    \App\Models\User::where('is_verified', false)
        ->where('created_at', '<', now()->subHours(24))
        ->delete();
})->daily()->name('purge-unverified-accounts');
