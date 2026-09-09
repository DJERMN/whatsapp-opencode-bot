#!/usr/bin/env bash
set -euo pipefail

# Von der lokalen Maschine aus: Pusht den Bot auf den Server und startet ihn neu.
# Aufruf:  bash deploy/deploy.sh <SERVER_IP>
# Voraussetzung: Server-Setup (server-setup.sh) ist gelaufen, .env auf dem Server ist angelegt.

if [ "$#" -ne 1 ]; then
  echo "Benutzung: bash deploy/deploy.sh <SERVER_IP>"
  exit 1
fi

SERVER="$1"
SSH_USER="${SSH_USER:-$USER}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Source nach /opt/signal-bot pushen (.env wird NICHT ueberschrieben)"
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude data \
  --exclude deploy \
  --exclude .env \
  -e ssh "${PROJECT_DIR}/" "${SSH_USER}@${SERVER}:/opt/signal-bot/"

echo "==> npm install auf Server"
ssh "${SSH_USER}@${SERVER}" "cd /opt/signal-bot && npm install --omit=dev"

echo "==> systemd-Service installieren/aktualisieren"
ssh "${SSH_USER}@${SERVER}" "mkdir -p /opt/signal-bot && chown ${SSH_USER}:\${SSH_USER} /opt/signal-bot"

scp "${PROJECT_DIR}/deploy/signal-bot.service" "${SSH_USER}@${SERVER}:/etc/systemd/system/signal-bot.service"
ssh "${SSH_USER}@${SERVER}" "sudo systemctl daemon-reload && sudo systemctl enable --now signal-bot && sleep 3 && systemctl --no-pager status signal-bot | head -12"

echo "Fertig. Logs: ssh ${SSH_USER}@${SERVER} 'journalctl -u signal-bot -f'"