# Sonic Canvas

Musik wird Gemälde. Statische Browser-App: Datei hochladen, Gemälde erhalten.

Dieselbe Audiodatei erzeugt stets dasselbe Bild. Eine kleine Änderung in Melodie, Dynamik oder Klangfarbe verschiebt Farben, Dichte und Form — die Stimmung bleibt lesbar.

## Nutzung

1. Audio ablegen oder wählen (MP3, WAV, OGG, M4A, bis 25 MB).
2. Analyse läuft lokal: SHA-256-Signatur, Spektrum, Energie, Hüllkurve.
3. Palette und Strömungsfeld folgen den Maßen. Das Gemälde kann als PNG gespeichert werden.

Ohne eigene Datei: Demo-Stimmungen Metal, Pop, Ambient, Jazz.

## Technik

Kein Build, kein Server. Web Audio API + Canvas 2D.

| Datei | Aufgabe |
| --- | --- |
| `index.html` | Oberfläche |
| `styles.css` | Atelier-Optik |
| `rng.js` | SHA-256, PRNG, Noise |
| `analyze.js` | Merkmale und Demo-Klänge |
| `paint.js` | deterministischer Maler |
| `app.js` | Upload, Demos, Download |

Analyse der ersten drei Minuten. Form (Wirbel, Welle, Band, Zwillingsfeld, Blüte) kommt aus den Merkmalen plus Hash.

## Lokal

```bash
python3 -m http.server 4173
```

Dann `http://localhost:4173` öffnen.
