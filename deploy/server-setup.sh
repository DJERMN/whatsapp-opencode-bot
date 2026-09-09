#!/usr/bin/env bash
set -euo pipefail

# Einmalig auf dem frischen Ubuntu-VM ausfuehren (als Nutzer mit sudo)
# Ruft man so: sudo bash /opt/signal-bot-deploy/server-setup.sh

echo "==> 2GB Swap anlegen (e2-micro hat nur 1GB RAM)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap aktiviert: $(free -h | awk '/Swap/{print $2}')"
else
  echo "Swap existiert bereits"
fi

echo "==> System-Pakete"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y openjdk-21-jre-headless curl git

echo "==> Node.js 22 (LTS)"
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node --version

echo "==> signal-cli (0.14.x) nach /opt/signal-cli"
if [ ! -d /opt/signal-cli ]; then
  SIGNAL_VERSION=0.14.7
  cd /tmp
  curl -fsSLo signal-cli.tar.gz "https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_VERSION}/signal-cli-${SIGNAL_VERSION}.tar.gz"
  tar -xzf signal-cli.tar.gz
  mv "signal-cli-${SIGNAL_VERSION}" /opt/signal-cli
  ln -sf /opt/signal-cli/bin/signal-cli /usr/local/bin/signal-cli
  rm signal-cli.tar.gz
fi
signal-cli --version

echo "==> Bot-Verzeichnis"
mkdir -p /opt/signal-bot /opt/signal-bot-deploy
chown -R "$USER":"$USER" /opt/signal-bot 2>/dev/null || true

echo "Fertig. Naechster Schritt: Bots-Source nach /opt/signal-bot kopieren und .env anlegen."