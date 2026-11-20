"""
Nightly Spark batch job (DDIA Ch.11 — batch processing).

Reads every health record from the PostgreSQL READ REPLICA (so analytics never
slows down the primary that serves health workers), computes historical
aggregates, and writes the results to an_* tables that the dashboard reads.

Run it with:  docker compose run --rm spark-batch
"""
import os
import sys
import time
from datetime import datetime, timezone
from operator import add

from pyspark.sql import SparkSession, DataFrame, functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType

# The JSON "data" column of each record, parsed with a schema (schema-on-read).
DATA_SCHEMA = StructType([
    StructField("name", StringType()), StructField("village", StringType()),
    StructField("sex", StringType()), StructField("patientId", StringType()),
    StructField("type", StringType()), StructField("date", StringType()),
    StructField("followUpDate", StringType()), StructField("status", StringType()),
    StructField("riskLevel", StringType()), StructField("bpSystolic", DoubleType()),
    StructField("bpDiastolic", DoubleType()), StructField("hemoglobin", DoubleType()),
])


def prepare(records: DataFrame) -> DataFrame:
    """records: id, ward, entity, data (JSON text), deleted, created_at."""
    return (records
            .where(~F.col("deleted"))
            .withColumn("d", F.from_json(F.col("data"), DATA_SCHEMA))
            .select("id", "ward", "entity", "created_at", "d.*"))


def compute(records: DataFrame, today: str) -> dict:
    """Pure transformations, kept separate from I/O so they can be tested."""
    r = prepare(records).cache()
    patients = r.where(F.col("entity") == "patient")
    pregnancies = r.where(F.col("entity") == "pregnancy")
    visits = r.where(F.col("entity") == "visit")
    now = F.current_timestamp()

    daily_visits = (visits
                    .groupBy(F.to_date("date").alias("day"), "ward", F.col("type").alias("visit_type"))
                    .agg(F.count("*").alias("visits"))
                    .withColumn("computed_at", now))

    p, g = patients.alias("p"), pregnancies.alias("g")
    active = F.col("g.status") == "active"
    village_stats = (p.join(g, F.col("g.patientId") == F.col("p.id"), "left")
                     .groupBy(F.col("p.ward").alias("ward"), F.col("p.village").alias("village"))
                     .agg(F.countDistinct("p.id").alias("patients"),
                          F.countDistinct(F.when(active, F.col("g.id"))).alias("pregnancies"),
                          F.countDistinct(F.when(active & (F.col("g.riskLevel") == "high"), F.col("g.id"))).alias("high_risk"))
                     .withColumn("computed_at", now))

    monthly = (patients
               .groupBy(F.date_format("created_at", "yyyy-MM").alias("month"), "ward")
               .agg(F.count("*").alias("registrations"))
               .withColumn("computed_at", now))

    # Follow-up completion: a follow-up is "done" if the same patient has a later visit.
    due = visits.where((F.col("followUpDate").isNotNull()) & (F.col("followUpDate") != "") & (F.col("followUpDate") <= today)).alias("v")
    later = visits.select(F.col("id").alias("v2_id"), F.col("patientId").alias("v2_patient"), F.col("date").alias("v2_date"))
    completed = (due.join(later, (F.col("v2_patient") == F.col("v.patientId")) & (F.col("v2_date") >= F.col("v.followUpDate"))
                          & (F.col("v2_id") != F.col("v.id")), "inner")
                 .select(F.col("v.id").alias("id"), F.col("v.ward").alias("ward")).distinct())
    followup = (due.groupBy(F.col("v.ward").alias("ward")).agg(F.count("*").alias("due"))
                .join(completed.groupBy("ward").agg(F.count("*").alias("completed")), "ward", "left")
                .fillna(0, ["completed"])
                .withColumn("completion_rate", F.col("completed") / F.col("due"))
                .withColumn("computed_at", now))

    return {
        "an_daily_visits": daily_visits,
        "an_village_stats": village_stats,
        "an_monthly_registrations": monthly,
        "an_followup": followup,
        "_patients": patients,
        "_rows_in": r.count(),
    }


def mapreduce_village_counts(patients: DataFrame):
    """The same idea as classic MapReduce: map each patient to ((ward, village), 1),
    then reduce by key with addition. Shown explicitly for the report."""
    return (patients.rdd
            .map(lambda row: ((row["ward"], row["village"]), 1))
            .reduceByKey(add)
            .collect())


def main():
    read_url = os.environ.get("PG_READ_URL") or os.environ["PG_URL"]
    write_url = os.environ["PG_URL"]
    props = {"user": os.environ.get("PG_USER", "ruralhealth"),
             "password": os.environ.get("PG_PASSWORD", "ruralhealth"),
             "driver": "org.postgresql.Driver"}

    spark = SparkSession.builder.appName("ruralhealth-nightly-batch").getOrCreate()
    spark.sparkContext.setLogLevel("WARN")
    started = datetime.now(timezone.utc)
    t0 = time.time()

    query = "(SELECT id::text AS id, ward, entity, data::text AS data, deleted, created_at FROM records) AS r"
    records = spark.read.jdbc(read_url, query, properties=props)
    out = compute(records, datetime.now().strftime("%Y-%m-%d"))

    print("MapReduce village counts:", sorted(mapreduce_village_counts(out["_patients"]))[:10])

    rows_out = 0
    for table, df in out.items():
        if table.startswith("_"):
            continue
        n = df.count()
        rows_out += n
        # overwrite + truncate keeps the table definition and indexes
        df.write.option("truncate", "true").jdbc(write_url, table, mode="overwrite", properties=props)
        print(f"wrote {n:>5} rows to {table}")

    finished = datetime.now(timezone.utc)
    run = spark.createDataFrame(
        [("nightly-batch", started, finished, int((time.time() - t0) * 1000), int(out["_rows_in"]), rows_out)],
        "job string, started_at timestamp, finished_at timestamp, duration_ms long, rows_in long, rows_out long",
    )
    run.write.jdbc(write_url, "an_job_runs", mode="append", properties=props)
    print(f"Batch finished in {time.time() - t0:.1f}s: {out['_rows_in']} records in, {rows_out} rows out")
    spark.stop()


if __name__ == "__main__":
    sys.exit(main())
