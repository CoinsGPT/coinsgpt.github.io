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

3. If you find there are transactions missed, please double check whether it contained in the bitcoind

```
bitcoin-cli getrawtransaction <txid> true
```

## 3.Transactions Missing Reverse

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