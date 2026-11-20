# Testing and experiment results

Record **your own** measurements here. Run every experiment on the laptop you
will use for the demonstration and write down its specs.

## Test environment

| Item | Value |
|---|---|
| Laptop | e.g. AMD Ryzen 5 5500U, 8 GB RAM, Windows 11 |
| Docker Desktop memory limit | |
| Stack running | core / core + bigdata / core + bigdata + monitoring |
| Date | |

## 1. Automated tests

```bash
cd shared && npm test                          # HLC, version vectors, merge rules, schema
cd backend && npm test                         # needs the API running: sync, conflicts, idempotency, sharding, RBAC
python analytics/tests/test_batch_logic.py     # Spark batch transformations (needs pyspark + Java 17)
```

| Suite | Tests | Passed |
|---|---|---|
| shared | 10 | |
| backend | 11 | |
| analytics | 1 | |

## 2. Concurrent clients (sync engine)

```bash
node experiments/simulate-clients.js --clients 3,10,50
node experiments/simulate-clients.js --clients 3,10,50 --mode naive
```

The script saves raw results as JSON in `experiments/results/`.

| Clients | Mode | Events | Sync time (ms) | Events/s | p95 push (ms) | KB raw | KB gzip | Conflicts | Readings lost | Duplicates detected | Applied twice | Converged |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | safe | | | | | | | | | | | |
| 10 | safe | | | | | | | | | | | |
| 50 | safe | | | | | | | | | | | |
| 3 | naive | | | | | | | | | | | |
| 10 | naive | | | | | | | | | | | |
| 50 | naive | | | | | | | | | | | |

**Readings lost** counts, for every worker, their last blood-pressure reading on
the shared records that appears neither in the final record nor in an open
conflict. The safe engine should keep it at 0; the naive baseline shows how much
a simple offline cache would lose.

## 3. Offline operation (manual, in the browser)

| Step | Expected | Result |
|---|---|---|
| Load app once online, then set DevTools → Network → Offline and reload | App opens from the service worker | |
| Register a patient offline | Saved, "Created offline" badge, ribbon shows pending count | |
| Close the browser, reopen offline | Patient and pending count still there | |
| Go online | Pending count returns to 0 without pressing anything | |

## 4. Network quality (Sync status → network simulator)

| Profile | Events pushed | Sync duration | Bytes sent |
|---|---|---|---|
| Real | | | |
| 3G | | | |
| 2G | | | |
| Flaky | | | |

## 5. Fault tolerance

| Experiment | How | What to record |
|---|---|---|
| API instance failure | `docker compose stop api-1` while using the app | Requests keep working? New leader in Admin page? Time to re-elect |
| etcd node failure | `docker compose stop etcd2` | Leader election still works (2 of 3) |
| Database failover | `docker compose stop postgres-primary` | Seconds until writes work again; epoch number in Admin |
| Kafka down | stop `kafka`, create records, start it | Outbox pending grows, then drains to 0; no events lost |
| Kafka broker (cluster) | 3-broker file, `docker compose stop kafka2` | Publishing continues |

## 6. Spark

| Job | Records in | Rows out | Duration |
|---|---|---|---|
| Nightly batch (`docker compose run --rm spark-batch`) | | | |
| Streaming: delay from sync to chart | | | |

## 7. Resource usage and cost

`docker stats --no-stream` with each layer running:

| Layer | Containers | Total memory | CPU |
|---|---|---|---|
| core | | | |
| core + bigdata | | | |
| core + bigdata + monitoring | | | |
