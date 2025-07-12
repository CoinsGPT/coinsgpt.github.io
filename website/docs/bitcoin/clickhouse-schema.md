# 04 ClickHouse Schema

![](/img/bitcoin/bitcoin_data_pipeline.png)


## “Create Fat First, Then Make Tight” ― Overall Strategy

> **Concept:** Ingest raw blockchain data into **wide, append-only staging tables** (“fat” tables). Once the data is complete and deduplicated, **transform and load** it into **narrow, query-optimized tables** (“tight” tables).
> **Benefits:**
> • Simple, resilient ETL—raw arrays are stored exactly once.
> • Historical re-processing is unnecessary; transformations are repeatable.
> • Final tables have smaller rows, sorted keys, and domain-specific indexes that accelerate analytics.


## Block Staging Table blocks_fat

*Purpose & Rationale*

* Holds one row per Bitcoin block as retrieved from `getblock`.
* Keeps the **full transaction list** in an `Array(String)` for traceability.
* `ReplacingMergeTree` ensures automatic deduplication when re-ingesting the same block.
* Partition by `toYYYYMM(timestamp_month)` so monthly maintenance (e.g., `OPTIMIZE PARTITION`) is cheap.
* Primary key is the **block hash**—the canonical unique identifier.

```sql
CREATE TABLE blocks_fat
(
  hash String,
  size UInt64,
  stripped_size UInt64,
  weight UInt64,
  number UInt64,
  version UInt64,
  merkle_root String,
  timestamp DateTime,
  timestamp_month Date,
  nonce String,
  bits String,
  coinbase_param String,
  previous_block_hash String,
  difficulty Float64,
  transaction_count UInt64,
  transactions Array(String)
)
ENGINE = ReplacingMergeTree()
PRIMARY KEY (hash)
PARTITION BY toYYYYMM(timestamp_month)
ORDER BY hash;
```

## Block Revision Table blocks

The revision column in your blocks table is used to distinguish different versions or revisions of the same data row (keyed by hash) in the ReplacingMergeTree. This enables maintain and update rows over time and identify whether a row is an original copy or has been enriched or modified


```sql
CREATE TABLE blocks
(
  hash String,
  size UInt64,
  stripped_size UInt64,
  weight UInt64,
  number UInt64,
  version UInt64,
  merkle_root String,
  timestamp DateTime,
  timestamp_month Date,
  nonce String,
  bits String,
  coinbase_param String,
  previous_block_hash String,
  difficulty Float64,
  transaction_count UInt64,
  transactions Array(String),
  total_fees Float64,
  subsidy Float64,
  reward Float64,
  coinbase_transaction String,
  coinbase_addresses Array(String),
  input_count UInt64,
  input_value Float64,
  output_count UInt64,
  output_value Float64,
  revision UInt64
)
ENGINE = ReplacingMergeTree(revision)
PRIMARY KEY (hash)
PARTITION BY toYYYYMM(timestamp)
ORDER BY hash;
```

Original raw copy from blocks_fat (minimal schema). when copying the original data, default values are added for the extra fields

```sql
    INSERT INTO blocks
    SELECT
      hash,
      size,
      stripped_size,
      weight,
      number,
      version,
      merkle_root,
      timestamp,
      timestamp_month,
      nonce,
      bits,
      coinbase_param,
      previous_block_hash,
      difficulty,
      transaction_count,
      transactions,
      0.0 AS total_fees,
      0.0 AS subsidy,
      0.0 AS reward,
      '' AS coinbase_transaction,
      [] AS coinbase_addresses,
      0 AS input_count,
      0.0 AS input_value,
      0 AS output_count,
      0.0 AS output_value,
      0 AS revision
    FROM blocks_fat
    WHERE toYYYYMM(timestamp) = 200901
```


