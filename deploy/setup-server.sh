#!/usr/bin/env bash
# One-time setup for a fresh Hetzner Ubuntu 24.04 server.
# Run as root:  bash setup-server.sh
#
# What it does:
#   - installs security updates and turns on automatic security updates
#   - firewall: only SSH is open (the worker makes outgoing calls only)
#   - SSH: keys only, no passwords; fail2ban blocks repeated login attempts
#   - creates user "ayiko" (your SSH key works for it) and installs Docker
#   - creates a read-only GitHub deploy key so the server can pull the code
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

if [ "$(id -u)" -ne 0 ]; then echo "Run this as root."; exit 1; fi
if [ ! -s /root/.ssh/authorized_keys ]; then
  echo "No SSH key found for root. Add your key in the Hetzner console first, or you'd be locked out."; exit 1
fi

echo "==> Updating the system"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
apt-get -y -q install ca-certificates curl git ufw fail2ban unattended-upgrades docker.io docker-compose-v2

echo "==> Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Firewall (SSH only)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

echo "==> SSH: keys only"
cat > /etc/ssh/sshd_config.d/10-ayiko.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
systemctl reload ssh || systemctl reload sshd
systemctl enable --now fail2ban

echo "==> 2 GB swap (headroom for FFmpeg)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> User 'ayiko' with Docker access"
id ayiko >/dev/null 2>&1 || adduser --disabled-password --gecos "" ayiko
usermod -aG docker ayiko
install -d -m 700 -o ayiko -g ayiko /home/ayiko/.ssh
install -m 600 -o ayiko -g ayiko /root/.ssh/authorized_keys /home/ayiko/.ssh/authorized_keys
systemctl enable --now docker

echo "==> GitHub deploy key for the server"
if [ ! -f /home/ayiko/.ssh/github_deploy ]; then
  sudo -u ayiko ssh-keygen -t ed25519 -N "" -C "ayiko-server-deploy" -f /home/ayiko/.ssh/github_deploy >/dev/null
  sudo -u ayiko tee /home/ayiko/.ssh/config >/dev/null <<'CONF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
CONF
  chmod 600 /home/ayiko/.ssh/config
  sudo -u ayiko sh -c 'ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null'
fi

cat <<MSG

============================================================
 Server ready.

 Next: add this key to GitHub so the server can read the code:
   github.com/collinsayidan/ayiko-engine → Settings → Deploy keys
   → Add deploy key → title "hetzner", paste the line below,
   leave "Allow write access" OFF → Add key

$(cat /home/ayiko/.ssh/github_deploy.pub)

 Then log in as ayiko:   ssh ayiko@$(curl -s4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
 and follow step 2 in deploy/README.md
============================================================
MSG
