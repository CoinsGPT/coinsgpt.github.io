# 02 Stream Raw Data with ETL

![](/img/bitcoin/bitcoin_data_pipeline.png)

Here's a professional and concise summary of the changes introduced in [commit `42dd40d`](https://github.com/blockchain-etl/bitcoin-etl/pull/72/commits/42dd40d0255d243cc3bb9d5229b5b4087a638c37) to add Kafka export functionality to `bitcoin-etl`:


## Add Kafka Export to bitcoin-etl

**Commit:** [`42dd40d`](https://github.com/blockchain-etl/bitcoin-etl/pull/72/commits/42dd40d0255d243cc3bb9d5229b5b4087a638c37)
**PR:** [#72](https://github.com/blockchain-etl/bitcoin-etl/pull/72)
**Author:** [@amitrahav](https://github.com/amitrahav)
**Purpose:** Enable streaming of parsed Bitcoin data (blocks and transactions) directly to Apache Kafka topics.


## Key Additions

1. **New CLI Option: `--output kafka`**

   * Extends the existing `stream` command to support Kafka as a streaming sink.

2. **Kafka Exporter Integration**

   * Introduces a new `KafkaItemExporter` class to send items to Kafka.
   * Uses the `confluent_kafka.Producer` for high-performance message delivery.

3. **New Arguments**

   * `--kafka-bootstrap-servers`: Comma-separated list of Kafka brokers (e.g., `localhost:9092`).
   * `--kafka-topic`: The Kafka topic to publish messages to.

4. **Data Format**

   * Each message is serialized as a JSON string.
   * Messages include block and transaction data parsed from Bitcoin Core via ZMQ.

5. **Graceful Shutdown**

   * Ensures the Kafka producer flushes all buffered messages before exiting.


## Files Modified

* `bitcoinetl/streaming/streamer_adapter.py`
* `bitcoinetl/streaming/streamer.py`
* `bitcoinetl/jobs/exporters/kafka_item_exporter.py` **(new)**
* `cli/stream.py` (adds new CLI options)

## Example Usage

```bash
git clone https://github.com/CoinsGPT/bitcoin-etl.git

cd bitcoin-etl
```
```bash
python3 bitcoinetl.py stream \ 
    -p http://username:password@localhost:8332 \
    --output kafka/localhost:9092 \
    --period-seconds 0 \
    -b 10 \
    -B 50 \
    --enrich true\
    -l last_synced_block.txt
```