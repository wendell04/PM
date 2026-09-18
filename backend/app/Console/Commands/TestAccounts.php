<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Two throwaway accounts for an end-to-end test of the ordering flow: a verified customer to order
 * with, and an Administrator-role staff member to approve, produce, QC and deliver. Both use
 * plus-addresses of the shop's own inbox, so every email the run sends lands where the owner can
 * see it. --cleanup removes the staff account and, when it placed no orders, the customer too.
 */
class TestAccounts extends Command
{
    protected $signature   = 'test:accounts {--cleanup : Remove the accounts instead of creating them}';
    protected $description = 'Create (or remove) the e2e test customer and staff accounts';

    public const CUSTOMER = 'personalizemeprints.admin+e2e@gmail.com';
    public const STAFF    = 'personalizemeprints.admin+e2estaff@gmail.com';

    public function handle(): int
    {
        if ($this->option('cleanup')) {
            foreach ([self::STAFF, self::CUSTOMER] as $email) {
                $u = User::emailIs($email)->first();
                if (!$u) { $this->line("Absent  {$email}"); continue; }
                if (Order::where('userId', (string) $u->_id)->exists()) {
                    $this->line("Kept    {$email} - it has orders; delete from Customers if you want it gone");
                    continue;
                }
                $u->tokens()->delete();
                $u->delete();
                $this->line("Removed {$email}");
            }
            return self::SUCCESS;
        }

        $password = 'E2e-' . Str::random(12);
        foreach ([[self::CUSTOMER, 'customer', 'E2E', 'Customer'], [self::STAFF, 'administrator', 'E2E', 'Staff']] as [$email, $role, $first, $last]) {
            $u = User::emailIs($email)->first() ?? new User();
            $u->firstName   = $first;
            $u->lastName    = $last;
            $u->email       = $email;
            $u->role        = $role;
            $u->password    = Hash::make($password);
            $u->is_verified = true;
            $u->phoneNumber = $u->phoneNumber ?: '09170000000';
            $u->failed_login_attempts = 0;
            $u->login_locked_until    = null;
            $u->save();
            $this->line("Ready   {$email} ({$role})");
        }
        $this->info('Password for both: ' . $password);
        return self::SUCCESS;
    }
}