| Column                 | Revision | Description                                                       |
| ---------------------- | -------- | ----------------------------------------------------------------- |
| `total_fees`           | ❌       | Sum of all transaction fees in block (input value - output value) |
| `subsidy`              | ❌       | Block subsidy (depends on height)                                 |
| `reward`               | ❌       | subsidy + total_fees                                              |
| `coinbase_transaction` | ❌       | Coinbase TX ID (first transaction)                                |
| `coinbase_addresses`   | ❌       | Addresses in the coinbase transaction’s outputs                   |
| `input_count`          | ❌       | Total number of inputs in all transactions                        |
| `input_value`          | ❌       | Total value of all inputs                                         |
| `output_count`         | ❌       | Total number of outputs in all transactions                       |
| `output_value`         | ❌       | Total value of all outputs                                        |
| `hash`                 | 0        | Block hash (primary key)                                          |
| `size`                 | 0        | Block size in bytes                                               |
| `stripped_size`        | 0        | Block size without witness data                                   |
| `weight`               | 0        | Block weight (segwit)                                             |
| `number`               | 0        | Block height                                                      |
| `version`              | 0        | Block version                                                     |
| `merkle_root`          | 0        | Merkle root of transactions                                       |
| `timestamp`            | 0        | Timestamp of block                                                |
| `timestamp_month`      | 0        | Date part (month) of timestamp                                    |
| `nonce`                | 0        | Nonce used for PoW                                                |
| `bits`                 | 0        | Difficulty bits format                                            |
| `coinbase_param`       | 0        | Raw coinbase input script param                                   |
| `previous_block_hash`  | 0        | Hash of previous block                                            |
| `difficulty`           | 0        | Difficulty target                                                 |
| `transaction_count`    | 0        | Number of transactions in block                                   |
| `transactions`         | 0        | Array of TXIDs in the block                                       |


## Transaction Staging Table transactions_fat

*Purpose & Rationale*

* Stores raw transactions with their **full input/output arrays**.
* Partitions follow the block timestamp month for locality with `blocks_fat`.
* Primary key is the **transaction hash**; `ReplacingMergeTree` again handles re-ingest deduplication.
* Subsequent ETL steps explode `inputs` and `outputs` into normalized tables.

```sql
CREATE TABLE transactions_fat
(
  hash String,
  size UInt64,
  virtual_size UInt64,
  version UInt64,
  lock_time UInt64,
  block_hash String,
  block_number UInt64,
  block_timestamp DateTime,
  block_timestamp_month Date,
  is_coinbase BOOL,
  input_count UInt64,
  output_count UInt64,
  input_value Float64,
  output_value Float64,
  fee Float64,
  inputs Array(Tuple(index UInt64, spent_transaction_hash String, spent_output_index UInt64, script_asm String, script_hex String, sequence UInt64, required_signatures UInt64, type String, addresses Array(String), value Float64)),
  outputs Array(Tuple(index UInt64, script_asm String, script_hex String, required_signatures UInt64, type String, addresses Array(String), value Float64))
)
ENGINE = ReplacingMergeTree()
PRIMARY KEY (hash)
PARTITION BY toYYYYMM(block_timestamp_month)
ORDER BY (hash);
```

## Transaction Staging Table transactions

```sql
CREATE TABLE transactions
(
  hash String,
  size UInt64,
  virtual_size UInt64,
  version UInt64,
  lock_time UInt64,
  block_hash String,
  block_number UInt64,
  block_timestamp DateTime,
  block_timestamp_month Date,
  is_coinbase BOOL,
  input_count UInt64,
  output_count UInt64,
  input_value Float64,
  output_value Float64,
  fee Float64,
  inputs Array(Tuple(index UInt64, spent_transaction_hash String, spent_output_index UInt64, script_asm String, script_hex String, sequence UInt64, required_signatures UInt64, type String, addresses Array(String), value Float64)),
  outputs Array(Tuple(index UInt64, script_asm String, script_hex String, required_signatures UInt64, type String, addresses Array(String), value Float64)),
  revision UInt64
)
ENGINE = ReplacingMergeTree(revision)
PRIMARY KEY (hash)
PARTITION BY toYYYYMM(block_timestamp)
ORDER BY (hash);
```

Original copy from transactions_fat, Raw import. Field spending_transaction_hash equals spent_transaction_hash, spending_output_index equals spent_output_index. Only add revision filed.

```sql
INSERT INTO transactions
SELECT
  hash,
  size,
  virtual_size,
  version,
  lock_time,
  block_hash,
  block_number,
  block_timestamp,
  block_timestamp_month,
  is_coinbase,
  input_count,
  output_count,
  input_value,
  output_value,
  fee,
  inputs,
  outputs,
  0 AS revision
FROM transactions_fat
WHERE toYYYYMM(block_timestamp) >= 200901
  AND toYYYYMM(block_timestamp) < 200903;
```

