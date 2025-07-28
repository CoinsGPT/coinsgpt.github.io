
# 09 JanusGraph Bulk Loading


:::info Prompt
Could you please generate a professionally written blog-style guide, as if authored by a professor, explaining how to build a Kafka-based TigerGraph loader for Bitcoin data, with all real-world details and schema-complete examples.
:::

## Goal

In this tutorial, I will walk you through how to **stream Bitcoin blockchain data into TigerGraph using Kafka**. You'll learn how to:

* Define a Bitcoin-specific schema in TigerGraph
* Prepare realistic, complete Kafka messages
* Write a **GSQL Kafka Loading Job** that consumes from Kafka topics
* Load data into **vertices** and **edges** without omitting any attributes


## Prerequisite: Bitcoin Schema in TigerGraph

We begin with a fully normalized schema that models Bitcoin’s **block**, **transaction**, **output**, and **address**, along with their relationships:

**Vertex Types**

```gsql
CREATE VERTEX Block (
  PRIMARY_ID hash STRING,
  number UINT,
  version UINT,
  timestamp DATETIME,
  nonce STRING,
  bits STRING,
  merkle_root STRING,
  size UINT,
  stripped_size UINT,
  weight UINT,
  transaction_count UINT
)

CREATE VERTEX Transaction (
  PRIMARY_ID hash STRING,
  version UINT,
  lock_time UINT,
  size UINT,
  virtual_size UINT,
  input_count UINT,
  output_count UINT,
  input_value DOUBLE,
  output_value DOUBLE,
  fee DOUBLE,
  is_coinbase BOOL
)

CREATE VERTEX Output (
  PRIMARY_ID transaction_hash_index STRING,  -- "txhash_0"
  transaction_hash STRING,
  index UINT,
  value DOUBLE,
  script_asm STRING,
  script_hex STRING,
  required_signatures UINT,
  type STRING
)

CREATE VERTEX Address (
  PRIMARY_ID address STRING
)
```

**Edge Types**

```gsql
CREATE DIRECTED EDGE txn_block (FROM Transaction, TO Block) WITH REVERSE_EDGE="block_txn"
CREATE DIRECTED EDGE txn_output (FROM Transaction, TO Output) WITH REVERSE_EDGE="output_txn"
CREATE DIRECTED EDGE input_txn (FROM Output, TO Transaction) WITH REVERSE_EDGE="txn_input"
CREATE DIRECTED EDGE output_address (FROM Output, TO Address) WITH REVERSE_EDGE="address_output"
CREATE DIRECTED EDGE block_chain (FROM Block, TO Block) WITH REVERSE_EDGE="reverse_chain"
```

## 1: Prepare Real Kafka JSON Messages

Kafka producers should publish **fully populated JSON** messages. Below are examples for each vertex and edge, based on **realistic** blockchain data.

Vertex: Block (`block_topic`)

```json
{
  "hash": "0000000000000000000c6f7ad43c0fa03de16b00a03b1cfeb38deaa86d73a750",
  "number": 781456,
  "version": 536870912,
  "timestamp": "2023-04-30T16:12:45Z",
  "nonce": "1937512544",
  "bits": "1709fd7e",
  "merkle_root": "9a4a8475e8e81b4f57c5c83348923c25c9c8d40d173b593f8c859ae5d481845f",
  "size": 1258478,
  "stripped_size": 882323,
  "weight": 3993752,
  "transaction_count": 2563
}
```

Vertex: Transaction (`transaction_topic`)

```json
{
  "hash": "2d11a4f8a39286f71c4584b708c2e73a14fa6c6a7a7ebd22df27dbf6b96dc3ad",
  "version": 2,
  "lock_time": 0,
  "size": 235,
  "virtual_size": 141,
  "input_count": 1,
  "output_count": 2,
  "input_value": 0.005,
  "output_value": 0.0048,
  "fee": 0.0002,
  "is_coinbase": false
}
```

Vertex: Output (`output_topic`)

```json
{
  "transaction_hash_index": "2d11a4f8a39286f71c4584b708c2e73a14fa6c6a7a7ebd22df27dbf6b96dc3ad_0",
  "transaction_hash": "2d11a4f8a39286f71c4584b708c2e73a14fa6c6a7a7ebd22df27dbf6b96dc3ad",
  "index": 0,
  "value": 0.0025,
  "script_asm": "OP_DUP OP_HASH160 ab680f1e19a6bf7fc7 OP_EQUALVERIFY OP_CHECKSIG",
  "script_hex": "76a914ab680f1e19a6bf7fc788ac",
  "required_signatures": 1,
  "type": "pubkeyhash"
}
```

