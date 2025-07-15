# 04 ClickHouse Schema

![](/img/bitcoin/bitcoin_data_pipeline.png)


##  Overall Strategy

> Create Fat First, Then Make Tight
> **Concept:** Ingest raw blockchain data into **wide, append-only staging tables** (“fat” tables). Once the data is complete and deduplicated, **transform and load** it into **narrow, query-optimized tables** (“tight” tables).
> **Benefits:**
> Simple, resilient ETL—raw arrays are stored exactly once.
> Historical re-processing is unnecessary; transformations are repeatable.
> Final tables have smaller rows, sorted keys, and domain-specific indexes that accelerate analytics.


## Block_fat Table 

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

## Block Table 

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


## Transaction_fat Table 

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

## Transaction Table 

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

## Inputs Table

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
PRIMARY KEY (transaction_hash, input_index)
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

| Column                      | Revision | Description                                                 |
| --------------------------- | -------- | ----------------------------------------------------------- |
| `transaction_hash`          | 0        | Hash of the transaction this input belongs to               |
| `input_index`               | 0        | Index of the input in the transaction's input array         |
| `block_hash`                | 0        | Hash of the block that includes this transaction            |
| `block_number`              | 0        | Height of the block containing the transaction              |
| `block_timestamp`           | 0        | Timestamp of the block                                      |
| `spending_transaction_hash` | 0        | Hash of the previous (spent) transaction                    |
| `spending_output_index`     | 0        | Index of the output in the previous transaction being spent |
| `script_asm`                | 0        | Script in human-readable ASM format                         |
| `script_hex`                | 0        | Script in hexadecimal format                                |
| `sequence`                  | 0        | Sequence number of the input                                |
| `required_signatures`       | ❌        | Number of required signatures to spend this input           |
| `type`                      | ❌        | Script type (e.g., `pubkeyhash`, `multisig`)                |
| `addresses`                 | ❌        | Array of decoded Bitcoin addresses related to this input    |
| `value`                     | ❌        | Value of the input in BTC                                   |
| `revision`                  | 0        | Revision number for `ReplacingMergeTree` version control    |


## Outputs Table

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
PRIMARY KEY (transaction_hash, output_index)
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

| Column                   | Revision | Description                                                       |
| ------------------------ | -------- | ----------------------------------------------------------------- |
| `transaction_hash`       | 0        | Hash of the transaction this output belongs to                    |
| `output_index`           | 0        | Index of the output within the transaction                        |
| `block_hash`             | 0        | Hash of the block containing this transaction                     |
| `block_number`           | 0        | Height of the block containing the transaction                    |
| `block_timestamp`        | 0        | Timestamp of the block                                            |
| `spent_transaction_hash` | ❌        | Hash of the transaction that spent this output                    |
| `spent_input_index`      | ❌        | Input index in the spending transaction that consumed this output |
| `spent_block_hash`       | ❌        | Hash of the block where the output was spent                      |
| `spent_block_number`     | ❌        | Height of the block where the output was spent                    |
| `spent_block_timestamp`  | ❌        | Timestamp of the block where the output was spent                 |
| `script_asm`             | 0        | Script in human-readable ASM format                               |
| `script_hex`             | 0        | Script in hexadecimal format                                      |
| `required_signatures`    | 0        | Number of required signatures to spend this output                |
| `type`                   | 0        | Output script type (e.g., `pubkeyhash`, `nulldata`, `multisig`)   |
| `addresses`              | 0        | Array of decoded Bitcoin addresses this output is associated with |
| `value`                  | 0        | Value of the output in BTC                                        |
| `is_coinbase`            | 0        | Whether the output originates from a coinbase transaction         |
| `revision`               | 0        | Revision number for `ReplacingMergeTree` version control          |



## Table inputs_outputs 

Perform the INNER JOIN only once, store the merged data into an intermediate table (inputs_outputs), and then insert into inputs and outputs from that table.

```sql
CREATE TABLE inputs_outputs
(
    -- Inputs fields
    i_transaction_hash String,
    i_input_index UInt64,
    i_block_hash String,
    i_block_number UInt64,
    i_block_timestamp DateTime,
    i_spending_transaction_hash String,
    i_spending_output_index UInt64,
    i_script_asm String,
    i_script_hex String,
    i_sequence UInt64,
    i_required_signatures UInt64,
    i_type String,
    i_addresses Array(String),
    i_value Float64,

    -- Outputs fields
    o_transaction_hash String,
    o_output_index UInt64,
    o_block_hash String,
    o_block_number UInt64,
    o_block_timestamp DateTime,
    o_spent_transaction_hash String,
    o_spent_input_index UInt64,
    o_spent_block_hash String,
    o_spent_block_number UInt64,
    o_spent_block_timestamp DateTime,
    o_script_asm String,
    o_script_hex String,
    o_required_signatures UInt64,
    o_type String,
    o_addresses Array(String),
    o_value Float64,
    o_is_coinbase BOOL,

    revision UInt64
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(i_block_timestamp)
PRIMARY KEY (i_transaction_hash, i_input_index)
ORDER BY (i_transaction_hash, i_input_index);
```

