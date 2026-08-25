# whatsapp-opencode-bot

Beantwortet deine WhatsApp-Nachrichten automatisch – mit [opencode](https://opencode.ai) als "Gehirn". Nachrichten kommen über [Baileys](https://github.com/WhiskeySockets/Baileys) rein, werden an den opencode-CLI weitergegeben und die Antwort wird zurückgeschickt.

> Achtung: Nutzung über WhatsApp Web ist inoffiziell. Zu hohe Chatfrequenz kann zu (vorübergehenden) Einschränkungen deines Kontos führen. Am besten mit einer Zweitnummer testen.

## Voraussetzungen

- Node.js >= 20
- opencode CLI installiert (`opencode` muss in PATH sein)
- Ein WhatsApp-Account (zum Einscannen per QR)

## Einrichtung

```bash
npm install
cp .env.example .env
# .env anpassen (Persona, Zeitfenster, Whitelist)
npm start
```

Beim ersten Start erscheint ein QR-Code. Mit WhatsApp scannen:
Einstellungen > Verknüpfte Geräte > Gerät verknüpfen.

## Konfiguration (.env)

| Variable | Bedeutung |
|---|---|
| `PERSONA` | Instruktionen für opencode: Ton, Sprache, Länge der Antworten |
| `AUTO_REPLY_START` / `AUTO_REPLY_END` | Zeitfenster (HH:MM), in dem automatisch geantwortet wird |
| `ALLOWED_NUMBERS` | Nur diese Nummern (ohne +, z. B. `491712345678`); leer = alle |
| `REPLY_COOLDOWN_MINUTES` | Mindestabstand zwischen Auto-Antworten pro Chat |
| `IGNORE_GROUPS` | In Gruppen nicht antworten (true/false) |
| `OPENCODE_BINARY` | Pfad zum opencode-CLI, falls nicht in PATH |

## Struktur

```
src/
├── index.js    # Login, QR, Reconnect
├── handler.js  # Nachrichten-Filter & Antwortfluss
├── brain.js    # ruft `opencode run` auf
├── rules.js    # Zeitfenster, Whitelist, Cooldown
└── config.js   # liest .env
```

## Sicherheit & Grenzen

- Antworten erzeugt opencode in der Cloud – Nachrichten verlassen dein Gerät.
- Cooldown + Zeitfenster verhindern Endlosschleifen (z. B. wenn zwei Bots sich schreiben).
- Medien-Anhänge werden ignoriert; nur Textnachrichten werden beantwortet.
- Session-Daten liegen in `sessions/` (gitignored). Beim Löschen muss neu gescannt werden.

## Nützliche opencode-Kommandos

- `opencode run "..."` – nicht-interaktive Einzelausführung (wird vom Bot genutzt)
- `opencode` – interaktive Session für Tests
