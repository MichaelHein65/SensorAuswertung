#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_FILE="$ROOT_DIR/data/Sensordaten.txt"

scp pizero:/home/pi/Sensordaten.txt "$TARGET_FILE"
LINES=$(wc -l < "$TARGET_FILE" | tr -d ' ')
LAST=$(tail -n 1 "$TARGET_FILE")

echo "Sync erfolgreich: $TARGET_FILE"
echo "Zeilen: $LINES"
echo "Letzter Datensatz: $LAST"
