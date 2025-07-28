# 08 JanusGraph Schema for Bitcoin


## Bitcoin Graph Relationship Table

:::info
`Output → Transaction → Output`
instead of the traditional
`Input → Transaction → Output`
:::

This means **removing explicit `Input` vertices** and instead modeling **value flow directly through outputs and transactions**. In this model:

* An **Output** is **spent in** a Transaction (i.e., it's an input to that transaction).
* That Transaction **generates new Outputs**.
* So the value flow is: **Output (spent) → Transaction (that spends it) → Output (created)**

This keeps the graph minimal and UTXO-centric — ideal for path analysis and visual tracing. Refined Bitcoin Graph Relationship Table (No Input Node)

| From → To                  | **Relationship** | **Explanation**                                                                  |
| -------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| **Output → Transaction**   | `spent_in`       | The output (used as input) is **spent in** a transaction.                  |
| **Transaction → Output**   | `lock_to`        | The transaction **locks value to** newly created outputs.                        |
| **Output → Address**       | `pay_to`         | The output **pays to** an address; value is locked to a public key script.       |
| **Block → Coinbase Tx**    | `coinbase`       | The block includes the **coinbase transaction**, which generates mining rewards. |
| **Transaction → Block**    | `included_in`    | The transaction **included in** a block;                                         |
| **Block → Previous Block** | `chain_to`       | The block **chains to** its previous block via `prev_block_hash`.                |


Evaluation of This Model:

✅ Strengths

* **Simplified graph**: Fewer vertex types (no `Input` nodes), easier to query and visualize.
* **Direct value flow**: You can trace a satoshi's path from output → tx → output, etc.
* **Efficient for UTXO tracing**, coin flow, taint analysis, etc.

⚠️ Tradeoffs

* **Loss of input metadata**: You won’t easily store:

  * input scriptSig / witness
  * input index
  * sequence
  * exact link to the **input index** of the transaction
* **Cannot distinguish input order directly** unless it's added as an edge property (`spent_in` with `input_index`).

🔧 Recommendations

If you choose this model:

| Design Element          | Recommendation                                                     |
| ----------------------- | ------------------------------------------------------------------ |
| `spent_in` edge         | Add properties like `input_index`, `sequence`, `scriptSig`, etc.   |
| `lock_to` edge          | Add `output_index`, `value`, `scriptPubKey`, etc. as properties.   |
| Avoid `Input` node      | Simplifies model. Just make sure metadata is preserved on edges. |
| Graph traversal queries | Will be simpler for “value flow” and “who paid whom” chains.       |


## Traversal Example

🔁 Value Flow Pattern in This Model

```
(Output_A) ──[spent_in]──▶ (TX1) ──[lock_to]──▶ (Output_B)
```

Which translates as:

> Output A was spent in TX1, which created Output B.


Here’s a **Gremlin traversal example** that traces the path from **Address A** to **Address B** — in your graph model where the spending relationship is:

> `Address → Output → Transaction → Output → Address`

This represents the flow:

```
(Address A)
   ↑ pay_to
(Output A)
   ─[spent_in]→ (Transaction)
   ─[lock_to]→ (Output B)
   ↓ pay_to
(Address B)
```

---

✅ Gremlin Traversal: Address A → ... → Address B

```gremlin
g.V().has('address', 'A')                  // Start at Address A
  .in('pay_to')                            // Go to Output(s) it received funds to
  .out('spent_in')                         // Follow to the Transaction that spent this Output
  .out('lock_to')                          // Follow to Outputs created by that Transaction
  .out('pay_to')                           // Follow to the Addresses those Outputs pay to
  .has('address', 'B')                     // Check if any of them are Address B
  .path()                                  // Return the full path if exists
```

---

🔍 Optional Enhancements: To trace **multi-hop paths** (A → ... → B over many txs):

```gremlin
g.V().has('address', 'A')
  .repeat(
     __.in('pay_to')
       .out('spent_in')
       .out('lock_to')
       .out('pay_to')
  )
  .until(has('address', 'B'))
  .path()
```

* `repeat(...).until(...)` enables **transitive closure** — tracing chains of transactions.
* This will trace from A to B even across many intermediate addresses and transactions.

🧠 Tips

* Be sure that your **edges have correct directionality**:

  * `pay_to`: from **Output → Address**
  * `lock_to`: from **Transaction → Output**
  * `spent_in`: from **Output → Transaction**

* To include edge metadata like `value`, `output_index`, etc., use `.by(valueMap())` on `.path()` or `project()`.


## JanusGraph Schema

Here's a **JanusGraph schema** that matches your **Refined Bitcoin Graph Relationship Table (No Input Node)** — capturing the flow from `Output → Transaction → Output`, and modeling key Bitcoin concepts like UTXOs, blocks, addresses, and coinbase transactions.


### Vertex Labels

```groovy
mgmt = graph.openManagement()

// Vertex labels
mgmt.makeVertexLabel('address').make()
mgmt.makeVertexLabel('output').make()
mgmt.makeVertexLabel('transaction').make()
mgmt.makeVertexLabel('block').make()
```


### Edge Labels

```groovy
// Edge labels (directional, multiple allowed)
mgmt.makeEdgeLabel('pay_to').multiplicity(MULTI).make()        // output → address
mgmt.makeEdgeLabel('spent_in').multiplicity(MULTI).make()      // output → transaction
mgmt.makeEdgeLabel('lock_to').multiplicity(MULTI).make()       // transaction → output
mgmt.makeEdgeLabel('coinbase').multiplicity(MULTI).make()      // block → coinbase transaction
mgmt.makeEdgeLabel('belongs_to').multiplicity(MULTI).make()    // transaction → block
mgmt.makeEdgeLabel('chain_to').multiplicity(ONE2ONE).make()    // block → previous block
```


### Properties for Vertices

```groovy
// Common ID-like keys
addressKey    = mgmt.makePropertyKey('address').dataType(String.class).make()
txidKey       = mgmt.makePropertyKey('txid').dataType(String.class).make()
outputIndex   = mgmt.makePropertyKey('output_index').dataType(Integer.class).make()
value         = mgmt.makePropertyKey('value').dataType(Double.class).make()
scriptPubKey  = mgmt.makePropertyKey('script_pub_key').dataType(String.class).make()
blockHash     = mgmt.makePropertyKey('block_hash').dataType(String.class).make()
blockHeight   = mgmt.makePropertyKey('block_height').dataType(Long.class).make()
timestamp     = mgmt.makePropertyKey('timestamp').dataType(Long.class).make()

// Assign keys to vertex labels (optional, for indexing)
mgmt.addProperties(mgmt.getVertexLabel("address"), addressKey)
mgmt.addProperties(mgmt.getVertexLabel("transaction"), txidKey, timestamp)
mgmt.addProperties(mgmt.getVertexLabel("output"), value, outputIndex, scriptPubKey)
mgmt.addProperties(mgmt.getVertexLabel("block"), blockHash, blockHeight, timestamp)
```


### Indexes (for efficient traversal)

```groovy
// Vertex-centric index
mgmt.buildIndex('byAddress', Vertex.class).addKey(addressKey).buildCompositeIndex()
mgmt.buildIndex('byTxid', Vertex.class).addKey(txidKey).buildCompositeIndex()
mgmt.buildIndex('byBlockHash', Vertex.class).addKey(blockHash).buildCompositeIndex()
```


🧠 Notes

| Entity        | Properties You May Add                                 |
| ------------- | ------------------------------------------------------ |
| `output`      | `output_index`, `value`, `scriptPubKey`, `is_spent`    |
| `transaction` | `txid`, `timestamp`, `fee`, `size`, `version`          |
| `block`       | `block_hash`, `block_height`, `timestamp`, `nonce`     |
| `address`     | `address` (String), maybe `type` (P2PKH, P2WPKH, etc.) |


## ✅ Sample Relationship Summary

| From → To              | Label        |
| ---------------------- | ------------ |
| output → address       | `pay_to`     |
| output → transaction   | `spent_in`   |
| transaction → output   | `lock_to`    |
| block → transaction    | `coinbase`   |
| transaction → block    | `belongs_to` |
| block → previous block | `chain_to`   |