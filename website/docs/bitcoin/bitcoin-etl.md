# Convert raw data with ETL

---

## 🔧 1. **Enable Pruned Mode** (to save disk space)

Pruned mode keeps only the latest blocks to save storage.

### Edit `bitcoin.conf`:

```bash
nano ~/.bitcoin/bitcoin.conf
```

Add or update:

```
prune=550  # Keep ~550 MB of recent blocks
```

> ✅ You cannot use `txindex=1` with pruning. If you want to save space, **remove** `txindex=1`.

---

## 📡 2. **Enable ZMQ** (for real-time block and transaction stream)

ZMQ allows real-time access to new transactions and blocks.

### In `bitcoin.conf`, add:

```ini
zmqpubrawblock=tcp://127.0.0.1:28333
zmqpubrawtx=tcp://127.0.0.1:28332
```

This tells `bitcoind` to publish:

* Raw blocks to port `28333`
* Raw transactions to port `28332`

You can subscribe using a Python library like `pyzmq` or `bitcoin-rpc`.

---

## 🔐 3. **Enable Remote RPC Access** (if needed)

If you want to connect to `bitcoind` remotely:

### Edit `bitcoin.conf`:

```ini
rpcbind=0.0.0.0
rpcallowip=192.168.1.0/24    # Replace with your LAN subnet
rpcport=8332
```

> ⚠️ **NEVER expose RPC to the internet without authentication and proper firewall rules.**

---

## 🧪 4. **Test Your Setup**

Run:

```bash
bitcoin-cli -rpcuser=bitcoinrpc -rpcpassword=strongpassword getblockchaininfo
```

If remote, add:

```bash
bitcoin-cli -rpcconnect=YOUR_NODE_IP -rpcport=8332 ...
```

---

## 📂 Bonus: Check ZMQ Events with Python (optional)

Install Python dependencies:

```bash
pip install pyzmq
```

Test listener:

```python
import zmq

context = zmq.Context()
socket = context.socket(zmq.SUB)
socket.connect("tcp://127.0.0.1:28332")  # or 28333 for blocks
socket.setsockopt_string(zmq.SUBSCRIBE, '')

while True:
    msg = socket.recv()
    print(f"Received: {msg.hex()}")
```

