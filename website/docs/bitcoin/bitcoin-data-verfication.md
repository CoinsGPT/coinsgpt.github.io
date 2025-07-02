# 06 Bitcoin Data Verification

To **verify that Bitcoin block and transaction data is complete in ClickHouse**, you need to ensure:

1. **No missing blocks**
2. **No missing transactions**
3. **No duplicate block heights**
4. **Transaction counts match block metadata**

## 1. block height continuity

Run this to detect missing block numbers:

```sql
WITH seq AS (
    SELECT number
    FROM numbers(
        toUInt64(
            ifNull((SELECT max(number) FROM blocks_fat), 0) + 1
        )
    )
)
SELECT seq.number AS missing_block_number
FROM seq
LEFT ANTI JOIN blocks_fat AS b ON seq.number = b.number
```

If this query returns rows, those block numbers are missing.


## 2. Check for duplicate blocks

Check for duplicate block numbers (heights):

```sql
SELECT number, count() AS cnt
FROM blocks_fat
GROUP BY number
HAVING cnt > 1
```

You should see **zero rows** returned.

if the count of one block is bigger than 1, please use final command to deduplicate the same rows

```shell
OPTIMIZE TABLE blocks_fat FINAL;
```

## 3.Transactions Missing 

To detect missing transactions from the transactions_fat table that are listed in the blocks_fat.transactions array, and process it partition by partition

1. To list all the partition in the blocks_fat table

```sql
SELECT DISTINCT toYYYYMM(timestamp_month) AS part
FROM blocks_fat
ORDER BY part ASC
```

2. To find the transactions which are missing from transactions_fat table partition by partition

```sql
WITH flattened AS (
    SELECT
        hash AS block_hash,
        arrayJoin(transactions) AS tx_hash
    FROM blocks_fat
    WHERE toYYYYMM(timestamp_month) = 201304
)
SELECT
    flattened.block_hash,
    flattened.tx_hash,
    t.hash
FROM flattened
LEFT JOIN (
    SELECT hash
    FROM transactions_fat
    WHERE toYYYYMM(block_timestamp_month) = 201304
) AS t
ON flattened.tx_hash = t.hash
WHERE t.hash != flattened.tx_hash;
```

The missing transaction examples

