
# 03 Create Kafka Topics and Consumer Groups

![](/img/bitcoin/bitcoin_data_pipeline.png)

In this guide, we’ll simulate a use case for managing Bitcoin-related streaming data using **Apache Kafka**. We'll cover how to create topics, manage consumers, observe consumption status, and configure retention policies.

---

## Scenario: Stream Bitcoin Blocks and Transactions

You’re building a Kafka-based data pipeline for Bitcoin. You’ll:

1. Create Kafka topics: `blocks` and `transactions`
2. Create consumer groups automatically
3. Produce and consume messages
4. Monitor consumer lags
5. Set log retention policies to prevent disk overflow

---

## 0. Common Command

```bash
kafka-consumer-groups.sh \
  --describe \
  --group bitcoin-group \
  --bootstrap-server localhost:9092
```

## 1. Create Kafka Topics

Topics are the core abstraction for message streams. You create them using `kafka-topics.sh`.

```bash
kafka-topics.sh \
  --create \
  --topic blocks \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1
```

```bash
kafka-topics.sh \
  --create \
  --topic transactions \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1
```

Verify that the topics were created:

```bash
kafka-topics.sh \
  --list \
  --bootstrap-server localhost:9092
```

## 2. Produce and Consume Messages

Produce messages into a topic:

```bash
kafka-console-producer.sh \
  --topic transactions \
  --bootstrap-server localhost:9092
```

Type messages in the terminal after this command runs.

Consume messages from the beginning:

```bash
kafka-console-consumer.sh \
  --topic transactions \
  --from-beginning \
  --bootstrap-server localhost:9092
```

## 3. Create and Use Consumer Groups

Consumer groups are created **implicitly** when a consumer subscribes to a topic with a unique `--group`.

```bash
kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic blocks \
  --group bitcoin-group
```

```bash
kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic transactions \
  --group bitcoin-group
```

Now the group `bitcoin-group` is created and tracks offsets for each consumer.

---

## 4. Monitor Consumer Groups

List all consumer groups:

```bash
kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --list
```

Describe group state (offsets, lag, assignments):

```bash
kafka-consumer-groups.sh \
  --describe \
  --group bitcoin-group \
  --bootstrap-server localhost:9092
```

Sample Output:

```
TOPIC       PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG  CONSUMER-ID     HOST             CLIENT-ID
blocks      0          120             150             30   consumer-1-xyz  /192.168.0.2     consumer-1
transactions 1         110             140             30   consumer-1-xyz  /192.168.0.2     consumer-1
```

## 5. Configure Log Retention (to prevent disk overflow)

You can configure how long Kafka retains messages or how much disk space it uses per topic.

```bash
# Set retention to 1 day and max 1GB per partition for 'blocks'
kafka-configs.sh \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name blocks \
  --alter \
  --add-config retention.ms=86400000,retention.bytes=1073741824,cleanup.policy=delete
```

```bash
# Same for 'transactions'
kafka-configs.sh \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name transactions \
  --alter \
  --add-config retention.ms=86400000,retention.bytes=1073741824,cleanup.policy=delete
```

Explanation:

* `retention.ms=86400000`: retain messages for 1 day.
* `retention.bytes=1073741824`: max 1 GB per partition.
* `cleanup.policy=delete`: delete old segments (default behavior).

> Kafka will delete log segments when **either** of the conditions is met.


## 6. Enlarge Topic Max Message

Apache Kafka has several key limitations and configurable constraints that impact how much data can be produced, buffered, and consumed. Here's a clear breakdown of the main types of limitations:
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

## 7. Describe a Kafka Topic (to check configs)

```bash
# View details of the 'transactions' topic
kafka-topics.sh \
  --describe \
  --topic transactions \
  --bootstrap-server localhost:9092
```

## Summary

| Task                      | Command                                                |
| ------------------------- | ------------------------------------------------------ |
| Create topic              | `kafka-topics.sh --create`                             |
| List topics               | `kafka-topics.sh --list`                               |
| Describe topic            | `kafka-topics.sh --describe`                           |
| Produce message           | `kafka-console-producer.sh`                            |
| Consume message           | `kafka-console-consumer.sh`                            |
| Use consumer group        | `--group my-group` on consumer                         |
| List consumer groups      | `kafka-consumer-groups.sh --list`                      |
| Describe consumer group   | `kafka-consumer-groups.sh --describe --group my-group` |
| Configure topic retention | `kafka-configs.sh --alter --add-config`                |

