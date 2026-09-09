import 'dotenv/config'

const str = (key, fallback = '') => process.env[key] ?? fallback
const num = (key, fallback) => {
  const n = Number(process.env[key])
  return Number.isFinite(n) ? n : fallback
}

export const config = {
  persona: str('PERSONA'),
  replyWindow: {
    enabled: str('REPLY_WINDOW_ENABLED', 'false').toLowerCase() === 'true',
    start: str('AUTO_REPLY_START', '08:00'),
    end: str('AUTO_REPLY_END', '22:00'),
  },
  allowedNumbers: str('ALLOWED_NUMBERS').split(',').map((s) => s.trim().replace(/[^0-9]/g, '')).filter(Boolean),
  replyCooldownMinutes: num('REPLY_COOLDOWN_MINUTES', 10),
  ignoreGroups: str('IGNORE_GROUPS', 'true').toLowerCase() === 'true',
  brainTimeoutMs: num('BRAIN_TIMEOUT_MS', 120_000),
  aiApiUrl: str('AI_API_URL'),
  aiApiKey: str('AI_API_KEY'),
  aiModel: str('AI_MODEL', 'deepseek-v4-flash'),
  aiAuth: str('AI_API_AUTH', 'azure').toLowerCase(),
  schedulerEnabled: str('SCHEDULER_ENABLED', 'true').toLowerCase() === 'true',
  signalAccount: str('SIGNAL_ACCOUNT').replace(/[^0-9+]/g, ''),
  signalCliPath: str('SIGNAL_CLI_PATH', 'signal-cli'),
  opencodeBinary: str('OPENCODE_BINARY', 'opencode'),
  calendarCredentialsPath: str('CALENDAR_CREDENTIALS', 'data/calendar-service-account.json'),
  calendarId: str('CALENDAR_ID', 'primary'),
  calendarTimezone: str('CALENDAR_TIMEZONE', 'Europe/Berlin'),
  calendarDurationMinutes: num('CALENDAR_DURATION_MINUTES', 60),
  syncAttendees: str('SYNC_ATTENDEES', '')
    .split(',').map((s) => s.trim()).filter(Boolean),
}
