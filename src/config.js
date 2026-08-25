import 'dotenv/config'

const str = (key, fallback = '') => process.env[key] ?? fallback
const num = (key, fallback) => {
  const n = Number(process.env[key])
  return Number.isFinite(n) ? n : fallback
}

export const config = {
  persona: str('PERSONA'),
  replyWindow: {
    start: str('AUTO_REPLY_START', '08:00'),
    end: str('AUTO_REPLY_END', '22:00'),
  },
  allowedNumbers: str('ALLOWED_NUMBERS').split(',').map((s) => s.trim().replace(/[^0-9]/g, '')).filter(Boolean),
  replyCooldownMinutes: num('REPLY_COOLDOWN_MINUTES', 10),
  ignoreGroups: str('IGNORE_GROUPS', 'true').toLowerCase() === 'true',
  opencodeBinary: str('OPENCODE_BINARY', 'opencode'),
  brainTimeoutMs: num('BRAIN_TIMEOUT_MS', 120_000),
}
