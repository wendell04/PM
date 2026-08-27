<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/**
 * Invalidate every per-user secret that leaked through the repository.
 *
 * backend/storage/backups/2026-05-15_020001/users.json was committed to a PUBLIC GitHub repository.
 * It carries 9 password hashes, 5 api_token values, 2 totp_secret seeds, 2 reset_token values and 3
 * device_tokens. Untracking the file stopped the bleeding; it did not recall what is already in the
 * history, and a public repository is scraped continuously whether or not anyone has starred it.
 *
 * The api_token values are the urgent ones: they are live sessions, usable immediately by anyone who
 * has the file, with no password needed. The totp_secret seeds are the worst ones: they generate
 * valid 2FA codes forever, so changing a password does not close that door - only replacing the seed
 * does.
 *
 * WHAT THIS DOES NOT TOUCH: passwords. Clearing them would lock everyone out of their own accounts,
 * and the hashes are bcrypt - slow to attack, and worthless against a strong password. Forcing a
 * reset is the owner's call to make per account, not something to do to thirteen people at once
 * without warning. This flags them instead.
 */
class RotateUserSecrets extends Command
{
    protected $signature   = 'security:rotate-user-secrets
                              {--dry-run : Show what would change without writing}';
    protected $description = 'Invalidate api_token, totp_secret, reset_token and device_tokens after the repo leak';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');

        $users = User::all();
        $touched = 0;
        $tokens = 0; $totps = 0; $resets = 0; $devices = 0;

        foreach ($users as $u) {
            $hits = [];

            if (!empty($u->api_token))     { $hits[] = 'api_token';     $tokens++; }
            if (!empty($u->totp_secret))   { $hits[] = 'totp_secret';   $totps++; }
            if (!empty($u->reset_token))   { $hits[] = 'reset_token';   $resets++; }
            if (!empty($u->device_tokens)) { $hits[] = 'device_tokens'; $devices++; }

            if (!$hits) continue;

            $this->line(sprintf('  %-38s %s', $u->email ?? $u->_id, implode(', ', $hits)));
            $touched++;

            if ($dry) continue;

            $u->api_token             = null;
            $u->totp_secret           = null;
            $u->totp_confirmed        = false;
            $u->totp_failed_attempts  = 0;
            $u->reset_token           = null;
            $u->reset_token_expires_at = null;
            $u->device_tokens         = [];
            $u->save();
        }

        $this->newLine();
        $this->info(($dry ? '[dry run] ' : '') . sprintf(
            '%d of %d account(s) affected - api_token %d, totp_secret %d, reset_token %d, device_tokens %d.',
            $touched, $users->count(), $tokens, $totps, $resets, $devices
        ));

        $this->newLine();
        $this->warn('AFTER RUNNING THIS:');
        $this->line('  - Everyone is signed out. That is the point: those sessions were usable by anyone holding the file.');
        $this->line('  - Anyone who had 2FA must enrol again. Their old seed generates codes that no longer work.');
        $this->line('  - Passwords are NOT changed. The hashes leaked, so ask anyone with a weak or reused password');
        $this->line('    to change it - but locking thirteen people out unannounced is your call, not this command\'s.');
        $this->newLine();
        $this->line('  This does not remove the file from the repository history. Making the repo PRIVATE is the');
        $this->line('  fastest thing that reduces exposure, and it takes about thirty seconds.');

        return self::SUCCESS;
    }
}
