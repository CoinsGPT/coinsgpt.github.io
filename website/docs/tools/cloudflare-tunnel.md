
# Cloudflare Tunnel

Great — if you **already have a domain name on Cloudflare**, the **best option** is to use **Cloudflare Tunnel (formerly Argo Tunnel)**. It lets you:

* Expose your local server to the internet **without a static IP**
* Use your own **custom domain**
* Avoid **port forwarding**
* Get **free HTTPS certificates** automatically


##  Step 1: Install `cloudflared`

On your server:

```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
```

```bash
sudo dpkg -i cloudflared-linux-amd64.deb
```

## Step 2: Authenticate Cloudflare

```bash
cloudflared tunnel login
```

This will open a browser to log in and pick your Cloudflare domain.


## Step 3: Create the Tunnel

```bash
cloudflared tunnel create openwebUI
```

This creates a named tunnel and gives you a tunnel ID and credentials file.


## Step 4: Create a Config File

Default location: `~/.cloudflared/config.yml`

```yaml
tunnel: openwebUI
credentials-file: ~/.cloudflared/51049f68-692e-4e7c-a22c-5c7e4f202391.json

ingress:
  - hostname: openwebui.coinsgpt.io
    service: http://localhost:3000
  - service: http_status:404
```

Replace:

* `yoursub.yourdomain.com` → a subdomain you want to expose
* `localhost:3000` → your actual local server address

## ️ Step 5: Set up DNS Route

```bash
cloudflared tunnel route dns openwebUI openwebui.coinsgpt.io
```

This automatically adds a CNAME record in your Cloudflare DNS pointing to the tunnel.


## Step 6: Run the Tunnel

```bash
cloudflared tunnel run openwebUI
```

Now your app is live at:

```
https://openwebui.coinsgpt.io
```

## Summary

| Feature           | Cloudflare Tunnel       |
| ----------------- | ----------------------- |
| Static IP needed? | ❌ No                    |
| Uses your domain? | ✅ Yes                   |
| HTTPS?            | ✅ Automatic             |
| Port Forwarding?  | ❌ Not required          |
| Free?             | ✅ Yes (generous limits) |

---

## Bug Fixing

If **`cloudflared` cannot resolve Cloudflare's edge SRV records** due to a **DNS issue** on your server. The resolver `127.0.0.53` (systemd-resolved) is failing to look up `_v2-origintunneld._tcp.argotunnel.com`.



**1. Test DNS resolution**

Run:

```bash
dig srv _v2-origintunneld._tcp.argotunnel.com @1.1.1.1
```

If this works, your local DNS (`127.0.0.53`) is broken or blocked.

**2. Use Cloudflare's DNS (1.1.1.1 & 1.0.0.1)**

Edit `/etc/resolv.conf`, add following DNS server:

```
nameserver 1.1.1.1
nameserver 8.8.8.1
```

> **Tip:** On Ubuntu 22.04, `systemd-resolved` may overwrite `/etc/resolv.conf`. To permanently set DNS:

```bash
sudo systemctl disable systemd-resolved
sudo systemctl stop systemd-resolved
sudo rm /etc/resolv.conf
echo -e "nameserver 1.1.1.1\nnameserver 8.8.8.8" | sudo tee /etc/resolv.conf
```

**3. Retry the tunnel**

```bash
cloudflared tunnel run openwebUI
```


**4. Add `config.yml` (Important!)**

```
WRN No ingress rules were defined...
```

You must create `~/.cloudflared/config.yml`:
