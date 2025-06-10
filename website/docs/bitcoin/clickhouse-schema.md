# 04 ClickHouse Schema

![](/img/bitcoin/bitcoin_data_pipeline.png)


"Create Fat First, Then Make Tight" Strategy

This design pattern—**"create fat, then make tight"**—is a **staging + optimization approach** for database schema design and data modeling. It's useful when:

* You're importing raw, nested, or complex data (e.g. from JSON, APIs, blockchain)
* You want fast ingestion first, and optimized queries later


## Fat ➝ Tight in Practice

Step 1: **Create Fat Table (Staging Table)**

Start by creating a **fat schema** that mirrors your input data structure with nested arrays or wide fields.

Example (ClickHouse – Bitcoin Transactions):

```sql
CREATE TABLE transactions_fat (
  txid String,
  block_hash String,
  inputs Array(Tuple(
    index UInt64,
    prev_txid String,
    prev_vout UInt64,
    script_sig String,
    sequence UInt64,
    value Float64,
    addresses Array(String)
  )),
  outputs Array(Tuple(
    index UInt64,
    script_pubkey String,
    value Float64,
    addresses Array(String)
  )),
  block_time DateTime
) ENGINE = MergeTree()
ORDER BY (block_time);
```


Step 2: **Extract & Normalize into Tight Tables**

After the data is loaded, **flatten and normalize** into "tight" tables:

* Store one row per input/output/transaction
* Extract key fields
* Optimize for analytic queries

Example: Inputs Table

```sql
CREATE TABLE tx_inputs (
  txid String,
  index UInt64,
  prev_txid String,
  prev_vout UInt64,
  script_sig String,
  sequence UInt64,
  value Float64,
  address String,
  block_time DateTime
) ENGINE = MergeTree()
ORDER BY (block_time);
```

Transform from fat ➝ tight

```sql
INSERT INTO tx_inputs
SELECT
  txid,
  i.index,
  i.prev_txid,
  i.prev_vout,
  i.script_sig,
  i.sequence,
  i.value,
  addr AS address,
  block_time
FROM transactions_fat
ARRAY JOIN inputs AS i
ARRAY JOIN i.addresses AS addr;
```

> This flattens nested arrays and creates a fast, queryable structure.


Why This Pattern Works

| Step            | Goal                                                             |
| --------------- | ---------------------------------------------------------------- |
| **Fat table**   | Fast bulk insert, raw data integrity                             |
| **Tight table** | Optimized query performance, indexed structure                   |
| **Split later** | Post-ingestion transformation lets you adapt based on real usage |


Optional Enhancements

* Use **materialized views** to automate tight-table generation
* Use **Kafka + ClickHouse** with JSON ingestion for real-time fat ➝ tight
* Add **partitions** by block height or time in tight tables


## Enhance "fat ➝ tight" model

Let’s enhance the "fat ➝ tight" model using **Materialized Views in ClickHouse**, so that **flattened “tight” tables are auto-populated** from the fat raw data.

We have a **fat table** storing Bitcoin transactions with nested arrays for inputs/outputs.

* **Fast ingestion** into the fat table (from JSON, Kafka, etc.)
* **Auto-generated tight tables** (e.g., `tx_inputs`) for querying, updated in real-time


Step-by-Step: Fat ➝ Tight via Materialized View

step 1. Fat Table (Staging)

```sql
CREATE TABLE transactions_fat (
  txid String,
  block_hash String,
  inputs Array(Tuple(
    index UInt64,
    prev_txid String,
    prev_vout UInt64,
    script_sig String,
    sequence UInt64,
    value Float64,
    addresses Array(String)
  )),
  outputs Array(Tuple(
    index UInt64,
    script_pubkey String,
    value Float64,
    addresses Array(String)
  )),
  block_time DateTime
) ENGINE = MergeTree()
ORDER BY (block_time);
```


setp 2. Tight Table for Inputs

```sql
CREATE TABLE tx_inputs (
  txid String,
  index UInt64,
  prev_txid String,
  prev_vout UInt64,
  script_sig String,
  sequence UInt64,
  value Float64,
  address String,
  block_time DateTime
) ENGINE = MergeTree()
ORDER BY (block_time);
```

setp 3. Materialized View (Fat ➝ Inputs)

```sql
CREATE MATERIALIZED VIEW mv_tx_inputs
TO tx_inputs AS
SELECT
  txid,
  i.index,
  i.prev_txid,
  i.prev_vout,
  i.script_sig,
  i.sequence,
  i.value,
  addr AS address,
  block_time
FROM transactions_fat
ARRAY JOIN inputs AS i
ARRAY JOIN i.addresses AS addr;
```