*Phase 1: Insert Data into inputs_outputs (One JOIN Only)*

```sql
INSERT INTO inputs_outputs
SELECT
    -- Inputs fields (after join)
    i.transaction_hash AS i_transaction_hash,
    i.input_index AS i_input_index,
    i.block_hash AS i_block_hash,
    i.block_number AS i_block_number,
    i.block_timestamp AS i_block_timestamp,
    i.spending_transaction_hash AS i_spending_transaction_hash,
    i.spending_output_index AS i_spending_output_index,
    i.script_asm AS i_script_asm,
    i.script_hex AS i_script_hex,
    i.sequence AS i_sequence,
    o.required_signatures AS i_required_signatures,
    o.type AS i_type,
    o.addresses AS i_addresses,
    o.value AS i_value,

    -- Outputs fields (after join)
    o.transaction_hash AS o_transaction_hash,
    o.output_index AS o_output_index,
    o.block_hash AS o_block_hash,
    o.block_number AS o_block_number,
    o.block_timestamp AS o_block_timestamp,
    i.transaction_hash AS o_spent_transaction_hash,  -- updated values
    i.input_index AS o_spent_input_index,
    i.block_hash AS o_spent_block_hash,
    i.block_number AS o_spent_block_number,
    i.block_timestamp AS o_spent_block_timestamp,
    o.script_asm AS o_script_asm,
    o.script_hex AS o_script_hex,
    o.required_signatures AS o_required_signatures,
    o.type AS o_type,
    o.addresses AS o_addresses,
    o.value AS o_value,
    o.is_coinbase AS o_is_coinbase,

    1 AS revision
FROM inputs AS i
INNER JOIN outputs AS o
    ON i.spending_transaction_hash = o.transaction_hash
   AND i.spending_output_index = o.output_index
WHERE toYYYYMM(i.block_timestamp) >= 200901
  AND toYYYYMM(i.block_timestamp) < 200903;
```

*Phase 2: Mark outputs as spent*

```sql
INSERT INTO outputs
SELECT
    o_transaction_hash AS transaction_hash,
    o_output_index AS output_index,
    o_block_hash AS block_hash,
    o_block_number AS block_number,
    o_block_timestamp AS block_timestamp,
    o_spent_transaction_hash AS spent_transaction_hash,
    o_spent_input_index AS spent_input_index,
    o_spent_block_hash AS spent_block_hash,
    o_spent_block_number AS spent_block_number,
    o_spent_block_timestamp AS spent_block_timestamp,
    o_script_asm AS script_asm,
    o_script_hex AS script_hex,
    o_required_signatures AS required_signatures,
    o_type AS type,
    o_addresses AS addresses,
    o_value AS value,
    o_is_coinbase AS is_coinbase,
    revision
FROM inputs_outputs;
WHERE toYYYYMM(i_block_timestamp) >= 200901
  AND toYYYYMM(i_block_timestamp) < 200903;
```

| Column                   | Revision | Description                                                       |
| ------------------------ | -------- | ----------------------------------------------------------------- |
| `transaction_hash`       | 0        | Hash of the transaction this output belongs to                    |
| `output_index`           | 0        | Index of the output within the transaction                        |
| `block_hash`             | 0        | Hash of the block containing this transaction                     |
| `block_number`           | 0        | Height of the block containing the transaction                    |
| `block_timestamp`        | 0        | Timestamp of the block                                            |
| `spent_transaction_hash` | 1        | Hash of the transaction that spent this output                    |
| `spent_input_index`      | 1        | Input index in the spending transaction that consumed this output |
| `spent_block_hash`       | 1        | Hash of the block where the output was spent                      |
| `spent_block_number`     | 1        | Height of the block where the output was spent                    |
| `spent_block_timestamp`  | 1        | Timestamp of the block where the output was spent                 |
| `script_asm`             | 0        | Script in human-readable ASM format                               |
| `script_hex`             | 0        | Script in hexadecimal format                                      |
| `required_signatures`    | 0        | Number of required signatures to spend this output                |
| `type`                   | 0        | Output script type (e.g., `pubkeyhash`, `nulldata`, `multisig`)   |
| `addresses`              | 0        | Array of decoded Bitcoin addresses this output is associated with |
| `value`                  | 0        | Value of the output in BTC                                        |
| `is_coinbase`            | 0        | Whether the output originates from a coinbase transaction         |
| `revision`               | 1        | Revision number for `ReplacingMergeTree` version control          |

