"""Checks the nightly batch transformations on a tiny dataset with local Spark.

Usage:
    python analytics/tests/test_batch_logic.py              # built-in sample
    python analytics/tests/test_batch_logic.py records.ndjson  # rows exported from PostgreSQL
"""
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "batch"))
from pyspark.sql import SparkSession  # noqa: E402
from nightly_batch import compute, mapreduce_village_counts  # noqa: E402

SAMPLE = [
    ("p1", "ward-1", "patient", {"name": "A", "village": "Simle"}, False, "2026-10-02 10:00:00"),
    ("p2", "ward-1", "patient", {"name": "B", "village": "Simle"}, False, "2026-11-05 10:00:00"),
    ("p3", "ward-2", "patient", {"name": "C", "village": "Chisapani"}, False, "2026-11-06 10:00:00"),
    ("g1", "ward-1", "pregnancy", {"patientId": "p1", "status": "active", "riskLevel": "high"}, False, "2026-10-03 10:00:00"),
    ("g2", "ward-2", "pregnancy", {"patientId": "p3", "status": "active", "riskLevel": "low"}, False, "2026-11-07 10:00:00"),
    ("v1", "ward-1", "visit", {"patientId": "p1", "type": "ANC", "date": "2026-11-01", "followUpDate": "2026-11-10"}, False, "2026-11-01 10:00:00"),
    ("v2", "ward-1", "visit", {"patientId": "p1", "type": "ANC", "date": "2026-11-12"}, False, "2026-11-12 10:00:00"),
    ("v3", "ward-2", "visit", {"patientId": "p3", "type": "general", "date": "2026-11-02", "followUpDate": "2026-11-09"}, False, "2026-11-02 10:00:00"),
    ("v4", "ward-2", "visit", {"patientId": "p3", "type": "general", "date": "2026-11-03"}, True, "2026-11-03 10:00:00"),
]


def load(spark, path=None):
    if path:
        rows = []
        with open(path) as f:
            for line in f:
                o = json.loads(line)
                rows.append((o["id"], o["ward"], o["entity"], json.dumps(o["data"]), o["deleted"],
                             datetime.fromisoformat(o["created_at"][:19])))
    else:
        rows = [(i, w, e, json.dumps(d), dl, datetime.fromisoformat(c)) for i, w, e, d, dl, c in SAMPLE]
    return spark.createDataFrame(rows, "id string, ward string, entity string, data string, deleted boolean, created_at timestamp")


def main():
    spark = SparkSession.builder.master("local[2]").appName("batch-test").getOrCreate()
    spark.sparkContext.setLogLevel("ERROR")
    path = sys.argv[1] if len(sys.argv) > 1 else None
    out = compute(load(spark, path), "2026-11-20")
    for name, df in out.items():
        if name.startswith("_"):
            continue
        print(f"--- {name} ({df.count()} rows)")
        df.drop("computed_at").orderBy(*df.columns[:2]).show(8, truncate=False)
    mr = sorted(mapreduce_village_counts(out["_patients"]))
    print("MapReduce village counts:", mr)

    if not path:  # assertions on the built-in sample
        vs = {(r.ward, r.village): r for r in out["an_village_stats"].collect()}
        assert vs[("ward-1", "Simle")].patients == 2 and vs[("ward-1", "Simle")].high_risk == 1
        fu = {r.ward: r for r in out["an_followup"].collect()}
        assert fu["ward-1"].due == 1 and fu["ward-1"].completed == 1
        assert fu["ward-2"].due == 1 and fu["ward-2"].completed == 0  # v4 is deleted
        dv = out["an_daily_visits"].where("visit_type = 'general'").count()
        assert dv == 1, dv
        assert mr == [(("ward-1", "Simle"), 2), (("ward-2", "Chisapani"), 1)]
        print("All batch assertions passed")
    spark.stop()


if __name__ == "__main__":
    main()