How It Works

* Every `INSERT` into `transactions_fat` **automatically triggers** `mv_tx_inputs`
* The view flattens nested inputs and inserts rows into `tx_inputs`
* No need for separate transformation queries or batch jobs

## Block Design

To ETL the raw data of block from (Bitcoin Core)[https://bitcoincore.org/en/doc/29.0.0/rpc/blockchain/getblock/] as blocks_fat.  

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

To create a **tight `blocks` table** without the `transactions` array from your `blocks_fat` table using a **Materialized View**, follow this plan:

* Excluding the `transactions` array
* Keeping all other atomic block attributes
* Auto-populating the tight table on insert

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
  transaction_count UInt64
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp_month)
ORDER BY hash;
```

Create the Materialized View from `blocks_fat` ➝ `blocks`

```sql
CREATE MATERIALIZED VIEW mv_blocks_tight
TO blocks AS
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
  nTx
FROM blocks_fat;
```

Summary::w

| Component         | Purpose                         |
| ----------------- | ------------------------------- |
| `blocks_fat`      | Full raw block data (with txs)  |
| `blocks`    | Optimized analytic structure    |
| `mv_blocks_tight` | Materialized View (fat ➝ tight) |


## Transaction Design

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
  input_count UInt64,
  output_count UInt64,
  input_value Float64,
  output_value Float64,
  is_coinbase BOOL,
  fee Float64,
  inputs Array(Tuple(index UInt64, spent_transaction_hash String, spent_output_index UInt64, script_asm String, script_hex String, sequence UInt64, required_signatures UInt64, type String, addresses Array(String), value Float64)),
  outputs Array(Tuple(index UInt64, script_asm String, script_hex String, required_signatures UInt64, type String, addresses Array(String), value Float64))
)
ENGINE = ReplacingMergeTree()
PRIMARY KEY (block_hash, hash)
PARTITION BY toYYYYMM(block_timestamp_month)
ORDER BY (block_hash, hash);
```

```sql
CREATE VIEW outputs AS
SELECT
    hash AS transaction_hash,
    block_hash,
    block_number,
    block_timestamp,
    output.1 AS index,
    output.2 AS script_asm,
    output.3 AS script_hex,
    output.4 AS required_signatures,
    output.5 AS type,
    output.6 AS addresses,
    output.7 AS value
FROM transactions
ARRAY JOIN outputs AS output;
```


```sql
CREATE VIEW inputs AS
SELECT
    hash AS transaction_hash,
    block_hash,
    block_number,
    block_timestamp,
    input.1 AS index,
    input.2 AS spent_transaction_hash,
    input.3 AS spent_output_index,
    input.4 AS script_asm,
    input.5 AS script_hex,
    input.6 AS sequence,
    input.7 AS required_signatures,
    input.8 AS type,
    input.9 AS addresses,
    input.10 AS value
FROM transactions
ARRAY JOIN inputs AS input;
```

## JSON type

### blocks.json

Field               | Type            |
--------------------|-----------------|
hash                | hex_string      |
size                | bigint          |
stripped_size       | bigint          |
weight              | bigint          |
number              | bigint          |
version             | bigint          |
merkle_root         | hex_string      |
timestamp           | bigint          |
nonce               | hex_string      |
bits                | hex_string      |
coinbase_param      | hex_string      |
transaction_count   | bigint          |

### transactions.json

Field                   | Type                  |
------------------------|-----------------------|
hash                    | hex_string            |
size                    | bigint                |
virtual_size            | bigint                |
version                 | bigint                |
lock_time               | bigint                |
block_number            | bigint                |
block_hash              | hex_string            |
block_timestamp         | bigint                |
is_coinbase             | boolean               |
index                   | bigint                |
inputs                  | []transaction_input   |
outputs                 | []transaction_output  |
input_count             | bigint                |
output_count            | bigint                |
input_value             | bigint                |
output_value            | bigint                |
fee                     | bigint                |

### transaction_input

Field                   | Type                  |
------------------------|-----------------------|
index                   | bigint                |
spent_transaction_hash  | hex_string            |
spent_output_index      | bigint                |
script_asm              | string                |
script_hex              | hex_string            |
sequence                | bigint                |
required_signatures     | bigint                |
type                    | string                |
addresses               | []string              |
value                   | bigint                |

### transaction_output

Field                   | Type                  |
------------------------|-----------------------|
index                   | bigint                |
script_asm              | string                |
script_hex              | hex_string            |
required_signatures     | bigint                |
type                    | string                |
addresses               | []string              |
value                   | bigint                |

