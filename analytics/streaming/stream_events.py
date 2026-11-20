"""
Spark Structured Streaming job (DDIA Ch.11 — stream processing).

Continuously reads health events from Kafka, removes duplicates (the outbox
gives at-least-once delivery, so the same event can arrive twice), and counts
events per minute, topic, ward and operation. Results go to an_stream_counts,
which the Analytics page shows as the "Live event stream" chart.

Started automatically by:  docker compose --profile bigdata up -d
"""
import os

from pyspark.sql import SparkSession, functions as F
from pyspark.sql.types import StructType, StructField, StringType

BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP", "kafka:9092")
TOPICS = "patient-events,maternal-health-events,clinic-visit-events,sync-events"
PG_URL = os.environ["PG_URL"]
PROPS = {"user": os.environ.get("PG_USER", "ruralhealth"),
         "password": os.environ.get("PG_PASSWORD", "ruralhealth"),
         "driver": "org.postgresql.Driver"}
CHECKPOINT = os.environ.get("CHECKPOINT_DIR", "/tmp/checkpoints/stream-events")

EVENT = StructType([
    StructField("eventId", StringType()), StructField("entity", StringType()),
    StructField("recordId", StringType()), StructField("ward", StringType()),
    StructField("op", StringType()), StructField("status", StringType()),
    StructField("village", StringType()), StructField("visitType", StringType()),
    StructField("riskLevel", StringType()), StructField("receivedAt", StringType()),
])

spark = SparkSession.builder.appName("ruralhealth-stream-events").getOrCreate()
spark.sparkContext.setLogLevel("WARN")

raw = (spark.readStream.format("kafka")
       .option("kafka.bootstrap.servers", BOOTSTRAP)
       .option("subscribe", TOPICS)
       .option("startingOffsets", "earliest")
       .option("failOnDataLoss", "false")
       .load())

events = (raw
          .select(F.col("topic"), F.from_json(F.col("value").cast("string"), EVENT).alias("e"))
          .select("topic", "e.*")
          .withColumn("event_time", F.to_timestamp("receivedAt"))
          .where(F.col("event_time").isNotNull())
          .withWatermark("event_time", "2 minutes")
          # De-duplicate redelivered events (same eventId) within the watermark.
          .dropDuplicates(["eventId", "event_time"]))

counts = (events
          .groupBy(F.window("event_time", "1 minute"), "topic", "ward", "op")
          .count())


def write_batch(df, batch_id):
    out = (df.select(F.col("window.start").alias("window_start"), F.col("window.end").alias("window_end"),
                     "topic", "ward", "op", F.col("count").alias("events"))
             .withColumn("computed_at", F.current_timestamp()))
    n = out.count()
    if n:
        out.write.jdbc(PG_URL, "an_stream_counts", mode="append", properties=PROPS)
    print(f"micro-batch {batch_id}: {n} window counts written")


query = (counts.writeStream
         .outputMode("update")
         .foreachBatch(write_batch)
         .option("checkpointLocation", CHECKPOINT)
         .trigger(processingTime="20 seconds")
         .start())
query.awaitTermination()
