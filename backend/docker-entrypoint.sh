#!/bin/sh
set -e

# Laravel's scheduler is not a daemon. Something has to call `schedule:run` every minute, and on a
# normal server that something is cron - which this image does not have. So five jobs sat defined
# in routes/console.php and none of them had ever run: no database backup, no release of material
# held by proofs nobody paid for, no pruning of dead tokens or unverified accounts.
#
# A plain loop, not `schedule:work`: the loop cannot die. `schedule:work` is a single PHP process
# and a fatal error inside it ends the scheduler silently for the life of the container, which is
# exactly the failure mode being fixed here.
#
# Set RUN_SCHEDULER=false on any replica that should not run it. Two containers running this at
# once would take the backup twice and race every other job.
if [ "${RUN_SCHEDULER:-true}" != "false" ]; then
  echo "[entrypoint] scheduler on (RUN_SCHEDULER=${RUN_SCHEDULER:-true})"
  (
    while true; do
      php artisan schedule:run --no-interaction || echo "[scheduler] tick failed, continuing"
      sleep 60
    done
  ) &
else
  echo "[entrypoint] scheduler off"
fi

exec "$@"
