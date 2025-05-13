To **verify that Bitcoin block and transaction data is complete in ClickHouse**, you need to ensure:

1. **No missing blocks**
2. **No missing transactions**
3. **No duplicate block heights**
4. **Transaction counts match block metadata**

---

### Step-by-step Verification Process

#### **1. Check block height continuity**

Run this to detect missing block numbers:

```sql
WITH seq AS (
    SELECT number
    FROM numbers(
        toUInt64(
            ifNull((SELECT max(number) FROM blocks), 0) + 1
        )
    )
)
SELECT seq.number AS missing_block_number
FROM seq
LEFT JOIN blocks AS b ON seq.number = b.number
WHERE b.number != seq.number

```

If this query returns rows, those block numbers are missing.

---

#### **2. Check for duplicate blocks**

Check for duplicate block numbers (heights):

```sql
SELECT number, count() AS cnt
FROM blocks
GROUP BY number
HAVING cnt > 1
```

You should see **zero rows** returned.

if the count of one block is bigger than 1, please use final command to deduplicate the same rows

```shell
OPTIMIZE TABLE blocks FINAL;
```
---

#### **3. Check transaction consistency per block**

If your `blocks` table has a `transaction_count` field, compare it to actual transaction counts:

```sql
SELECT
    b.number,
    b.hash,
    b.transaction_count AS expected_count,
    count(t.hash) AS actual_count
FROM blocks b
LEFT JOIN transactions t ON b.hash = t.block_hash
GROUP BY b.number, b.hash, b.transaction_count
HAVING expected_count != actual_count
```

This checks if the number of transactions recorded in each block matches what’s stored in the `transactions` table.

---

#### **4. Check for duplicate transactions**

```sql
SELECT hash, count() AS cnt
FROM transactions
GROUP BY hash
HAVING cnt > 1
```

Again, this should return no rows.

---

#### **5. Check block range coverage**

Ensure your data starts from the genesis block (height = 0):

```sql
SELECT min(number), max(number), count() FROM blocks
```

Expected:

* `min(number) = 0`
* `max(number)` equals the current block height in the full node
* `count()` equals `max - min + 1`

---

Would you like a script to automate these checks in one run?
