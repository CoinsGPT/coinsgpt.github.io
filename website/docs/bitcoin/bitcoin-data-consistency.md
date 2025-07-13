# 05 Bitcoin Data Consistency

![](/img/bitcoin/bitcoin_data_pipeline.png)


## Data Consistency

> **Concept:** Ingest raw blockchain data into **wide, append-only staging tables** (“fat” tables). Once the data is complete and deduplicated, **transform and load** it into **narrow, query-optimized tables** (“tight” tables).
> **Benefits:**
> • Simple, resilient ETL—raw arrays are stored exactly once.
> • Historical re-processing is unnecessary; transformations are repeatable.
> • Final tables have smaller rows, sorted keys, and domain-specific indexes that accelerate analytics.


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

| Column                  | Revision | Description                                                                   |
| ----------------------- | -------- | ----------------------------------------------------------------------------- |
| `hash`                  | 0        | Transaction hash (primary key)                                                |
| `size`                  | 0        | Size of transaction in bytes                                                  |
| `virtual_size`          | 0        | Virtual size (for fee calculation)                                            |
| `version`               | 0        | Transaction version                                                           |
| `lock_time`             | 0        | Lock time (when the transaction becomes valid)                                |
| `block_hash`            | 0        | Hash of the block this transaction belongs to                                 |
| `block_number`          | 0        | Height of the block this transaction belongs to                               |
| `block_timestamp`       | 0        | Timestamp of the block                                                        |
| `block_timestamp_month` | 0        | Month partition of the block timestamp                                        |
| `is_coinbase`           | 0        | Whether the transaction is coinbase                                           |
| `input_count`           | 0        | Number of inputs in the transaction                                           |
| `output_count`          | 0        | Number of outputs in the transaction                                          |
| `input_value`           | ❌        | Sum of input values                                                           |
| `output_value`          | 0        | Sum of output values                                                          |
| `fee`                   | ❌        | Transaction fee = input\_value - output\_value                                |
| `inputs`                | 0        | Array of input details (index, script, signature info, spent TX, value, etc.) |
| `outputs`               | 0        | Array of output details (index, script, address, value, etc.)                 |
| `revision`              | 0        | Used by ReplacingMergeTree to track changes                                   |

```sql
INSERT INTO transactions
SELECT
    t.hash,
    t.size,
    t.virtual_size,
    t.version,
    t.lock_time,
    t.block_hash,
    t.block_number,
    t.block_timestamp,
    t.block_timestamp_month,
    t.is_coinbase,
    t.input_count,
    t.output_count,
    COALESCE(i.total_input_value, 0) AS input_value,
    t.output_value,
    COALESCE(i.total_input_value, 0) - t.output_value AS fee,
    t.inputs,
    t.outputs,
    1 AS revision
FROM transactions AS t
LEFT JOIN (
    SELECT
        transaction_hash,
        count() AS input_count,
        sum(value) AS total_input_value
    FROM inputs
    GROUP BY transaction_hash
    WHERE toYYYYMM(t.block_timestamp) = {partition}
) AS i
ON t.hash = i.transaction_hash
WHERE toYYYYMM(t.block_timestamp) = {partition};
```

| Column                  | Revision | Description                                                                   |
| ----------------------- | -------- | ----------------------------------------------------------------------------- |
| `hash`                  | 0        | Transaction hash (primary key)                                                |
| `size`                  | 0        | Size of transaction in bytes                                                  |
| `virtual_size`          | 0        | Virtual size (for fee calculation)                                            |
| `version`               | 0        | Transaction version                                                           |
| `lock_time`             | 0        | Lock time (when the transaction becomes valid)                                |
| `block_hash`            | 0        | Hash of the block this transaction belongs to                                 |
| `block_number`          | 0        | Height of the block this transaction belongs to                               |
| `block_timestamp`       | 0        | Timestamp of the block                                                        |
| `block_timestamp_month` | 0        | Month partition of the block timestamp                                        |
| `is_coinbase`           | 0        | Whether the transaction is coinbase                                           |
| `input_count`           | 0        | Number of inputs in the transaction                                           |
| `output_count`          | 0        | Number of outputs in the transaction                                          |
| `input_value`           | 1        | Sum of input values                                                           |
| `output_value`          | 0        | Sum of output values                                                          |
| `fee`                   | 1        | Transaction fee = input\_value - output\_value                                |
| `inputs`                | 0        | Array of input details (index, script, signature info, spent TX, value, etc.) |
| `outputs`               | 0        | Array of output details (index, script, address, value, etc.)                 |
| `revision`              | 1        | Used by ReplacingMergeTree to track changes                                   |

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


```sql
INSERT INTO blocks
SELECT
    b.hash,
    b.size,
    b.stripped_size,
    b.weight,
    b.number,
    b.version,
    b.merkle_root,
    b.timestamp,
    b.timestamp_month,
    b.nonce,
    b.bits,
    b.coinbase_param,
    b.previous_block_hash,
    b.difficulty,
    b.transaction_count,
    b.transactions,
    COALESCE(t.total_fees, 0) AS total_fees,
    b.subsidy,
    b.reward,
    b.coinbase_transaction,
    b.coinbase_addresses,
    COALESCE(t.input_count, 0) AS input_count,
    COALESCE(t.input_value, 0) AS input_value,
    COALESCE(t.output_count, 0) AS output_count,
    COALESCE(t.output_value, 0) AS output_value,
    1 AS revision
FROM blocks AS b
LEFT JOIN (
    SELECT
        block_hash,
        SUM(input_count) AS input_count,
        SUM(input_value) AS input_value,
        SUM(output_count) AS output_count,
        SUM(output_value) AS output_value,
        SUM(fee) AS total_fees,
    FROM transactions
    WHERE toYYYYMM(t.block_timestamp) = {partition}
    GROUP BY block_hash
) AS t
ON b.hash = t.block_hash
WHERE toYYYYMM(b.timestamp) = {partition}; -- Optional: partition filter
```

| Column                 | Revision | Description                                                       |
| ---------------------- | -------- | ----------------------------------------------------------------- |
| `total_fees`           | 1        | Sum of all transaction fees in block (input value - output value) |
| `subsidy`              | ❌       | Block subsidy (depends on height)                                 |
| `reward`               | ❌       | subsidy + total_fees                                              |
| `coinbase_transaction` | ❌       | Coinbase TX ID (first transaction)                                |
| `coinbase_addresses`   | ❌       | Addresses in the coinbase transaction’s outputs                   |
| `input_count`          | 1        | Total number of inputs in all transactions                        |
| `input_value`          | 1        | Total value of all inputs                                         |
| `output_count`         | 1        | Total number of outputs in all transactions                       |
| `output_value`         | 1        | Total value of all outputs                                        |
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

