<?php

namespace App\Console\Commands;

use App\Http\Controllers\ProfileController;
use App\Mail\AccountSecurityAlertMail;
use App\Mail\PasswordResetLinkMail;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Break-glass recovery of the shop owner's account - run from the server console only.
 *
 *     php artisan owner:recover --email=new.address@gmail.com
 *
 * For the day the owner is locked out for good: the account was taken over and its email pointed
 * elsewhere, or the owner lost the inbox. Nobody can edit the owner from inside the app (not even a
 * Super Admin), which is deliberate, so the way back is here, where only someone with access to the
 * server can reach it. Confirm the owner's identity in person or by phone BEFORE running it.
 *
 * It moves the account to the new email, signs it out everywhere, turns off two-step sign-in (the
 * attacker may have set their own), clears any lockout, and emails a password link to the new
 * address. Both the old and the new address are told, and it goes in the audit log.
 */
class RecoverOwner extends Command
{
    protected $signature = 'owner:recover
                            {--email= : The owner\'s new email, confirmed with the owner in person or by phone}
                            {--id= : Which owner, when there is more than one}
                            {--yes : Do not ask for confirmation}';
    protected $description = 'Recover the shop owner\'s account: new email, signed out everywhere, 2FA off, password link sent';

    public function handle(): int
    {
        $email = strtolower(trim((string) $this->option('email')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100) {
            $this->error('Give the owner\'s new email: --email=name@gmail.com');
            return self::FAILURE;
        }

        $owners = User::where('role', config('rbac.owner_role', 'owner'))->get();
        if ($this->option('id')) $owners = $owners->filter(fn ($u) => (string) $u->_id === (string) $this->option('id'))->values();
        if ($owners->isEmpty()) {
            $this->error('No owner account found. Create the owner from Staff and access instead.');
            return self::FAILURE;
        }
        if ($owners->count() > 1) {
            $this->error('There is more than one owner. Pick one with --id=:');
            foreach ($owners as $o) $this->line('  ' . $o->_id . '  ' . ProfileController::mask((string) $o->email));
            return self::FAILURE;
        }
        $owner = $owners->first();
        if (User::emailIs($email)->where('_id', '!=', $owner->_id)->exists()) {
            $this->error('That email already belongs to another account.');
            return self::FAILURE;
        }

        $old = (string) $owner->email;
        $this->line("Owner:     {$owner->firstName} {$owner->lastName}");
        $this->line('Email now: ' . ProfileController::mask($old));
        $this->line("New email: {$email}");
        if (!$this->option('yes') && !$this->confirm('Have you confirmed this person is the owner, in person or by phone? Recover the account now?')) {
            $this->line('Nothing changed.');
            return self::FAILURE;
        }

        $owner->email                 = $email;
        $owner->is_verified           = true;
        $owner->two_factor_enabled    = false;
        $owner->two_factor_method     = 'email';
        $owner->totp_secret           = null;
        $owner->totp_confirmed        = false;
        $owner->failed_login_attempts = 0;
        $owner->login_locked_until    = null;
        $owner->pendingEmail = $owner->pendingEmailCode = $owner->pendingEmailExpiresAt = $owner->pendingEmailAttempts = null;
        // A password link, the same kind "Forgot password" sends, valid 30 minutes.
        $plain = Str::random(60);
        $owner->reset_token            = hash('sha256', $plain);
        $owner->reset_token_expires_at = now('Asia/Manila')->addMinutes(30)->toDateTimeString();
        $owner->reset_code = $owner->reset_code_expires_at = null;
        $owner->save();
        $owner->tokens()->delete();

        $resetUrl = rtrim((string) env('FRONTEND_URL', 'http://localhost:3000'), '/') . "/?reset_token={$plain}&email=" . urlencode($email);
        $sent = [];
        try { Mail::to($email)->send(new PasswordResetLinkMail($resetUrl, (string) $owner->firstName)); $sent[] = 'password link to the new email'; }
        catch (\Throwable $e) { $this->warn('Password link email failed: ' . $e->getMessage()); }
        $when = now('Asia/Manila')->format('M j, Y g:i A');
        foreach (array_unique([$old, $email]) as $to) {
            try {
                Mail::to($to)->send(new AccountSecurityAlertMail((string) $owner->firstName, 'Your owner account was recovered',
                    'Your account was recovered by the system administrator',
                    'The owner account of Personalize Me Prints was moved to ' . ProfileController::mask($email) . ', signed out on every device, and two-step sign-in was turned off. A link to set a new password was sent to the new address. If you did not ask for this, contact the system developer right away.',
                    'server console', $when));
                $sent[] = 'notice to ' . ProfileController::mask($to);
            } catch (\Throwable $e) { $this->warn('Notice to ' . ProfileController::mask($to) . ' failed: ' . $e->getMessage()); }
        }

        ActivityLog::create([
            'action'      => 'owner.recovered',
            'entityType'  => 'user',
            'entityId'    => (string) $owner->_id,
            'description' => 'Owner account recovered from the server console: email ' . ProfileController::mask($old) . ' -> ' . ProfileController::mask($email) . ', signed out everywhere, 2FA off',
            'performedByName' => 'Server console',
            'performedByRole' => 'system',
            'ip'          => 'console',
            'metadata'    => ['from' => ProfileController::mask($old), 'to' => ProfileController::mask($email)],
            'createdAt'   => now(),
        ]);

        $this->info('Recovered. Sent: ' . (implode(', ', $sent) ?: 'nothing - check mail settings'));
        $this->line('The link works for 30 minutes. If it expires, the owner uses Forgot password with the new email.');
        return self::SUCCESS;
    }
}
