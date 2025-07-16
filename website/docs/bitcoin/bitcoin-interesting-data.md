# 07 Interesting Bitcoin Data


```sql
SELECT block_number, COUNT(*) AS coinbase_output_count
FROM outputs
FINAL
WHERE toYYYYMM(block_timestamp) = 201212
  AND is_coinbase = true
GROUP BY block_number
HAVING coinbase_output_count > 2
ORDER BY coinbase_output_count DESC;
```

```sql
SELECT *
FROM outputs
FINAL
WHERE (block_number = 210477) AND (is_coinbase = true)
```

```sql
SELECT *
FROM transaction
WHERE hash = '66a6c6c707e76f831f8083501246bc9291234dbe2b0d47908800faad98f31e3b'
```

[66a6c6c707e76f831f8083501246bc9291234dbe2b0d47908800faad98f31e3b](https://mempool.space/tx/66a6c6c707e76f831f8083501246bc9291234dbe2b0d47908800faad98f31e3b)


## 2. Empty blocks

[00000000000004589c755e1e56819cb6a7163737f18f185cdad91a515cba96e7](https://mempool.space/block/00000000000004589c755e1e56819cb6a7163737f18f185cdad91a515cba96e7)


```sql
SELECT b.number AS missing_block_number
FROM blocks_fat AS b
LEFT ANTI JOIN (
    SELECT DISTINCT block_number
    FROM inputs
    WHERE toYYYYMM(block_timestamp) = 201212
) AS i
ON b.number = i.block_number
WHERE toYYYYMM(b.timestamp) = 201212
ORDER BY missing_block_number;
```

```sql
SELECT *
FROM blocks
WHERE number = 210319
```

## Revision

```sql
SELECT count()
FROM
(
    SELECT
        transaction_hash,
        input_index
    FROM inputs
    WHERE (toYYYYMM(block_timestamp) = 201212) AND (revision = 1)
    GROUP BY
        transaction_hash,
        input_index
    HAVING count() = 2
)
```

## What Partition spend by 201403 Partition

```sql
SELECT min(o_block_timestamp) AS latest_o_block_timestamp
FROM inputs_outputs
WHERE toYYYYMM(i_block_timestamp) = 201403
GROUP BY toYYYYMM(o_block_timestamp)
```