## Normalized Inputs Table `inputs`

*Purpose & Rationale*

* One row per **input** (UTXO spent).
* `spending_transaction_hash` & `spending_output_index` provide a join back to the output being consumed.
* Ordering by `(transaction_hash, input_index)` supports quick per-tx input scans.
* Ingest query **unwraps** the `inputs` array via `ARRAY JOIN`, filtering by a desired date range.

```sql
CREATE TABLE inputs
(
    transaction_hash String,
    input_index UInt64,
    block_hash String,
    block_number UInt64,
    block_timestamp DateTime,
    spending_transaction_hash String,
    spending_output_index UInt64,
    script_asm String,
    script_hex String,
    sequence UInt64,
    required_signatures UInt64,
    type String,
    addresses Array(String),
    value Float64,
    revision UInt64
)
ENGINE = ReplacingMergeTree(revision)
PARTITION BY toYYYYMM(block_timestamp)
ORDER BY (transaction_hash, input_index);
```

*Initial Load (array → rows)*

```sql
INSERT INTO inputs
SELECT
    t.hash AS transaction_hash,
    input.1 AS input_index,
    t.block_hash,
    t.block_number,
    t.block_timestamp,
    input.2 AS spending_transaction_hash,
    input.3 AS spending_output_index,
    input.4 AS script_asm,
    input.5 AS script_hex,
    input.6 AS sequence,
    input.7 AS required_signatures,
    input.8 AS type,
    input.9 AS addresses,
    input.10 AS value,
    0 as revision
FROM transactions AS t
ARRAY JOIN t.inputs AS input
WHERE toYYYYMM(t.block_timestamp) >= 200901
  AND toYYYYMM(t.block_timestamp) < 200903;
```

## Normalized Outputs Table `outputs`

*Purpose & Rationale*

* One row per **output** (creates a UTXO).
* Initially loaded with “unspent-placeholder” fields (`spent_* = '' / 0 / epoch`).
* Second pass joins `inputs` → `outputs` to mark spent outputs and timestamp the spend.
* `ReplacingMergeTree(spent_block_timestamp)` makes late-arriving spend updates trivial.

```sql
CREATE TABLE outputs
(
    transaction_hash String,
    output_index UInt64,
    block_hash String,
    block_number UInt64,
    block_timestamp DateTime,
    spent_transaction_hash String,
    spent_input_index UInt64,
    spent_block_hash String,
    spent_block_number UInt64,
    spent_block_timestamp DateTime,
    script_asm String,
    script_hex String,
    required_signatures UInt64,
    type String,
    addresses Array(String),
    value Float64,
    is_coinbase BOOL,
    revision UInt64
)
ENGINE = ReplacingMergeTree(revision)
PARTITION BY toYYYYMM(block_timestamp)
ORDER BY (transaction_hash, output_index);
```

*Phase 1: Load unspent outputs*

```sql
INSERT INTO outputs
SELECT
    t.hash AS transaction_hash,
    output.1 AS output_index,
    t.block_hash,
    t.block_number,
    t.block_timestamp,
    '' AS spent_transaction_hash,
    0 AS spent_input_index,
    '' AS spent_block_hash,
    0 AS spent_block_number,
    toDateTime('1970-01-01 00:00:00') AS spent_block_timestamp,
    output.2 AS script_asm,
    output.3 AS script_hex,
    output.4 AS required_signatures,
    output.5 AS type,
    output.6 AS addresses,
    output.7 AS value,
    t.is_coinbase AS is_coinbase,
    0 AS revision
FROM transactions AS t
ARRAY JOIN t.outputs AS output
WHERE toYYYYMM(t.block_timestamp) >= 200901
  AND toYYYYMM(t.block_timestamp) < 200903;
```

*Phase 2: Mark outputs as spent*

