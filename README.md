# Signal Automation Bot (whatsapp-opencode-bot)

Beantwortet deine Signal-Nachrichten („Notiz an mich") automatisch über ein LLM und verwaltet Termine im **echten Google Kalender** – inkl. Einladungen. Läuft dauerhaft auf einer Google-Cloud-VM (e2-micro).

Nachrichten kommen über [signal-cli](https://github.com/AsamK/signal-cli) rein (JSON-RPC), werden ggf. mit Konversationsverlauf an ein LLM (Gemini Direct-API oder opencode-CLI) geschickt und die Antwort wird zurückgeschickt. Der Bot antwortet wie ein Mensch: ohne Cooldown, ohne Zeitfenster, mit Gedächtnis pro Chat.

## Features

- Signal über `signal-cli 0.14.7 jsonRpc` (`--receive-mode on-connection`)
- Notiz-an-mich als Kommandokanal; eigene Bot-Echos werden gefiltert (`selfEchoKeys`)
- LLM-Gehirn: **Gemini Direct-API** (schnell) oder opencode-CLI als Fallback
- Konversationsgedächtnis (`src/memory.js`, letzte 20 Nachrichten im Prompt)
- Erinnerungen/Appointments (`data/appointments.json`), Scheduler per 30s-Tick
- **Google-Kalender-Action:** `cal_add` / `cal_list` / `cal_delete`
- **`#sync` in einer Nachricht:** legt den Termin an und lädt `SYNC_ATTENDEES` per Einladung ein (`sendUpdates=all`)
- Kein Cooldown/Zeitfenster mehr (`REPLY_WINDOW_ENABLED=false`), Persona-Regel: nie zugeben, dass er KI ist

## Voraussetzungen

- Node.js >= 20
- signal-cli 0.14.7 inkl. Java (auf Servern **Java 25** nötig – Class-Version 69; auf macOS gibt es ein natives Binary ohne Java)
- Google Cloud Project mit Google-Calendar-API + OAuth-Client (Desktop) für Einladungen

## Signal-Konto verbinden (einmalig)

```bash
brew install signal-cli   # macOS
# oder Server: https://github.com/AsamK/signal-cli#installation (Temurin/OpenJDK 25!)
```

```bash
signal-cli link -n "bot"        # QR-Code scannen (Empfehlung)
signal-cli register +4917...12345678   # Alternativ: direkte Registrierung + verify
```

Daten liegen unter `~/.local/share/signal-cli/` (wird auf den Server mitkopiert; Mac-Backup z. B. `~/.local/share/signal-cli-backup`).

## Einrichtung

```bash
npm install
cp .env.example .env
# .env anpassen: SIGNAL_ACCOUNT, AI_API_URL, AI_API_KEY, AI_MODEL, Persona, Kalender
npm start
```

## Google Kalender (OAuth / Service Account)

`src/calendar.js` unterstützt zwei Credential-Typen in `CALENDAR_CREDENTIALS` (`data/calendar-*.json`):

1. **Service-Account** (`service_account`): legt Termine an, aber **kann keine Einladungen senden** (403 `forbiddenForServiceAccounts`).
2. **Eigener OAuth-Client** (`authorized_user`, `{refresh_token, client_id, client_secret}`): agiert als dein User → erstellt Termine **und** lädt Gäste ein (`#sync`).

OAuth-Client einmalig in der Google Cloud Console anlegen (Typ „Desktop"), dein Konto als Testnutzer im Consent-Screen eintragen, dann:

```bash
node deploy/oauth-helper.js <CLIENT_ID> <CLIENT_SECRET> /tmp/calendar-oauth.json
# → Datei als /opt/signal-bot/data/calendar-oauth.json auf den Server kopieren
```

Der Token wird per `refresh_token`-Grant erneuert (kein Ablauf).

## Konfiguration (.env)

| Variable | Bedeutung |
|---|---|
| `SIGNAL_ACCOUNT` | Deine Signal-Nummer mit + (z. B. `+4917...`) |
| `SIGNAL_CLI_PATH` | Pfad zur signal-cli-Binary |
| `AI_API_URL` | Chat-Completions-Endpoint (Gemini-OpenAI-kompatibel o. Ä.) |
| `AI_API_KEY` | API-Key |
| `AI_MODEL` | Modellname (z. B. `gemini-3.6-flash`) |
| `AI_API_AUTH` | `azure` oder `bearer` |
| `OPENCODE_BINARY` | Pfad zur opencode-Binary (Fallback-Gehirn) |
| `PERSONA` | Instruktionen fürs LLM (Ton, Sprache, Kalender-/Action-Regeln) |
| `ALLOWED_NUMBERS` | Nur diese Nummern (ohne +); leer = alle |
| `IGNORE_GROUPS` | In Gruppen nicht antworten |
| `REPLY_WINDOW_ENABLED` | Zeitfenster-Filter an/aus (Default `false`) |
| `SCHEDULER_ENABLED` | Erinnerungs-Scheduler an/aus |
| `BRAIN_TIMEOUT_MS` | Timeout des LLM-Aufrufs (120000) |
| `CALENDAR_CREDENTIALS` | Pfad zum Kalender-Credential-JSON |
| `CALENDAR_ID` | Kalender-ID (z. B. deine Gmail-Adresse) |
| `CALENDAR_TIMEZONE` | Zeitzone (z. B. `Europe/Berlin`) |
| `CALENDAR_DURATION_MINUTES` | Standard-Dauer neuer Termine (60) |
| `SYNC_ATTENDEES` | Komma-getrennte E-Mails für `#sync`-Einladungen |

## Struktur

```
src/
├── index.js      # Start: Signal-Connection + Scheduler
├── signal.js     # SignalConn (jsonRpc über stdio), Note-to-Self, selfEchoKeys
├── handler.js    # Nachrichten-Filter, ACTION-Auswertung, #sync, Kalender-Actions
├── brain.js      # LLM-Aufruf (Gemini Direct-API oder opencode-CLI)
├── calendar.js   # Google-Calendar (JWT Service-Account + refresh_token OAuth)
├── memory.js     # Chat-Historie pro Chat
├── scheduler.js  # Erinnerungen: Persistenz, 30s-Tick
└── config.js     # liest .env
data/
├── appointments.json  # Erinnerungen (gitignored)
└── calendar-*.json    # Kalender-Credentials (gitignored)
deploy/
├── deploy.sh      # rsync → /opt/signal-bot (schließt .env aus!)
├── server-setup.sh
├── signal-bot.service
└── oauth-helper.js
```

## Dauerbetrieb (systemd, Google-Cloud-VM)

```bash
bash deploy/deploy.sh 34.118.206.71   # pusht Code, schützt .env, aktualisiert Service
sudo systemctl restart signal-bot
journalctl -u signal-bot -f
```

VM: `e2-micro`, Ubuntu 22.04, Node 22, Java 25 (Temurin `/opt/java/jre-25`), signal-cli 0.14.7 (`/opt/signal-cli`), 2GB Swap, `/tmp` auf 1777 (libsignal).

## Sicherheit & Grenzen

- Antworten erzeugt das LLM in der Cloud – Nachrichten verlassen dein Gerät.
- Nur Textnachrichten; Medien-Anhänge werden ignoriert. Kein Cooldown → vorsichtig mit Whois (`ALLOWED_NUMBERS`).
- Service Accounts können keine Attendee-Einladungen senden; dafür OAuth-Client (Desktop) als User verwenden.
- signal-cli ist kein offizielles Signal-Tool. Missbrauch/Spam kann zur Einschränkung deines Kontos führen – Nutzung auf eigene Gefahr.