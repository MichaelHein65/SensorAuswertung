#!/usr/bin/env bash
set -euo pipefail

SRC_HOST="192.168.0.29"
SRC_FILE="/home/pi/Sensordaten.txt"
DST_FILE="/home/pi/SensorAuswertung/data/Sensordaten.txt"
TMP_FILE="${DST_FILE}.tmp"
LOCK_FILE="/tmp/sync_from_pizero.lock"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

scp -q -o ConnectTimeout=8 -o BatchMode=yes "pi@${SRC_HOST}:${SRC_FILE}" "$TMP_FILE"
mv "$TMP_FILE" "$DST_FILE"
