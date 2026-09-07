<?php

/*
 * These run because docker-entrypoint.sh calls `schedule:run` every minute beside the web server.
 * Nothing called it before, so every job below had been defined and never run once - no database
 * backup, and no release of the material held by proofs nobody paid for.
 *
 * Times are Asia/Manila (config/app.php), not UTC.
 *
 * withoutOverlapping() on the long ones takes a cache lock, so a job that outruns its slot cannot
 * be started again beside itself.
 */

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

Schedule::command('db:backup')->dailyAt('02:00')->name('db-backup')->withoutOverlapping();

// Approved proofs that were never paid for hold stock the shop cannot sell. Swept once a day rather
// than hourly: the window is measured in days, and a customer paying an hour late should still land.
Schedule::command('orders:expire-unpaid-proofs')->dailyAt('03:00')->name('expire-unpaid-proofs')->withoutOverlapping();

// Chases finished orders whose balance was never paid. Reminds on a schedule and FLAGS the ones past
// the holding period - it never cancels or writes anything off, because destroying personalised goods
// and forfeiting a deposit is a decision a person makes.
Schedule::command('orders:chase-unpaid-ready')->dailyAt('09:00')->name('chase-unpaid-ready')->withoutOverlapping();

// Dead tokens were never deleted, so the table grew with every login and the customer's Active
// Sessions list filled with months of sessions that could not sign anyone in.
Schedule::command('sanctum:prune-expired --hours=24')->dailyAt('04:00')->name('prune-expired-tokens');