Vertex: Address (`address_topic`)

```json
{
  "address": "1PNXRAA3dYTzVRLwWG1j3ip9JKtmzvBjdY"
}
```

Edge: txn\_block (`txn_block_topic`)

```json
{
  "FROM": "2d11a4f8a39286f71c4584b708c2e73a14fa6c6a7a7ebd22df27dbf6b96dc3ad",
  "TO": "0000000000000000000c6f7ad43c0fa03de16b00a03b1cfeb38deaa86d73a750"
}
```

...and similar JSONs for `txn_output_topic`, `input_txn_topic`, `output_address_topic`, and `block_chain_topic`.

## 2: Enable Kafka Support in TigerGraph

```bash
gadmin config set KafkaLoader.Enable true
gadmin config apply -y
gadmin restart
```

## 3: Write the GSQL Kafka Loader

Here’s a complete `GSQL` loading job using **Kafka-based JSON streaming**:

```gsql
USE GRAPH BitcoinGraph

BEGIN LOAD JOB kafka_bitcoin_job

  USING kafka_address="localhost:9092", json_file="true"

  DEFINE FILENAME block_file;
  LOAD block_file TO VERTEX Block VALUES (
    $"hash", $"number", $"version", $"timestamp", $"nonce",
    $"bits", $"merkle_root", $"size", $"stripped_size", $"weight", $"transaction_count"
  ) USING kafka_topic="block_topic";

  DEFINE FILENAME txn_file;
  LOAD txn_file TO VERTEX Transaction VALUES (
    $"hash", $"version", $"lock_time", $"size", $"virtual_size",
    $"input_count", $"output_count", $"input_value", $"output_value", $"fee", $"is_coinbase"
  ) USING kafka_topic="transaction_topic";

  DEFINE FILENAME output_file;
  LOAD output_file TO VERTEX Output VALUES (
    $"transaction_hash_index", $"transaction_hash", $"index", $"value",
    $"script_asm", $"script_hex", $"required_signatures", $"type"
  ) USING kafka_topic="output_topic";

  DEFINE FILENAME address_file;
  LOAD address_file TO VERTEX Address VALUES (
    $"address"
  ) USING kafka_topic="address_topic";

  DEFINE FILENAME txn_block_file;
  LOAD txn_block_file TO EDGE txn_block VALUES (
    $"FROM", $"TO"
  ) USING kafka_topic="txn_block_topic";

  DEFINE FILENAME txn_output_file;
  LOAD txn_output_file TO EDGE txn_output VALUES (
    $"FROM", $"TO"
  ) USING kafka_topic="txn_output_topic";

  DEFINE FILENAME input_txn_file;
  LOAD input_txn_file TO EDGE input_txn VALUES (
    $"FROM", $"TO"
  ) USING kafka_topic="input_txn_topic";

  DEFINE FILENAME output_address_file;
  LOAD output_address_file TO EDGE output_address VALUES (
    $"FROM", $"TO"
  ) USING kafka_topic="output_address_topic";

  DEFINE FILENAME block_chain_file;
  LOAD block_chain_file TO EDGE block_chain VALUES (
    $"FROM", $"TO"
  ) USING kafka_topic="block_chain_topic";

END
```

## 4: Run the Kafka Loading Job

To launch the real-time Kafka loader:

```bash
gsql ./bitcoin_kafka_loader.gsql
```

Then execute:

```gsql
RUN LOADING JOB kafka_bitcoin_job USING
  block_file="dummy",
  txn_file="dummy",
  output_file="dummy",
  address_file="dummy",
  txn_block_file="dummy",
  txn_output_file="dummy",
  input_txn_file="dummy",
  output_address_file="dummy",
  block_chain_file="dummy"
```

✅ TigerGraph will now consume from Kafka continuously.

## Monitoring and Troubleshooting

To monitor:

```bash
gadmin status KafkaLoader
tail -f /home/tigergraph/tigergraph/logs/GSQL_KAFKA_LOADER_LOG.*
```

## Final Thoughts

* ✅ **All attributes are preserved**. No simplifications.
* 🔁 Kafka-based ingestion allows real-time analytics on UTXO graphs.
* 🧩 TigerGraph’s bidirectional edges and efficient parallel loading make it ideal for analyzing complex transaction flows.