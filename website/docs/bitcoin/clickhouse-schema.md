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
  totalFees Float64,
  subsidy Float64,
  reward Float64,
  avgFee Float64,
  coinbaseRaw String,
  coinbaseAddresses Array(String),
  totalInputNumber UInt64,
  totalInputValue Float64,
  totalOutputNumber UInt64,
  totalOutputValue Float64,
  revision UInt64
)
ENGINE = ReplacingMergeTree(revision)
PRIMARY KEY (hash)
PARTITION BY toYYYYMM(timestamp_month)
ORDER BY hash;
```


## Transaction Staging Table `transactions_fat`

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
    value Float64
)
ENGINE = ReplacingMergeTree(block_timestamp)
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
    input.10 AS value
FROM transactions_fat AS t
ARRAY JOIN t.inputs AS input
WHERE t.block_timestamp >= '2009-01-01'
  AND t.block_timestamp < '2013-01-01';
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
    value Float64
)
ENGINE = ReplacingMergeTree(spent_block_timestamp)
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
    output.7 AS value
FROM transactions_fat AS t
ARRAY JOIN t.outputs AS output
WHERE t.block_timestamp >= '2009-01-01'
  AND t.block_timestamp < '2013-01-01';
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
    o.value
FROM inputs AS i
INNER JOIN outputs AS o
    ON i.spending_transaction_hash = o.transaction_hash
   AND i.spending_output_index = o.output_index
WHERE toYYYYMM(i.block_timestamp) >= 200901
  AND toYYYYMM(i.block_timestamp) < 201301;
```

*Finalize deduplication*

```sql
OPTIMIZE TABLE outputs FINAL;
```

## Address-Level Flat Table address_flat

*Purpose & Rationale*

* Explodes each output into **one row per address**, enabling fast balance/history queries.
* Key ordering `(address, transaction_hash, output_index)` aligns with the most common analytics pattern: “all activity for address X”.
* A materialized view (`address_flat_mv`) keeps the table automatically synchronized with `outputs`, removing manual ETL.

```sql
CREATE TABLE address_flat
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
INSERT INTO address_flat
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
CREATE MATERIALIZED VIEW address_flat_mv
TO address_flat
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
SELECT
    sum(value) / 100000000.0 AS balance
FROM address_flat FINAL
WHERE address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
  AND spent_transaction_hash = '';
```

## How the Pieces Fit Together (Logic Recap)

1. **Raw ingestion** happens once into `blocks_fat` and `transactions_fat`.
2. Arrays are **exploded** into `inputs` and `outputs`, bringing UTXO granularity.
3. A **self-join** marks outputs as spent, propagating spend metadata forward.
4. `address_flat` (via MV) denormalizes to address level for everyday analytics.
5. Because every table is a `ReplacingMergeTree`, *idempotent* re-loads are safe—essential for long-running blockchain syncs.

> **Forward-looking tip:** Once your “tight” tables stabilize, consider Time-to-Live (TTL) in ClickHouse to automatically purge any stale duplicates retained by the `ReplacingMergeTree` versioning—keeping storage lean without manual `OPTIMIZE FINAL` cycles.