*Phase 3: Enrich inputs by outputs*

```sql
INSERT INTO inputs
SELECT
    i_transaction_hash AS transaction_hash,
    i_input_index AS input_index,
    i_block_hash AS block_hash,
    i_block_number AS block_number,
    i_block_timestamp AS block_timestamp,
    i_spending_transaction_hash AS spending_transaction_hash,
    i_spending_output_index AS spending_output_index,
    i_script_asm AS script_asm,
    i_script_hex AS script_hex,
    i_sequence AS sequence,
    i_required_signatures AS required_signatures,
    i_type AS type,
    i_addresses AS addresses,
    i_value AS value,
    revision
FROM inputs_outputs;
WHERE toYYYYMM(i_block_timestamp) >= 200901
  AND toYYYYMM(i_block_timestamp) < 200903;
```

| Column                      | Revision | Description                                                 |
| --------------------------- | -------- | ----------------------------------------------------------- |
| `transaction_hash`          | 0        | Hash of the transaction this input belongs to               |
| `input_index`               | 0        | Index of the input in the transaction's input array         |
| `block_hash`                | 0        | Hash of the block that includes this transaction            |
| `block_number`              | 0        | Height of the block containing the transaction              |
| `block_timestamp`           | 0        | Timestamp of the block                                      |
| `spending_transaction_hash` | 0        | Hash of the previous (spent) transaction                    |
| `spending_output_index`     | 0        | Index of the output in the previous transaction being spent |
| `script_asm`                | 0        | Script in human-readable ASM format                         |
| `script_hex`                | 0        | Script in hexadecimal format                                |
| `sequence`                  | 0        | Sequence number of the input                                |
| `required_signatures`       | 1        | Number of required signatures to spend this input           |
| `type`                      | 1        | Script type (e.g., `pubkeyhash`, `multisig`)                |
| `addresses`                 | 1        | Array of decoded Bitcoin addresses related to this input    |
| `value`                     | 1        | Value of the input in BTC                                   |
| `revision`                  | 1        | Revision number for `ReplacingMergeTree` version control    |


*Finalize deduplication*

```sql
OPTIMIZE TABLE outputs FINAL;
```

## Addresses Table 

*Purpose & Rationale*

* Explodes each output into **one row per address**, enabling fast balance/history queries.
* Key ordering `(address, transaction_hash, output_index)` aligns with the most common analytics pattern: “all activity for address X”.
* A materialized view (`address_flat_mv`) keeps the table automatically synchronized with `outputs`, removing manual ETL.

```sql
CREATE TABLE addresses
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
    revision UInt64
)
ENGINE = ReplacingMergeTree(revision)
PARTITION BY toYYYYMM(block_timestamp)
PRIMARY KEY (address, transaction_hash, output_index)
ORDER BY (address, transaction_hash, output_index);
```

*One-off backfill (optional if MV is created first)*

```sql
INSERT INTO addresses
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
    o.revision
FROM outputs AS o
ARRAY JOIN o.addresses AS address;
```

*Continuous sync*

```sql
CREATE MATERIALIZED VIEW addresses_mv
TO addresses
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
    o.spent_block_timestamp,
    o.revision
FROM outputs AS o
ARRAY JOIN o.addresses AS address
```

*Example query: Satoshi’s famously untouched balance*

```sql
SELECT sum(value) / 100000000. AS balance
FROM addresses
FINAL
WHERE (address = '12higDjoCCNXSA95xZMWUdPvXNmkAduhWv') AND (spent_transaction_hash = '')
```

## How the Pieces Fit Together

1. **Raw ingestion** happens once into `blocks_fat` and `transactions_fat`.
2. Arrays are **exploded** into `inputs` and `outputs`, bringing UTXO granularity.
3. A **self-join** marks outputs as spent, propagating spend metadata forward.
4. `address_flat` (via MV) denormalizes to address level for everyday analytics.
5. Because every table is a `ReplacingMergeTree`, *idempotent* re-loads are safe—essential for long-running blockchain syncs.

> **Forward-looking tip:** Once your “tight” tables stabilize, consider Time-to-Live (TTL) in ClickHouse to automatically purge any stale duplicates retained by the `ReplacingMergeTree` versioning—keeping storage lean without manual `OPTIMIZE FINAL` cycles.