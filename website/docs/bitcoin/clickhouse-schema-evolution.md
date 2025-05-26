# 05 ClickHouse Schema Evolution

![](/img/bitcoin/bitcoin_data_pipeline.png)

To add new attributes (previousblockhash, transactions, and nTx) to a ClickHouse table using the Kafka engine—assuming your existing table already receives streaming data from Kafka—you must follow a safe schema evolution process due to ClickHouse's strict handling of schemas and its decoupled ingestion setup. Here's a professional, step-by-step guide as if taught by a professor of ClickHouse + Kafka streaming integration.

| Layer             | Action                                               |
| ----------------- | ---------------------------------------------------- |
| Kafka Producer    | Add the new fields to emitted JSON                   |
| Kafka Engine Table| `ALTER TABLE blocks_queue ADD COLUMN`                |
| Materialized View | Drop and recreate `blocks_mv` with new SELECT clause |
| Destination Table | Add new fields using `ALTER TABLE blocks ADD COLUMN` |
| Verification      | Use `SELECT` queries to validate parsing             |


![](/img/bitcoin/clickhouse-schema-evolution.png)

In production systems, **graceful schema evolution** means:

1. **Pausing ingestion**
2. Updating schema
3. Restarting streaming with minimal data loss or duplication

Below is a **professor-level, zero-downtime-friendly guide** to **safely modify a Kafka-to-ClickHouse pipeline** using your components:

## What You Have Now

* Kafka Engine Table: `blocks_queue`
* Materialized View: `blocks_mv`
* Storage Table: `blocks`
* Kafka Producer: actively pushing JSON to topic `blocks`

---

## What You Want to Do

1. Temporarily pause ingestion (`blocks_mv` consuming from `blocks_queue`)
2. Add new columns to `blocks_queue`, `blocks`, and `blocks_mv`
3. Resume ingestion without data corruption

---


## Step 1: Stop the Kafka Producer

> Pause the source application producing data to the `blocks` Kafka topic to prevent in-flight writes while you upgrade schema.

```bash
# Stop the producer app or its Kafka client (Ctrl + C)
python3 bitcoinetl.py stream -p http://bitcoin:password@localhost:8332 --output kafka/localhost:9092 --period-seconds 0 -b 100 -B 1000 --log-file log --enrich True -l last_synced_block.txt
```

## Step 2: Detach the Materialized View (`blocks_mv`)

> This stops the automatic flow of data **from Kafka to `blocks`**, but keeps all data in Kafka **unconsumed**.

```sql
DETACH TABLE blocks_mv;
```

The view is paused, but the Kafka offsets in `blocks_queue` are **not committed**. So when reattached, it picks up where it left off.

## Step 3: Update the Kafka Engine Table (`blocks_queue`)

```sql
ALTER TABLE blocks_queue
ADD COLUMN previousblockhash String;

ALTER TABLE blocks_queue
ADD COLUMN transactions Array(String);

ALTER TABLE blocks_queue
ADD COLUMN nTx UInt32;
```

> If unsure all messages will have these fields, use `Nullable(...)`.


## Step 4: Update the MergeTree Table (`blocks`)

```sql
ALTER TABLE blocks
ADD COLUMN previousblockhash String;

ALTER TABLE blocks
ADD COLUMN transactions Array(String);

ALTER TABLE blocks
ADD COLUMN nTx UInt32;
```

## Step 5: Drop the Old Materialized View (`blocks_mv`)

You must **drop** (not alter) the materialized view to reflect the new columns.

```sql
DROP TABLE blocks_mv;
```

## Step 6: Recreate the Materialized View (`blocks_mv`)

```sql
CREATE MATERIALIZED VIEW blocks_mv
TO blocks
AS
SELECT
    hash,
    height,
    version,
    versionHex,
    merkleroot,
    time,
    mediantime,
    nonce,
    bits,
    difficulty,
    chainwork,
    previousblockhash,
    transactions,
    nTx
FROM blocks_queue;
```

## Step 7: Resume the Kafka Producer

Now that the pipeline is upgraded, **restart** the producer:

```bash
# Restart your Kafka producer
python3 bitcoinetl.py stream -p http://bitcoin:passw0rd@localhost:8332 --output kafka/localhost:9092 --period-seconds 0 -b 100 -B 1000 --log-file log --enrich True -l last_synced_block.txt
```

## Step 8: Validate End-to-End

```sql
SELECT
    hash,
    previousblockhash,
    nTx,
    length(transactions) AS tx_count
FROM blocks
ORDER BY height DESC
LIMIT 10;
```

Ensure everything flows correctly.

## ✅ Summary: Schema Evolution Plan

| Step | Action                                   |
| ---- | ---------------------------------------- |
| 1    | Stop Kafka Producer                      |
| 2    | `DETACH TABLE blocks_mv`                 |
| 3    | `ALTER TABLE blocks_queue` (add columns) |
| 4    | `ALTER TABLE blocks` (add columns)       |
| 5    | `DROP TABLE blocks_mv`                   |
| 6    | `CREATE MATERIALIZED VIEW blocks_mv`     |
| 7    | Restart Kafka Producer                   |
| 8    | Validate new data in `blocks`            |