```
Block: 364773  Missing TX: 9fdbcf0ef9d8d00f66e47917f67cc5d78aec1ac786e2abb8d2facb4e4790aad6
Block: 364784  Missing TX: 9c667c64fcbb484b44dcce638f69130bbf1a4dd0fbb4423f58ceff92af4219ec
Block: 367885  Missing TX: 30b3b19b4d14fae79b5d55516e93f7399e7eccd87403b8dc048ea4f49130595a
Block: 367906  Missing TX: dd6067e71c04cb62f8e5aa52ecc99b01ffcd551a52727d046a2fabb14eb39b4d
Block: 367904  Missing TX: 740ac533882221099e7202bbdafbb99ec589c6e74fd2fe7ca1274b46ea4f0a96
Block: 367899  Missing TX: f2e197a6d8d088b13afd0f99d4027da36a9413b9f3d7730ba5278132ebc950a7
Block: 367886  Missing TX: cf1032c2213e6faea04f1813aa6890e7f588bb378cb98e7425aec83c11d4457c
Block: 367877  Missing TX: 52539a56b1eb890504b775171923430f0355eb836a57134ba598170a2f8980c1
Block: 367911  Missing TX: 5f4d2593c859833db2e2d25c672a46e98f7f8564b991af9642a8b37e88af62bc
Block: 367897  Missing TX: 8dabbf51f78c1e7286866af1de403118c5ddbe57ca93b54859245916d2bf1063
Block: 367891  Missing TX: c9fe64681c9a12795586a3ae7c5e94b585032f67847c7f9c42e1b979a1e2959b
Block: 367906  Missing TX: dd6067e71c04cb62f8e5aa52ecc99b01ffcd551a52727d046a2fabb14eb39b4d
Block: 367904  Missing TX: 740ac533882221099e7202bbdafbb99ec589c6e74fd2fe7ca1274b46ea4f0a96
Block: 367899  Missing TX: f2e197a6d8d088b13afd0f99d4027da36a9413b9f3d7730ba5278132ebc950a7
Block: 367885  Missing TX: 30b3b19b4d14fae79b5d55516e93f7399e7eccd87403b8dc048ea4f49130595a
Block: 367906  Missing TX: dd6067e71c04cb62f8e5aa52ecc99b01ffcd551a52727d046a2fabb14eb39b4d
Block: 367904  Missing TX: 740ac533882221099e7202bbdafbb99ec589c6e74fd2fe7ca1274b46ea4f0a96
Block: 367899  Missing TX: f2e197a6d8d088b13afd0f99d4027da36a9413b9f3d7730ba5278132ebc950a7
Block: 367886  Missing TX: cf1032c2213e6faea04f1813aa6890e7f588bb378cb98e7425aec83c11d4457c
Block: 367877  Missing TX: 52539a56b1eb890504b775171923430f0355eb836a57134ba598170a2f8980c1
Block: 367911  Missing TX: 5f4d2593c859833db2e2d25c672a46e98f7f8564b991af9642a8b37e88af62bc
Block: 367897  Missing TX: 8dabbf51f78c1e7286866af1de403118c5ddbe57ca93b54859245916d2bf1063
Block: 367891  Missing TX: c9fe64681c9a12795586a3ae7c5e94b585032f67847c7f9c42e1b979a1e2959b
Block: 367885  Missing TX: 30b3b19b4d14fae79b5d55516e93f7399e7eccd87403b8dc048ea4f49130595a
Block: 367911  Missing TX: 5f4d2593c859833db2e2d25c672a46e98f7f8564b991af9642a8b37e88af62bc
Block: 367877  Missing TX: 52539a56b1eb890504b775171923430f0355eb836a57134ba598170a2f8980c1
Block: 367897  Missing TX: 8dabbf51f78c1e7286866af1de403118c5ddbe57ca93b54859245916d2bf1063
Block: 367891  Missing TX: c9fe64681c9a12795586a3ae7c5e94b585032f67847c7f9c42e1b979a1e2959b
Block: 367886  Missing TX: cf1032c2213e6faea04f1813aa6890e7f588bb378cb98e7425aec83c11d4457c
```

3. If you find there are transactions missed, please double check whether it contained in the bitcoind

```
bitcoin-cli getrawtransaction <txid> true
```


4. Apache Kafka has several key limitations and configurable constraints that impact how much data can be produced, buffered, and consumed. Here's a clear breakdown of the main types of limitations:
- Message Size Limitations
- Buffering & Memory Limits
- Log & Retention Limits
- Consumer Fetch & Processing Limits
- Connection & Network Limits

To **enlarge your Kafka topic `transactions` to support messages up to 90MB**, you must:
1. **Update the topic** config (`max.message.bytes`)
2. **Update the broker** config (`message.max.bytes` and `replica.fetch.max.bytes`)
3. **Update your producer** config (`max.request.size`, `buffer.memory`)

It works after finish the first step to update the transactions topic config. 

```bash
kafka-configs.sh --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name transactions \
  --alter \
  --add-config max.message.bytes=94371840
```

```bash
kafka-configs.sh --bootstrap-server localhost:9092   --entity-type topics --entity-name transactions   --describe
```

```
Dynamic configs for topic transactions are:
  cleanup.policy=delete sensitive=false synonyms={DYNAMIC_TOPIC_CONFIG:cleanup.policy=delete, DEFAULT_CONFIG:log.cleanup.policy=delete}
  max.message.bytes=94371840 sensitive=false synonyms={DYNAMIC_TOPIC_CONFIG:max.message.bytes=94371840, DEFAULT_CONFIG:message.max.bytes=1048588}
  retention.bytes=1073741824 sensitive=false synonyms={DYNAMIC_TOPIC_CONFIG:retention.bytes=1073741824, DEFAULT_CONFIG:log.retention.bytes=-1}
  retention.ms=86400000 sensitive=false synonyms={DYNAMIC_TOPIC_CONFIG:retention.ms=86400000}
```


