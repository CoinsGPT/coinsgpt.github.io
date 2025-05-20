
# 01 Bitcoin Fullnode Setup

![](/img/bitcoin/bitcoin_data_pipeline.png)

Here's a step-by-step guide to setting up a full Bitcoin node (bitcoind) on Ubuntu:

## Prerequisites

* **Operating System:** Ubuntu 22.04+ (64-bit recommended)
* **Disk space:** ≥ **1 T** (preferably SSD)
* **RAM:** At least **2 GB**
* **Internet connection:** No bandwidth limits; at least **50 GB/month**
* **Open port:** `8333` for inbound connections (optional but recommended)


## 1: Install Dependencies

Open your terminal and run:

```bash
sudo apt update
```

## 2: Download and Install bitcoind


1. **Go to** [https://bitcoincore.org/en/download/](https://bitcoincore.org/en/download/)

2. Copy the link for the Linux x86\_64 tar.gz file.

3. Run:

```bash
wget https://bitcoincore.org/bin/bitcoin-core-26.0/bitcoin-26.0-x86_64-linux-gnu.tar.gz
tar -xvf bitcoin-26.0-x86_64-linux-gnu.tar.gz
sudo install -m 0755 -o root -g root -t /usr/local/bin bitcoin-26.0/bin/*
```

## ️3: Configure Bitcoin Node

Create a config directory and a basic config file:

```bash
mkdir ~/.bitcoin
nano ~/.bitcoin/bitcoin.conf
```

Add this to `bitcoin.conf`:

```
server=1
txindex=1
rpcuser=bitcoinrpc
rpcpassword=strongpassword
rpcallowip=127.0.0.1
```

## 4: Run bitcoind

```bash
bitcoind -daemon
```

Check status:

```bash
bitcoin-cli getblockchaininfo
```

## Optional: Enable at Boot

To enable bitcoind to start on boot, create a systemd service:

```bash
sudo nano /etc/systemd/system/bitcoind.service
```

Paste:

```ini
[Unit]
Description=Bitcoin daemon
After=network.target

[Service]
ExecStart=/usr/local/bin/bitcoind -daemon -conf=/home/youruser/.bitcoin/bitcoin.conf -pid=/run/bitcoind/bitcoind.pid
ExecStop=/usr/local/bin/bitcoin-cli stop
User=youruser
Group=youruser
Type=forking
PIDFile=/run/bitcoind/bitcoind.pid
Restart=on-failure
RuntimeDirectory=bitcoind

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reexec
sudo systemctl enable bitcoind
sudo systemctl start bitcoind
```