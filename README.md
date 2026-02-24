# SensorAuswertung

Moderne, responsive HTML-App zur Auswertung von Sensordaten (Temperatur, Luftfeuchte, Luftdruck).

Die App laeuft auf dem Pi5 und liest Daten aus:

- `data/Sensordaten.txt`

Produktiv wird diese Datei per Sync vom PiZero aktualisiert.

## Features

- Zeitraeume: `Tag`, `Woche`, `Monat`, `Jahr`
- Freier Zeitraum per Date-Range-Picker
- KPI-Karten (letzter Wert, Mittel, Min, Max)
- Interaktive Zeitreihe mit Zoom + Tooltip
- Automatisches Nachladen der Daten alle 30 Sekunden (ohne manuellen Seiten-Reload)
- Sichtbarkeit einzelner Werte umschaltbar (Temperatur/Feuchte/Druck)
- Dynamische Y-Achsen-Zuordnung (rechte Achse passt sich sichtbaren Werten an)
- Einstellbare Y-Achsenbereiche mit Browser-Persistenz (`localStorage`)

## Projektstruktur

- `index.html` - App-Struktur und Controls
- `styles.css` - Design, Responsive Layout, Animationen
- `app.js` - Datenlogik, Aggregation, Charting, Interaktion
- `data/Sensordaten.txt` - Datenquelle fuer die Web-App
- `scripts/sync_from_pizero.sh` - Sync PiZero -> Pi5
- `scripts/sync_data.sh` - lokales Sync-Skript (von Mac aus)
- `docs/BETRIEB.md` - Betrieb, Deployment, Troubleshooting

## Schnellstart (lokal)

```bash
python3 -m http.server 8080
```

Dann im Browser:

- `http://localhost:8080`

Hinweis:

- Die App muss ueber HTTP laufen (nicht per `file://`).
- Bei Layout-/Datenproblemen: Hard-Reload im Browser ausfuehren.

## Betrieb auf Pi5

Die App laeuft auf dem Pi5 unter:

- `http://100.104.66.88:8080`
- `http://pi5-node.tailc0dc7c.ts.net:8080`

Details fuer Service/Sync/Betrieb: siehe `docs/BETRIEB.md`.

## Technologie

- [Apache ECharts](https://echarts.apache.org/) fuer Diagramme
- [Luxon](https://moment.github.io/luxon/) fuer Datums-/Zeithandling
- [Flatpickr](https://flatpickr.js.org/) fuer Zeitraumauswahl
