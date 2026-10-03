# Camera Wall

A single static web page that shows live feeds from a [Frigate](https://frigate.video/) NVR in a 2×2 grid. It's built for always-on wall displays, tablets and phones. It has no build step, no dependencies and no backend: just three files served by any web server.

## Features

- 2×2 grid of live camera feeds, stacked vertically on narrow portrait screens
- Click a camera to enlarge it; click again (or press **Escape**) to go back to the grid
- Press **F** to toggle browser fullscreen
- Two stream modes:
  - `mse` (default): full-quality live video from go2rtc (port 1984)
  - `mjpeg`: lower-resolution MJPEG from Frigate's API (port 5000). Works in every browser and is lighter on old devices.
- Reloads itself every 6 hours to recover from stalled streams

## Files

| File                | Purpose                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| `cameras.html`      | The page: layout and styles                                                      |
| `cameras.js`        | Builds the grid and handles clicks and keys                                      |
| `config.example.js` | Template for your local settings                                                 |
| `config.js`         | Your Frigate host and camera names. Gitignored; you create it from the template. |

## Requirements

- A running Frigate instance on your LAN
- For `mse` mode: go2rtc's API on port **1984** reachable from the viewing device. In a Docker install of Frigate, that means publishing port 1984 in your compose file.
- For `mjpeg` mode: Frigate's API on port **5000** reachable from the viewing device
- Camera names in `config.js` that match your go2rtc stream names (and your Frigate camera names, for `mjpeg` mode)

## Configuration

1. Copy the template:

   ```sh
   cp config.example.js config.js
   ```

2. Edit `config.js`:

   ```js
   const FRIGATE_HOST = "192.168.1.50"; // IP or hostname of Frigate
   const CAMERAS = ["front_door", "driveway", "backyard", "garage"];
   ```

   The grid is laid out for four cameras.

3. Optionally, change `DEFAULT_MODE` in `cameras.js` to `"mjpeg"`. You can also pick the mode per visit with a URL parameter:

   ```
   http://<host>/cameras.html?mode=mjpeg
   ```

To try it locally, open `cameras.html` directly in a browser.

## Hosting on a Proxmox LXC with Caddy

These steps create a small Debian 13 container on Proxmox, install [Caddy](https://caddyserver.com/), and serve the page over plain HTTP on your LAN.

> **Why HTTP and not HTTPS?** The page loads streams from Frigate over `http://`. If the page itself is served over `https://`, browsers block those streams as mixed content. Keep this on your LAN, and don't expose it to the internet (see [Security](#security)).

### 1. Create the container

Run these commands in a shell on the Proxmox host.

The container runs Debian 13 (trixie). Use Proxmox VE 9 or later: older Proxmox releases may refuse to create a Debian 13 container.

Download the Debian 13 template:

```sh
pveam update
pveam available --section system | grep debian-13
pveam download local <debian-13-template-name>      # e.g. debian-13-standard_13.1-2_amd64.tar.zst
```

Use the exact template name that `pveam available` lists, since the version suffix changes with each release.

Create and start the container. Change the ID (`120`), storage (`local-lvm`) and bridge (`vmbr0`) to fit your setup:

```sh
pct create 120 local:vztmpl/<debian-13-template-name> \
  --hostname cameras \
  --unprivileged 1 \
  --features nesting=1 \
  --cores 1 --memory 256 --swap 256 \
  --rootfs local-lvm:2 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --ssh-public-keys /path/to/your_key.pub \
  --onboot 1

pct start 120
```

`--ssh-public-keys` installs a public key for the container's `root` user, so you can copy files in with `scp` later. The path is a file **on the Proxmox host**, and it must hold the public key of the workstation you'll copy from (for example, that machine's `~/.ssh/id_ed25519.pub` or `id_rsa.pub`, copied to the host). You can leave this option out and add the key afterwards (see [Add your SSH key](#add-your-ssh-key)).

To use a static address instead of DHCP, set `ip=192.168.1.60/24,gw=192.168.1.1` in `--net0`, or add a DHCP reservation on your router. Either way, the address should stay the same so your displays can bookmark it. Pick an address that no other device uses. A device with a static IP inside your router's DHCP range can end up sharing the container's address, and connections then reach the wrong device.

Find the container's IP address:

```sh
pct exec 120 -- ip -4 addr show eth0
```

#### Add your SSH key

The container's `root` user has no password, and Debian's SSH server doesn't allow password logins for root anyway. If `scp` asks for root's password, the container doesn't have your workstation's key yet.

To add it, print your public key on the workstation and copy the line it shows:

```sh
cat ~/.ssh/id_ed25519.pub                       # macOS / Linux (or id_rsa.pub)
type $env:USERPROFILE\.ssh\id_ed25519.pub       # Windows PowerShell (or id_rsa.pub)
```

If you don't have a key yet, create one with `ssh-keygen -t ed25519`.

Then open a shell in the container, from the Proxmox host with `pct enter 120` or from **Console** in the Proxmox web interface, and add the key:

```sh
mkdir -p /root/.ssh && chmod 700 /root/.ssh
echo "<paste your public key here>" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

If you can already SSH into the Proxmox host from your workstation, you can do it in one step instead:

```sh
cat ~/.ssh/id_ed25519.pub | ssh root@<proxmox-host> "pct exec 120 -- sh -c 'mkdir -p /root/.ssh && cat >> /root/.ssh/authorized_keys && chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys'"
```

On Windows PowerShell, start that command with `type $env:USERPROFILE\.ssh\id_ed25519.pub` instead of `cat ~/.ssh/id_ed25519.pub`.

### 2. Install Caddy

Open a shell inside the container:

```sh
pct enter 120
```

Install Caddy from the Debian repositories:

```sh
apt update
apt install -y caddy
```

For the newest release, you can use Caddy's own apt repository instead. See the [Caddy install docs](https://caddyserver.com/docs/install#debian-ubuntu-raspbian).

```sh
apt install --yes debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
chmod o+r /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy
```

Create the web root:

```sh
mkdir -p /var/www/cameras
```

### 3. Configure Caddy

Replace `/etc/caddy/Caddyfile` with:

```caddyfile
:80 {
	root * /var/www/cameras

	# Serve the camera wall at the site root
	rewrite / /cameras.html

	# Make sure displays pick up config changes without a hard refresh
	header Cache-Control "no-cache"

	file_server
}
```

Check the config, then reload Caddy:

```sh
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

### 4. Copy the files

On your workstation, from this project folder, copy the page files to the container. `scp` is included with Windows 10 and later, macOS and Linux:

```sh
scp cameras.html cameras.js config.js root@<container-ip>:/var/www/cameras/
```

`config.js` is gitignored, so make sure you've created it first (see [Configuration](#configuration)).

Then, inside the container, make sure Caddy can read the files:

```sh
chmod -R a+rX /var/www/cameras
```

If `scp` asks for a password, add your key first (see [Add your SSH key](#add-your-ssh-key)). Or, to skip SSH entirely, stage the files on the Proxmox host instead and push them in with `pct push`:

```sh
pct push 120 cameras.html /var/www/cameras/cameras.html
pct push 120 cameras.js   /var/www/cameras/cameras.js
pct push 120 config.js    /var/www/cameras/config.js
```

### 5. Open it

Browse to:

```
http://<container-ip>/
```

### Updating

Copy the changed files again with `scp` or `pct push`. Caddy serves them straight from disk, so you don't need to restart it. Thanks to the `no-cache` header, displays pick up the changes on their next reload (or within 6 hours, through the automatic reload).

## Security

The page itself has no login, and go2rtc (port 1984) and Frigate's port 5000 API don't require authentication either. Anyone who can reach these ports can watch your cameras. Keep everything on your LAN or a VPN (such as WireGuard or Tailscale), and don't forward these ports on your router.
