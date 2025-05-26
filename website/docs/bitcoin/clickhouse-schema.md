# 04 ClickHouse Schema

![](/img/bitcoin/bitcoin_data_pipeline.png)

## Bitcoin Schema Design

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
  transaction_count UInt64
)
ENGINE = ReplacingMergeTree()
PRIMARY KEY (hash)
PARTITION BY toYYYYMM(timestamp_month)
ORDER BY hash;
```

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

