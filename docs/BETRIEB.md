# Betrieb und Deployment

## 1) Aktuelle Architektur

- PiZero schreibt kontinuierlich nach `/home/pi/Sensordaten.txt`
- Pi5 hostet die Web-App in `/home/pi/SensorAuswertung`
- Web-App liest `/home/pi/SensorAuswertung/data/Sensordaten.txt`
- Sync-Skript auf Pi5 zieht die Datei regelmaessig vom PiZero

Datenfluss:

`PiZero:/home/pi/Sensordaten.txt -> Pi5:/home/pi/SensorAuswertung/data/Sensordaten.txt -> Browser`

## 2) Webserver auf Pi5

Start (manuell):

```bash
cd /home/pi/SensorAuswertung
nohup python3 -m http.server 8080 --bind 0.0.0.0 >/tmp/sensorauswertung_http.log 2>&1 &
```

Pruefen:

```bash
pgrep -af "python3 -m http.server 8080"
```

Stoppen:

```bash
pkill -f "python3 -m http.server 8080"
```

## 3) Sync PiZero -> Pi5

Skript auf Pi5:

- `/home/pi/SensorAuswertung/scripts/sync_from_pizero.sh`

Inhalt (Kurzfassung):

- zieht `pi@192.168.0.29:/home/pi/Sensordaten.txt`
- schreibt atomar nach `/home/pi/SensorAuswertung/data/Sensordaten.txt`
- nutzt Lock-Datei gegen parallele Ausfuehrung

Cronjob auf Pi5:

```cron
* * * * * /home/pi/SensorAuswertung/scripts/sync_from_pizero.sh >> /tmp/sync_from_pizero.log 2>&1
```

Pruefen:

```bash
crontab -l | grep sync_from_pizero
```

## 4) Wichtige Betriebschecks

Datei aktuell?

```bash
tail -n 3 /home/pi/SensorAuswertung/data/Sensordaten.txt
```

Vergleich PiZero vs Pi5:

```bash
ssh pizero 'tail -n 3 /home/pi/Sensordaten.txt'
ssh pi@100.104.66.88 'tail -n 3 /home/pi/SensorAuswertung/data/Sensordaten.txt'
```

HTTP erreichbar?

```bash
curl -I http://100.104.66.88:8080
```

## 5) Update-Workflow

Auf Entwicklungsrechner:

```bash
scp index.html styles.css app.js pi@100.104.66.88:/home/pi/SensorAuswertung/
```

Optional danach Browser-Hard-Reload ausfuehren (Cache leeren).

## 6) Troubleshooting

"Keine Daten im gewaehlten Zeitraum":

- `data/Sensordaten.txt` vorhanden?
- hat Datei neue Zeilen?
- passt ausgewaehlter Zeitraum?

Sync laeuft nicht:

- `crontab -l` pruefen
- `/tmp/sync_from_pizero.log` pruefen
- SSH von Pi5 auf PiZero testen:

```bash
ssh pi@192.168.0.29 'echo ok'
```

Webserver down:

- Prozess neu starten (Abschnitt 2)
- Logdatei `/tmp/sensorauswertung_http.log` pruefen
