# Analytics jobs

| Job | File | How it runs | Reads | Writes |
|---|---|---|---|---|
| Streaming event counts | `streaming/stream_events.py` | Starts with `docker compose --profile bigdata up -d` and keeps running | Kafka topics | `an_stream_counts` |
| Nightly batch | `batch/nightly_batch.py` | `docker compose run --rm spark-batch` (schedule it nightly with cron / Windows Task Scheduler) | PostgreSQL read replica | `an_daily_visits`, `an_village_stats`, `an_monthly_registrations`, `an_followup`, `an_job_runs` |

## Why two jobs?

- **Streaming** answers "what is happening right now?" (events per minute) with a
  delay of about 20 seconds.
- **Batch** answers "what happened over months?" (trends, follow-up completion).
  It reads the whole history once a night instead of running continuously, which
  saves computing resources.

The API never computes these heavy numbers while a health worker waits. It only
reads the tables the jobs produce. If the batch job has never run, the dashboard
falls back to live SQL and says so on screen.

## Schedule the batch job every night

Windows Task Scheduler → Create Basic Task → Daily, 02:00 → Start a program:

```
Program:   docker
Arguments: compose -f C:\path\to\ruralhealth-sync\infrastructure\docker-compose.yml run --rm spark-batch
```

Linux/macOS cron:

```
0 2 * * * cd /path/to/ruralhealth-sync/infrastructure && docker compose run --rm spark-batch
```

## Test the batch logic without Docker

`tests/test_batch_logic.py` runs the same transformations on a small in-memory
dataset with local PySpark (`pip install pyspark==3.5.7`, needs Java 17):

```
python analytics/tests/test_batch_logic.py
```