## 4.Transactions Missing Reverse

To find transactions listed in transactions_fat that are not present in blocks_fat.transactions, partition-by-partition (month-by-month)

```sql
WITH
    transactions_fat_partitioned AS
    (
        SELECT
            hash,
            block_hash
        FROM transactions_fat
        WHERE toYYYYMM(block_timestamp_month) = 201304
    ),
    blocks_fat_partitioned AS
    (
        SELECT
            hash AS block_hash,
            arrayJoin(transactions) AS tx_hash
        FROM blocks_fat
        WHERE toYYYYMM(timestamp_month) = 201304
    )
SELECT
    t.hash AS missing_transaction_hash,
    t.block_hash AS expected_block_hash,
    b.tx_hash
FROM transactions_fat_partitioned AS t
LEFT JOIN blocks_fat_partitioned AS b ON (t.hash = b.tx_hash) AND (t.block_hash = b.block_hash)
WHERE b.tx_hash != t.hash
```

## 4. duplicate transactions

```sql
SELECT hash, count() AS cnt
FROM transactions_fat
GROUP BY hash
HAVING cnt > 1
```

Again, this should return no rows.

## 5. Python to Loop Partition by Partition

Here is a **Python script** that:

1. **Connects to ClickHouse** via `clickhouse-connect`.
2. **Iterates over partition months** (you define the range).
3. **Runs a query per partition** to find transactions listed in `blocks_fat` but **missing** from `transactions_fat`.


```python
from clickhouse_connect import get_client
from datetime import datetime
from dateutil.relativedelta import relativedelta

# === CONFIGURATION ===
CLICKHOUSE_HOST = 'localhost'
CLICKHOUSE_PORT = 8123
CLICKHOUSE_USER = 'default'
CLICKHOUSE_PASSWORD = 'password'
DATABASE = 'bitcoin'

START_MONTH = '2010-01'  # yyyy-mm
END_MONTH   = '2013-11'

# === INIT CLIENT ===
client = get_client(
    host=CLICKHOUSE_HOST,
    port=CLICKHOUSE_PORT,
    username=CLICKHOUSE_USER,
    password=CLICKHOUSE_PASSWORD,
    database=DATABASE,
)

# === GENERATE PARTITIONS ===
def generate_partitions(start, end):
    partitions = []
    start_date = datetime.strptime(start, '%Y-%m')
    end_date = datetime.strptime(end, '%Y-%m')
    current = start_date
    while current <= end_date:
        partitions.append(current.strftime('%Y%m'))
        current += relativedelta(months=1)
    return partitions

# === MAIN LOOP ===
partitions = generate_partitions(START_MONTH, END_MONTH)

for partition in partitions:
    print(f'\n🧪 Querying Partition: {partition}')
    query = f"""
    WITH flattened AS (
        SELECT
            hash AS block_hash,
            tx_hash
        FROM bitcoin.blocks_fat
        ARRAY JOIN transactions AS tx_hash
        WHERE toYYYYMM(timestamp_month) = {partition}
    )
    SELECT
        flattened.block_hash,
        flattened.tx_hash
    FROM flattened
    LEFT JOIN (
        SELECT hash
        FROM bitcoin.transactions_fat
        WHERE toYYYYMM(block_timestamp_month) = {partition}
    ) AS txs
    ON flattened.tx_hash = txs.hash
    WHERE txs.hash != flattened.tx_hash
    """
    result = client.query(query)
    rows = result.result_rows
    if rows:
        print(f"⚠️  Missing transactions in partition {partition}: {len(rows)}")
        for row in rows:
            print(f"    Block: {row[0]}, Missing TX: {row[1]}")
    else:
        print(f"✅ All transactions found in partition {partition}")
```

```bash
pip install clickhouse-connect python-dateutil
```