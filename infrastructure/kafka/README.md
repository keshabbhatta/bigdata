# Kafka

Kafka runs from `../docker-compose.yml` (profile `bigdata`) in KRaft mode — no ZooKeeper;
the controller quorum uses Kafka's own Raft implementation.

- Single broker (default): replication factor 1, enough for development and the demo.
- Three brokers: `docker compose -f docker-compose.yml -f docker-compose.kafka-cluster.yml --profile bigdata up -d`
  (replication factor 3, `min.insync.replicas=2`) for the broker-failure experiment.

Topics are created by the API on first connection: `patient-events`, `maternal-health-events`,
`clinic-visit-events`, `sync-events` (3 partitions, message key = ward).

Useful commands:

```bash
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic clinic-visit-events --from-beginning --max-messages 5
```