```sql
INSERT INTO outputs
SELECT
    o.transaction_hash,
    o.output_index,
    o.block_hash,
    o.block_number,
    o.block_timestamp,
    i.transaction_hash          AS spent_transaction_hash,
    i.input_index               AS spent_input_index,
    i.block_hash                AS spent_block_hash,
    i.block_number              AS spent_block_number,
    i.block_timestamp           AS spent_block_timestamp,
    o.script_asm,
    o.script_hex,
    o.required_signatures,
    o.type,
    o.addresses,
    o.value,
    o.is_coinbase,
    1 AS revision
FROM inputs AS i
INNER JOIN outputs AS o
    ON i.spending_transaction_hash = o.transaction_hash
   AND i.spending_output_index = o.output_index
WHERE toYYYYMM(i.block_timestamp) >= 200901
  AND toYYYYMM(i.block_timestamp) < 200903;
```

*Phase 3: Enrich inputs by outputs*

```sql
INSERT INTO inputs
SELECT
    i.transaction_hash,
    i.input_index,
    i.block_hash,
    i.block_number,
    i.block_timestamp,
    i.spending_transaction_hash,
    i.spending_output_index,
    i.script_asm,
    i.script_hex,
    i.sequence,
    o.required_signatures AS required_signatures,
    o.type AS type,
    o.addresses AS addresses,
    o.value AS value,
    1 AS revision
FROM inputs AS i
INNER JOIN outputs AS o
    ON i.spending_transaction_hash = o.transaction_hash
   AND i.spending_output_index = o.output_index
WHERE toYYYYMM(i.block_timestamp) >= 200901
  AND toYYYYMM(i.block_timestamp) < 200903;
```



*Finalize deduplication*

```sql
OPTIMIZE TABLE outputs FINAL;
```

## Address-Level Flat Table address

*Purpose & Rationale*

* Explodes each output into **one row per address**, enabling fast balance/history queries.
* Key ordering `(address, transaction_hash, output_index)` aligns with the most common analytics pattern: “all activity for address X”.
* A materialized view (`address_flat_mv`) keeps the table automatically synchronized with `outputs`, removing manual ETL.

```sql
CREATE TABLE address
(
    transaction_hash String,
    output_index UInt64,
    block_hash String,
    block_number UInt64,
    block_timestamp DateTime,
    address String,
    value Float64,
    spent_transaction_hash String,
    spent_input_index UInt64,
    spent_block_hash String,
    spent_block_number UInt64,
    spent_block_timestamp DateTime,
)
ENGINE = ReplacingMergeTree(spent_block_timestamp)
PARTITION BY toYYYYMM(block_timestamp)
ORDER BY (address, transaction_hash, output_index);
```

*One-off backfill (optional if MV is created first)*

```sql
INSERT INTO address
SELECT
    o.transaction_hash,
    o.output_index,
    o.block_hash,
    o.block_number,
    o.block_timestamp,
    address,
    o.value,
    o.spent_transaction_hash,
    o.spent_input_index,
    o.spent_block_hash,
    o.spent_block_number,
    o.spent_block_timestamp,
FROM outputs AS o
ARRAY JOIN o.addresses AS address;
```

*Continuous sync*

```sql
CREATE MATERIALIZED VIEW address_mv
TO address
AS
SELECT
    o.transaction_hash,
    o.output_index,
    o.block_hash,
    o.block_number,
    o.block_timestamp,
    address,
    o.value,
    o.spent_transaction_hash,
    o.spent_input_index,
    o.spent_block_hash,
    o.spent_block_number,
    o.spent_block_timestamp
FROM outputs AS o
ARRAY JOIN o.addresses AS address;
```

*Example query: Satoshi’s famously untouched balance*

```sql
SELECT sum(value) / 100000000. AS balance
FROM address
FINAL
WHERE (address = '12higDjoCCNXSA95xZMWUdPvXNmkAduhWv') AND (spent_transaction_hash = '')
```

## How the Pieces Fit Together (Logic Recap)

1. **Raw ingestion** happens once into `blocks_fat` and `transactions_fat`.
2. Arrays are **exploded** into `inputs` and `outputs`, bringing UTXO granularity.
3. A **self-join** marks outputs as spent, propagating spend metadata forward.
4. `address_flat` (via MV) denormalizes to address level for everyday analytics.
5. Because every table is a `ReplacingMergeTree`, *idempotent* re-loads are safe—essential for long-running blockchain syncs.

> **Forward-looking tip:** Once your “tight” tables stabilize, consider Time-to-Live (TTL) in ClickHouse to automatically purge any stale duplicates retained by the `ReplacingMergeTree` versioning—keeping storage lean without manual `OPTIMIZE FINAL` cycles.