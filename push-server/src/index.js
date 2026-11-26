import { createVapidAuthHeader, encryptWebPushPayload, sendWebPush } from './webpush.js';

const SUBSCRIPTION_PREFIX = 'sub:';
const SUB_INDEX_KEY = 'meta:sub_index';
const SUBSCRIPTION_TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_TEST_DELAY_SECONDS = 25;
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 480;
const DEFAULT_START_TIME = '07:00';
const DEFAULT_END_TIME = '22:00';
const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_DAILY_GOAL = 2000;
const DEFAULT_TZ_OFFSET_MINUTES = -420;
const DEFAULT_ICON_PATH = '/img/icon-192.png';
const CRON_BATCH_SIZE = 5;
const REMINDER_PUSH_TTL_SECONDS = 3600;
const recentIsolateSentSlots = new Map();

function getCorsHeaders(request, env) {
  const configured = String(env.ALLOWED_ORIGIN || '*').trim();
  const requestOrigin = request.headers.get('Origin') || '';
  let allowOrigin = '*';
  let varyOrigin = false;

  if (configured !== '*') {
    const allowedList = configured
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (allowedList.length > 0) {
      varyOrigin = true;
      allowOrigin = allowedList.includes(requestOrigin) ? requestOrigin : allowedList[0];
    }
  }

  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };

  if (varyOrigin) {
    headers['Vary'] = 'Origin';
  }

  return headers;
}

function jsonResponse(payload, status, corsHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders
    }
  });
}

async function readJsonBody(request) {
  try {
    const data = await request.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'Payload harus berupa objek JSON.' };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Body JSON tidak valid.' };
  }
}

export async function endpointKey(endpoint) {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(String(endpoint))
  );
  const hashBytes = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < hashBytes.length; i += 1) {
    hex += hashBytes[i].toString(16).padStart(2, '0');
  }
  return `${SUBSCRIPTION_PREFIX}${hex}`;
}

function validateEndpoint(endpoint) {
  if (typeof endpoint !== 'string') return null;
  const trimmed = endpoint.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function validateSubscription(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Objek subscription wajib disertakan.' };
  }

  const endpoint = validateEndpoint(raw.endpoint);
  if (!endpoint) {
    return { ok: false, error: 'Endpoint subscription harus berupa URL https yang valid.' };
  }

  const p256dh = typeof raw.keys?.p256dh === 'string' ? raw.keys.p256dh.trim() : '';
  const auth = typeof raw.keys?.auth === 'string' ? raw.keys.auth.trim() : '';
  if (!p256dh || !auth) {
    return { ok: false, error: 'Subscription keys.p256dh dan keys.auth wajib diisi.' };
  }

  return {
    ok: true,
    subscription: {
      endpoint,
      expirationTime: raw.expirationTime ?? null,
      keys: { p256dh, auth }
    }
  };
}

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function sanitizeTimeString(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseTimeToMinutes(timeStr, fallbackMinutes) {
  if (typeof timeStr !== 'string') return fallbackMinutes;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallbackMinutes;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallbackMinutes;
  return hour * 60 + minute;
}

function formatMinutesToHHMM(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function sanitizeTimeZone(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return null;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: trimmed });
    return trimmed;
  } catch {
    return null;
  }
}

function sanitizeDateString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function sanitizeIsoTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const ms = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function sanitizeUserName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60);
}

function sanitizeSoundLabel(value) {
  if (typeof value !== 'string') return 'default';
  const trimmed = value.trim().slice(0, 40);
  return trimmed || 'default';
}

function sanitizeCustomMessages(rawList) {
  if (!Array.isArray(rawList)) return [];
  const cleaned = [];
  for (let i = 0; i < rawList.length && cleaned.length < 20; i += 1) {
    const item = rawList[i];
    if (!item || typeof item !== 'object') continue;
    const title = typeof item.title === 'string'
      ? item.title.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80)
      : '';
    const body = typeof item.body === 'string'
      ? item.body.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 220)
      : '';
    if (!title && !body) continue;
    cleaned.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 40) : `msg-${i + 1}`,
      title: title || 'Pengingat Hidrasi HydroTrack',
      body: body || title
    });
  }
  return cleaned;
}

export function getUserLocalTime(nowMs, timeZone, timezoneOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  const date = new Date(nowMs);

  if (timeZone && typeof timeZone === 'string') {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      });

      const parts = formatter.formatToParts(date);
      const map = {};
      for (const part of parts) {
        if (part.type !== 'literal') {
          map[part.type] = part.value;
        }
      }

      const year = Number(map.year);
      const month = Number(map.month);
      const day = Number(map.day);
      const rawHour = Number(map.hour);
      // Guard against engines that format midnight as 24 even under h23.
      const hour = rawHour === 24 ? 0 : rawHour;
      const minute = Number(map.minute);

      if (
        Number.isFinite(year) &&
        Number.isFinite(month) &&
        Number.isFinite(day) &&
        Number.isFinite(hour) &&
        Number.isFinite(minute)
      ) {
        const localDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return {
          localDate,
          hour,
          minute,
          minutesSinceMidnight: hour * 60 + minute,
          usedTimeZone: timeZone
        };
      }
    } catch {
      // Invalid IANA timezone string; fall back to numeric offset below.
    }
  }

  // Uses Date.prototype.getTimezoneOffset() sign convention (UTC+7 is -420).
  const safeOffset = clampInt(timezoneOffsetMinutes, -840, 840, DEFAULT_TZ_OFFSET_MINUTES);
  const shifted = new Date(nowMs - safeOffset * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();

  return {
    localDate: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    hour,
    minute,
    minutesSinceMidnight: hour * 60 + minute,
    usedTimeZone: null
  };
}

function normalizeSchedule(rawSchedule = {}, body = {}, existingSchedule = {}) {
  const source = { ...existingSchedule, ...rawSchedule };
  const startTime = sanitizeTimeString(source.startTime ?? body.startTime, DEFAULT_START_TIME);
  const endTime = sanitizeTimeString(source.endTime ?? body.endTime, DEFAULT_END_TIME);

  const rawTimeZone = rawSchedule.timeZone ?? body.timeZone ?? existingSchedule.timeZone;
  const rawOffset = rawSchedule.timezoneOffsetMinutes ?? body.timezoneOffsetMinutes ?? existingSchedule.timezoneOffsetMinutes;

  const rawCustomMessages = rawSchedule.customMessages !== undefined
    ? rawSchedule.customMessages
    : (body.customMessages !== undefined ? body.customMessages : existingSchedule.customMessages);

  return {
    enabled: Boolean(source.enabled ?? true),
    mode: source.mode === 'smart' ? 'smart' : 'fixed',
    startTime,
    endTime,
    intervalMinutes: clampInt(
      source.intervalMinutes ?? body.intervalMinutes,
      MIN_INTERVAL_MINUTES,
      MAX_INTERVAL_MINUTES,
      DEFAULT_INTERVAL_MINUTES
    ),
    timeZone: sanitizeTimeZone(rawTimeZone),
    timezoneOffsetMinutes: clampInt(rawOffset, -840, 840, DEFAULT_TZ_OFFSET_MINUTES),
    pauseWhenGoalMet: Boolean(source.pauseWhenGoalMet ?? true),
    soundLabel: sanitizeSoundLabel(source.soundLabel ?? body.soundLabel),
    customMessages: sanitizeCustomMessages(rawCustomMessages)
  };
}

function normalizeProfile(rawProfile = {}, rawSchedule = {}, body = {}, existingProfile = {}, fallbackLocalDate) {
  const pick = (key) => {
    if (rawProfile && rawProfile[key] !== undefined) return rawProfile[key];
    if (rawSchedule && rawSchedule[key] !== undefined) return rawSchedule[key];
    if (body && body[key] !== undefined) return body[key];
    return existingProfile ? existingProfile[key] : undefined;
  };

  const userName = sanitizeUserName(pick('userName'));
  const dailyGoal = clampInt(pick('dailyGoal'), 500, 10000, DEFAULT_DAILY_GOAL);
  const todayTotal = clampInt(pick('todayTotal'), 0, 30000, 0);
  const todayDate = sanitizeDateString(pick('todayDate')) || fallbackLocalDate;
  const lastDrinkAt = sanitizeIsoTimestamp(pick('lastDrinkAt'));

  return {
    userName,
    dailyGoal,
    todayTotal,
    todayDate,
    lastDrinkAt
  };
}

function getEffectiveTodayTotal(profile, userLocalDate) {
  if (!profile || profile.todayDate !== userLocalDate) {
    return 0;
  }
  return clampInt(profile.todayTotal, 0, 30000, 0);
}

function getTodayLastDrinkMinute(profile, schedule, userLocalDate, currentMin) {
  if (!profile?.lastDrinkAt) return null;
  const parsedMs = Date.parse(profile.lastDrinkAt);
  if (!Number.isFinite(parsedMs)) return null;

  const drinkLocal = getUserLocalTime(parsedMs, schedule.timeZone, schedule.timezoneOffsetMinutes);
  if (drinkLocal.localDate !== userLocalDate) return null;
  if (drinkLocal.minutesSinceMidnight > currentMin) return null;
  return drinkLocal.minutesSinceMidnight;
}

export function evaluateReminderSchedule(record, nowMs = Date.now()) {
  const schedule = record?.schedule;
  const profile = record?.profile || {};

  if (!schedule || !schedule.enabled) {
    return { due: false, reason: 'disabled' };
  }

  const localTime = getUserLocalTime(nowMs, schedule.timeZone, schedule.timezoneOffsetMinutes);
  const dailyGoal = clampInt(profile.dailyGoal, 500, 10000, DEFAULT_DAILY_GOAL);
  const effectiveTodayTotal = getEffectiveTodayTotal(profile, localTime.localDate);

  if (schedule.pauseWhenGoalMet && effectiveTodayTotal >= dailyGoal) {
    return {
      due: false,
      reason: 'goal_met',
      localTime,
      dailyGoal,
      effectiveTodayTotal
    };
  }

  const startMinutes = parseTimeToMinutes(schedule.startTime, 7 * 60);
  const endMinutes = parseTimeToMinutes(schedule.endTime, 22 * 60);
  const intervalMinutes = clampInt(
    schedule.intervalMinutes,
    MIN_INTERVAL_MINUTES,
    MAX_INTERVAL_MINUTES,
    DEFAULT_INTERVAL_MINUTES
  );
  const currentMin = localTime.minutesSinceMidnight;

  if (endMinutes < startMinutes || currentMin < startMinutes || currentMin > endMinutes) {
    return {
      due: false,
      reason: 'outside_window',
      localTime,
      dailyGoal,
      effectiveTodayTotal
    };
  }

  // Match strictly on the exact scheduled minute so 1-minute Cron triggers never send duplicate pushes on t+1/t+2 due to Cloudflare KV eventual consistency.
  let slotMinute = null;
  let slotKind = 'fixed';

  if (schedule.mode === 'smart') {
    const lastDrinkMin = getTodayLastDrinkMinute(profile, schedule, localTime.localDate, currentMin);
    if (lastDrinkMin !== null) {
      slotKind = 'smart';
      const firstDue = lastDrinkMin + intervalMinutes;
      if (currentMin >= firstDue) {
        const k = Math.floor((currentMin - firstDue) / intervalMinutes);
        const candidate = firstDue + k * intervalMinutes;
        if (candidate >= startMinutes && candidate <= endMinutes && currentMin === candidate) {
          slotMinute = candidate;
        }
      }
    }
  }

  if (slotKind === 'fixed') {
    const k = Math.floor((currentMin - startMinutes) / intervalMinutes);
    const candidate = startMinutes + k * intervalMinutes;
    if (candidate <= endMinutes && currentMin === candidate) {
      slotMinute = candidate;
    }
  }

  if (slotMinute === null) {
    return {
      due: false,
      reason: 'not_due',
      localTime,
      dailyGoal,
      effectiveTodayTotal
    };
  }

  const slotKey = slotKind === 'smart'
    ? `${localTime.localDate}@smart:${slotMinute}`
    : `${localTime.localDate}@${slotMinute}`;

  if (record.lastNotifiedSlot === slotKey) {
    return {
      due: false,
      reason: 'already_notified',
      slotKey,
      localTime,
      dailyGoal,
      effectiveTodayTotal
    };
  }

  if (record.lastSentAt) {
    const lastSentMs = Date.parse(record.lastSentAt);
    if (Number.isFinite(lastSentMs) && nowMs - lastSentMs < 50_000) {
      return {
        due: false,
        reason: 'cooldown',
        slotKey,
        localTime,
        dailyGoal,
        effectiveTodayTotal
      };
    }
  }

  return {
    due: true,
    slotKey,
    slotMinute,
    slotKind,
    localTime,
    dailyGoal,
    effectiveTodayTotal
  };
}

export function computeNextReminder(record, nowMs = Date.now()) {
  const schedule = record?.schedule;
  const profile = record?.profile || {};
  if (!schedule || !schedule.enabled) {
    return { nextReminderAt: null, nextReminderLocal: null };
  }

  const localTime = getUserLocalTime(nowMs, schedule.timeZone, schedule.timezoneOffsetMinutes);
  const startMinutes = parseTimeToMinutes(schedule.startTime, 7 * 60);
  const endMinutes = parseTimeToMinutes(schedule.endTime, 22 * 60);
  const intervalMinutes = clampInt(
    schedule.intervalMinutes,
    MIN_INTERVAL_MINUTES,
    MAX_INTERVAL_MINUTES,
    DEFAULT_INTERVAL_MINUTES
  );

  if (endMinutes < startMinutes) {
    return { nextReminderAt: null, nextReminderLocal: null };
  }

  const dailyGoal = clampInt(profile.dailyGoal, 500, 10000, DEFAULT_DAILY_GOAL);
  const effectiveTodayTotal = getEffectiveTodayTotal(profile, localTime.localDate);
  const currentMin = localTime.minutesSinceMidnight;

  let targetDayOffset = 0;
  let targetMinute = null;

  if (schedule.pauseWhenGoalMet && effectiveTodayTotal >= dailyGoal) {
    targetDayOffset = 1;
    targetMinute = startMinutes;
  } else {
    const earliestSearchMin = Math.max(startMinutes, currentMin + 1);

    if (schedule.mode === 'smart') {
      const lastDrinkMin = getTodayLastDrinkMinute(profile, schedule, localTime.localDate, currentMin);
      if (lastDrinkMin !== null) {
        let candidate = lastDrinkMin + intervalMinutes;
        if (candidate < earliestSearchMin) {
          const steps = Math.ceil((earliestSearchMin - candidate) / intervalMinutes);
          candidate += steps * intervalMinutes;
        }
        if (candidate <= endMinutes) {
          targetMinute = candidate;
        }
      }
    }

    if (targetMinute === null) {
      const isSmartWithDrink =
        schedule.mode === 'smart' &&
        getTodayLastDrinkMinute(profile, schedule, localTime.localDate, currentMin) !== null;

      if (!isSmartWithDrink) {
        if (earliestSearchMin <= startMinutes) {
          targetMinute = startMinutes;
        } else {
          const steps = Math.ceil((earliestSearchMin - startMinutes) / intervalMinutes);
          const candidate = startMinutes + steps * intervalMinutes;
          if (candidate <= endMinutes) {
            targetMinute = candidate;
          }
        }
      }
    }

    if (targetMinute === null) {
      targetDayOffset = 1;
      targetMinute = startMinutes;
    }
  }

  const deltaMinutes = targetDayOffset * 1440 + (targetMinute - currentMin);
  const baseMinuteMs = Math.floor(nowMs / 60_000) * 60_000;
  const nextReminderAt = new Date(baseMinuteMs + deltaMinutes * 60_000).toISOString();

  return {
    nextReminderAt,
    nextReminderLocal: formatMinutesToHHMM(targetMinute)
  };
}

function getTimeOfDayGreeting(hour) {
  if (hour >= 4 && hour <= 10) return 'pagi';
  if (hour >= 11 && hour <= 14) return 'siang';
  if (hour >= 15 && hour <= 17) return 'sore';
  return 'malam';
}

function formatMl(amount) {
  return `${Math.max(0, Math.round(amount)).toLocaleString('id-ID')} ml`;
}

export function buildReminderPayload(record, evalResult, nowMs = Date.now()) {
  const profile = record.profile || {};
  const schedule = record.schedule || {};
  const name = sanitizeUserName(profile.userName);
  const total = evalResult.effectiveTodayTotal;
  const goal = evalResult.dailyGoal;
  const remaining = Math.max(0, goal - total);
  const percent = Math.min(100, Math.round((total / goal) * 100));
  const period = getTimeOfDayGreeting(evalResult.localTime.hour);
  const greeting = name ? `Hai ${name},` : 'Hai,';
  const variant = Math.floor((evalResult.slotMinute || 0) / 15) % 3;

  let title;
  let body;

  const customMessages = sanitizeCustomMessages(schedule.customMessages);
  if (customMessages.length > 0) {
    const slotStep = Math.floor((evalResult.slotMinute || 0) / Math.max(1, schedule.intervalMinutes || 60));
    const chosen = customMessages[slotStep % customMessages.length];
    title = chosen.title;
    body = chosen.body;
  } else if (total === 0) {
    if (period === 'pagi') {
      title = 'Selamat pagi, saatnya minum air pertama';
      body = `${greeting} mulai harimu dengan segelas air putih. Target hidrasi hari ini ${formatMl(goal)}.`;
    } else {
      title = `Belum ada catatan minum ${period} ini`;
      body = `${greeting} luangkan sebentar untuk minum segelas air. Target hari ini masih ${formatMl(goal)}.`;
    }
  } else if (remaining === 0) {
    title = 'Target harian tercapai, jaga tetap terhidrasi';
    body = `${greeting} catatan minummu sudah mencapai ${formatMl(total)} hari ini. Tetap minum bila merasa haus.`;
  } else if (percent >= 80) {
    title = `Sedikit lagi target ${formatMl(goal)} tercapai`;
    body = `${greeting} sudah masuk ${formatMl(total)} (${percent}%). Tinggal ${formatMl(remaining)} lagi untuk menuntaskan target hari ini.`;
  } else if (percent >= 40) {
    const titles = [
      `Progres hidrasi ${period} ini sudah ${percent}%`,
      'Waktunya jeda sebentar untuk minum air',
      'Jaga fokus dengan segelas air putih'
    ];
    title = titles[variant];
    body = `${greeting} total asupanmu ${formatMl(total)} dari ${formatMl(goal)}. Sisa ${formatMl(remaining)} lagi hari ini.`;
  } else {
    const titles = [
      `Waktunya minum air ${period} ini`,
      'Jangan lupa isi ulang cairan tubuhmu',
      'Pengingat hidrasi HydroTrack'
    ];
    title = titles[variant];
    body = `${greeting} asupanmu baru ${formatMl(total)} (${percent}%). Tambah segelas air, sisa target ${formatMl(remaining)}.`;
  }

  return {
    title,
    body,
    icon: DEFAULT_ICON_PATH,
    badge: DEFAULT_ICON_PATH,
    tag: 'hydrotrack-reminder',
    renotify: true,
    silent: schedule.soundLabel === 'silent',
    url: '/index.html',
    data: {
      url: '/index.html',
      type: 'reminder',
      slotKey: evalResult.slotKey,
      todayTotal: total,
      dailyGoal: goal,
      soundLabel: schedule.soundLabel || 'default',
      sentAt: new Date(nowMs).toISOString()
    }
  };
}

function buildTestPayload({ userName, todayTotal, dailyGoal, delaySeconds, soundLabel, title: rawTitle, body: rawBody }) {
  const name = sanitizeUserName(userName);
  const greeting = name ? `Halo ${name},` : 'Halo,';
  const hasGoal = Number.isFinite(Number(dailyGoal)) && Number(dailyGoal) > 0;
  const total = clampInt(todayTotal, 0, 30000, 0);
  const goal = clampInt(dailyGoal, 500, 10000, DEFAULT_DAILY_GOAL);
  const cleanSoundLabel = sanitizeSoundLabel(soundLabel);

  const progressText = hasGoal
    ? ` Progres tercatat ${formatMl(total)} dari ${formatMl(goal)}.`
    : '';

  const customTitle = typeof rawTitle === 'string' ? rawTitle.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80) : '';
  const customBody = typeof rawBody === 'string' ? rawBody.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 220) : '';

  const title = customTitle || (delaySeconds > 0
    ? 'Tes Push Latar Belakang Berhasil'
    : 'Tes Notifikasi HydroTrack Berhasil');

  const body = customBody || (delaySeconds > 0
    ? `${greeting} notifikasi ini dikirim dari server setelah jeda ${delaySeconds} detik.${progressText}`
    : `${greeting} koneksi push server HydroTrack aktif dan siap mengirim pengingat.${progressText}`);

  const testTag = `hydrotrack-test-${Date.now()}`;

  return {
    title,
    body,
    icon: DEFAULT_ICON_PATH,
    badge: DEFAULT_ICON_PATH,
    tag: testTag,
    renotify: true,
    silent: cleanSoundLabel === 'silent',
    url: '/pengaturan.html',
    data: {
      url: '/pengaturan.html',
      type: 'test',
      todayTotal: total,
      dailyGoal: goal,
      soundLabel: cleanSoundLabel,
      sentAt: new Date().toISOString()
    }
  };
}

// Maintain a single-key subscription index so 1-minute Cron uses KV.get (100k/day free) instead of KV.list (1k/day free).
async function getSubscriptionIndex(env) {
  const indexed = await env.HYDRO_PUSH_KV.get(SUB_INDEX_KEY, 'json');
  if (Array.isArray(indexed)) {
    return indexed.filter((k) => typeof k === 'string' && k.startsWith(SUBSCRIPTION_PREFIX));
  }

  // One-time bootstrap from existing KV keys if meta:sub_index does not exist yet.
  const discovered = [];
  let cursor = undefined;
  do {
    const page = await env.HYDRO_PUSH_KV.list({
      prefix: SUBSCRIPTION_PREFIX,
      cursor,
      limit: 1000
    });
    for (const entry of (page.keys || [])) {
      if (entry && typeof entry.name === 'string') {
        discovered.push(entry.name);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  await env.HYDRO_PUSH_KV.put(SUB_INDEX_KEY, JSON.stringify(discovered));
  return discovered;
}

async function addKeyToIndex(env, keyName) {
  const list = await getSubscriptionIndex(env);
  if (!list.includes(keyName)) {
    list.push(keyName);
    await env.HYDRO_PUSH_KV.put(SUB_INDEX_KEY, JSON.stringify(list));
  }
}

async function removeKeyFromIndex(env, keyName) {
  const list = await getSubscriptionIndex(env);
  const filtered = list.filter((k) => k !== keyName);
  if (filtered.length !== list.length) {
    await env.HYDRO_PUSH_KV.put(SUB_INDEX_KEY, JSON.stringify(filtered));
  }
}

function getVapidConfig(env) {
  const publicKey = typeof env.VAPID_PUBLIC_KEY === 'string' ? env.VAPID_PUBLIC_KEY.trim() : '';
  const privateKey = typeof env.VAPID_PRIVATE_KEY === 'string' ? env.VAPID_PRIVATE_KEY.trim() : '';
  const subject = typeof env.VAPID_SUBJECT === 'string' && env.VAPID_SUBJECT.trim()
    ? env.VAPID_SUBJECT.trim()
    : 'mailto:admin@hydrotrack.app';

  if (!publicKey || !privateKey) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

async function handleSubscribe(request, env, corsHeaders) {
  if (!env.HYDRO_PUSH_KV) {
    return jsonResponse({ ok: false, error: 'KV namespace HYDRO_PUSH_KV belum terpasang.' }, 503, corsHeaders);
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, 400, corsHeaders);
  }

  const body = parsed.data;
  const subCheck = validateSubscription(body.subscription);
  if (!subCheck.ok) {
    return jsonResponse({ ok: false, error: subCheck.error }, 400, corsHeaders);
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const key = await endpointKey(subCheck.subscription.endpoint);
  const id = key.slice(SUBSCRIPTION_PREFIX.length);

  const existing = (await env.HYDRO_PUSH_KV.get(key, 'json')) || null;
  const schedule = normalizeSchedule(body.schedule || {}, body, existing?.schedule || {});
  const localNow = getUserLocalTime(nowMs, schedule.timeZone, schedule.timezoneOffsetMinutes);
  const profile = normalizeProfile(
    body.profile || {},
    body.schedule || {},
    body,
    existing?.profile || {},
    localNow.localDate
  );

  const record = {
    id,
    subscription: subCheck.subscription,
    schedule,
    profile,
    lastNotifiedSlot: existing?.lastNotifiedSlot || null,
    lastSentAt: existing?.lastSentAt || null,
    lastTestSentAt: existing?.lastTestSentAt || null,
    lastTestStatus: existing?.lastTestStatus ?? null,
    lastTestOk: existing?.lastTestOk ?? null,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso
  };

  await env.HYDRO_PUSH_KV.put(key, JSON.stringify(record), {
    expirationTtl: SUBSCRIPTION_TTL_SECONDS
  });
  await addKeyToIndex(env, key);

  const next = computeNextReminder(record, nowMs);
  return jsonResponse({
    ok: true,
    id,
    nextReminderAt: next.nextReminderAt,
    nextReminderLocal: next.nextReminderLocal,
    message: schedule.enabled
      ? 'Langganan push tersimpan dan jadwal pengingat aktif.'
      : 'Langganan push tersimpan dalam status dijeda.'
  }, 200, corsHeaders);
}

async function handleSyncProgress(request, env, corsHeaders) {
  if (!env.HYDRO_PUSH_KV) {
    return jsonResponse({ ok: false, error: 'KV namespace HYDRO_PUSH_KV belum terpasang.' }, 503, corsHeaders);
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, 400, corsHeaders);
  }

  const body = parsed.data;
  const endpoint = validateEndpoint(body.subscription?.endpoint ?? body.endpoint);
  if (!endpoint) {
    return jsonResponse({ ok: false, error: 'Endpoint subscription tidak valid.' }, 400, corsHeaders);
  }

  const key = await endpointKey(endpoint);
  const existing = await env.HYDRO_PUSH_KV.get(key, 'json');
  if (!existing) {
    return jsonResponse({ ok: false, error: 'Langganan belum terdaftar di server.' }, 404, corsHeaders);
  }

  const nowMs = Date.now();
  const localNow = getUserLocalTime(
    nowMs,
    existing.schedule?.timeZone,
    existing.schedule?.timezoneOffsetMinutes
  );

  const incomingProfile = body.profile && typeof body.profile === 'object' ? body.profile : body;
  const updatedProfile = { ...existing.profile };

  if (incomingProfile.userName !== undefined) {
    updatedProfile.userName = sanitizeUserName(incomingProfile.userName);
  }
  if (incomingProfile.dailyGoal !== undefined) {
    updatedProfile.dailyGoal = clampInt(incomingProfile.dailyGoal, 500, 10000, updatedProfile.dailyGoal || DEFAULT_DAILY_GOAL);
  }
  if (incomingProfile.todayTotal !== undefined) {
    updatedProfile.todayTotal = clampInt(incomingProfile.todayTotal, 0, 30000, 0);
  }
  if (incomingProfile.todayDate !== undefined) {
    updatedProfile.todayDate = sanitizeDateString(incomingProfile.todayDate) || localNow.localDate;
  } else if (!updatedProfile.todayDate) {
    updatedProfile.todayDate = localNow.localDate;
  }
  if (incomingProfile.lastDrinkAt !== undefined) {
    updatedProfile.lastDrinkAt = sanitizeIsoTimestamp(incomingProfile.lastDrinkAt);
  }

  const updatedRecord = {
    ...existing,
    profile: updatedProfile,
    updatedAt: new Date(nowMs).toISOString()
  };

  await env.HYDRO_PUSH_KV.put(key, JSON.stringify(updatedRecord), {
    expirationTtl: SUBSCRIPTION_TTL_SECONDS
  });

  return jsonResponse({ ok: true, id: existing.id }, 200, corsHeaders);
}

async function handleUnsubscribe(request, env, corsHeaders) {
  if (!env.HYDRO_PUSH_KV) {
    return jsonResponse({ ok: false, error: 'KV namespace HYDRO_PUSH_KV belum terpasang.' }, 503, corsHeaders);
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, 400, corsHeaders);
  }

  const body = parsed.data;
  const endpoint = validateEndpoint(body.subscription?.endpoint ?? body.endpoint);
  if (!endpoint) {
    return jsonResponse({ ok: false, error: 'Endpoint subscription tidak valid.' }, 400, corsHeaders);
  }

  const key = await endpointKey(endpoint);
  await env.HYDRO_PUSH_KV.delete(key);
  await removeKeyFromIndex(env, key);

  return jsonResponse({
    ok: true,
    message: 'Langganan push berhasil dihapus dari server.'
  }, 200, corsHeaders);
}

async function handleTestPush(request, env, ctx, corsHeaders) {
  const vapidConfig = getVapidConfig(env);
  if (!vapidConfig) {
    return jsonResponse({ ok: false, error: 'VAPID keys belum dikonfigurasi pada Worker.' }, 503, corsHeaders);
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, 400, corsHeaders);
  }

  const body = parsed.data;
  const subCheck = validateSubscription(body.subscription);
  if (!subCheck.ok) {
    return jsonResponse({ ok: false, error: subCheck.error }, 400, corsHeaders);
  }

  // Cap waitUntil delay to 25s to stay safely within Cloudflare Workers waitUntil budget.
  const delaySeconds = clampInt(body.delaySeconds ?? 0, 0, MAX_TEST_DELAY_SECONDS, 0);
  const payload = buildTestPayload({
    userName: body.userName ?? body.profile?.userName,
    todayTotal: body.todayTotal ?? body.profile?.todayTotal,
    dailyGoal: body.dailyGoal ?? body.profile?.dailyGoal,
    soundLabel: body.soundLabel ?? body.schedule?.soundLabel,
    title: body.title,
    body: body.body,
    delaySeconds
  });

  if (delaySeconds > 0) {
    // Pre-sign VAPID and pre-encrypt payload BEFORE returning 200 so key issues fail immediately and waitUntil stays ultra-lightweight (no KV writes, no Topic collapse).
    let preparedHeaders;
    let preparedBody;
    try {
      const [{ authorization }, encryptedBody] = await Promise.all([
        createVapidAuthHeader(subCheck.subscription.endpoint, vapidConfig),
        encryptWebPushPayload(subCheck.subscription, payload)
      ]);
      preparedHeaders = {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '120',
        'Urgency': 'high',
        'Authorization': authorization
      };
      preparedBody = encryptedBody;
    } catch (prepErr) {
      return jsonResponse({
        ok: false,
        error: prepErr instanceof Error ? prepErr.message : 'Gagal mengenkripsi payload push.'
      }, 400, corsHeaders);
    }

    ctx.waitUntil(
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
        try {
          const res = await fetch(subCheck.subscription.endpoint, {
            method: 'POST',
            headers: preparedHeaders,
            body: preparedBody
          });
          if (!res.ok) {
            const errTxt = (await res.text().catch(() => '')).slice(0, 200);
            console.error(`Delayed test push failed: HTTP ${res.status} ${errTxt}`);
            if ((res.status === 404 || res.status === 410) && env.HYDRO_PUSH_KV) {
              const key = await endpointKey(subCheck.subscription.endpoint);
              await env.HYDRO_PUSH_KV.delete(key);
              await removeKeyFromIndex(env, key);
            }
          }
        } catch (sendErr) {
          console.error('Delayed test push fetch error:', sendErr);
        }
      })()
    );

    return jsonResponse({
      ok: true,
      scheduledDelaySeconds: delaySeconds,
      tag: payload.tag,
      message: `Tes notifikasi dijadwalkan ${delaySeconds} detik lagi. Anda dapat menutup tab atau mengunci layar sekarang.`
    }, 200, corsHeaders);
  }

  const result = await sendWebPush(subCheck.subscription, payload, vapidConfig, {
    ttl: 120,
    urgency: 'high'
  });

  if (result.expired && env.HYDRO_PUSH_KV) {
    const key = await endpointKey(subCheck.subscription.endpoint);
    await env.HYDRO_PUSH_KV.delete(key);
    await removeKeyFromIndex(env, key);
  }

  return jsonResponse({
    ok: result.ok,
    status: result.status,
    expired: result.expired,
    message: result.ok
      ? 'Notifikasi tes berhasil dikirim ke layanan push.'
      : 'Layanan push menolak pengiriman notifikasi tes.',
    error: result.ok ? undefined : (result.errorText || `HTTP ${result.status}`)
  }, result.ok ? 200 : 502, corsHeaders);
}

async function processSubscriptionKey(keyName, env, vapidConfig, nowMs) {
  const record = await env.HYDRO_PUSH_KV.get(keyName, 'json');
  if (!record || !record.subscription?.endpoint || !record.schedule?.enabled) {
    return;
  }

  const evalResult = evaluateReminderSchedule(record, nowMs);
  if (!evalResult.due) {
    // Skip KV writes when not due to preserve Cloudflare Free Tier daily KV write quota.
    return;
  }

  // Isolate-level anti-duplicate guard in case the same minute fires twice before KV propagates.
  const dedupeKey = `${keyName}|${evalResult.slotKey}`;
  const prevIsolateSent = recentIsolateSentSlots.get(dedupeKey);
  if (prevIsolateSent && nowMs - prevIsolateSent < 10 * 60_000) {
    return;
  }
  recentIsolateSentSlots.set(dedupeKey, nowMs);
  if (recentIsolateSentSlots.size > 500) {
    for (const [k, ts] of recentIsolateSentSlots) {
      if (nowMs - ts >= 10 * 60_000) recentIsolateSentSlots.delete(k);
    }
  }

  const payload = buildReminderPayload(record, evalResult, nowMs);
  const sendResult = await sendWebPush(record.subscription, payload, vapidConfig, {
    ttl: REMINDER_PUSH_TTL_SECONDS,
    urgency: 'high',
    topic: 'hydrotrack-reminder'
  });

  if (sendResult.expired) {
    await env.HYDRO_PUSH_KV.delete(keyName);
    await removeKeyFromIndex(env, keyName);
    return;
  }

  if (sendResult.ok) {
    const sentIso = new Date(nowMs).toISOString();
    const updated = {
      ...record,
      lastNotifiedSlot: evalResult.slotKey,
      lastSentAt: sentIso,
      updatedAt: sentIso
    };
    await env.HYDRO_PUSH_KV.put(keyName, JSON.stringify(updated), {
      expirationTtl: SUBSCRIPTION_TTL_SECONDS
    });
  } else {
    console.error(`Push failed for ${keyName}: HTTP ${sendResult.status} ${sendResult.errorText}`);
  }
}

async function runScheduledReminders(env, nowMs) {
  if (!env.HYDRO_PUSH_KV) {
    console.warn('HYDRO_PUSH_KV is not bound; skipping scheduled reminders.');
    return;
  }

  const vapidConfig = getVapidConfig(env);
  if (!vapidConfig) {
    console.warn('VAPID secrets are not configured; skipping scheduled reminders.');
    return;
  }

  const keyNames = await getSubscriptionIndex(env);
  for (let i = 0; i < keyNames.length; i += CRON_BATCH_SIZE) {
    const batch = keyNames.slice(i, i + CRON_BATCH_SIZE);
    await Promise.all(
      batch.map((keyName) =>
        processSubscriptionKey(keyName, env, vapidConfig, nowMs).catch((err) => {
          console.error(`Error processing ${keyName}:`, err);
        })
      )
    );
  }
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'GET' && (pathname === '/' || pathname === '/health')) {
      return jsonResponse({
        ok: true,
        service: 'hydrotrack-push',
        vapidConfigured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
        kvConfigured: Boolean(env.HYDRO_PUSH_KV),
        timestamp: new Date().toISOString()
      }, 200, corsHeaders);
    }

    if (request.method === 'GET' && pathname === '/vapid-public-key') {
      const publicKey = typeof env.VAPID_PUBLIC_KEY === 'string' ? env.VAPID_PUBLIC_KEY.trim() : '';
      if (!publicKey) {
        return jsonResponse({
          ok: false,
          error: 'VAPID_PUBLIC_KEY belum dikonfigurasi pada server.'
        }, 503, corsHeaders);
      }
      return jsonResponse({ publicKey }, 200, corsHeaders);
    }

    if (request.method === 'POST' && pathname === '/subscribe') {
      return handleSubscribe(request, env, corsHeaders);
    }

    if (request.method === 'POST' && pathname === '/sync-progress') {
      return handleSyncProgress(request, env, corsHeaders);
    }

    if (request.method === 'POST' && pathname === '/unsubscribe') {
      return handleUnsubscribe(request, env, corsHeaders);
    }

    if (request.method === 'POST' && pathname === '/test-push') {
      return handleTestPush(request, env, ctx, corsHeaders);
    }

    return jsonResponse({
      ok: false,
      error: `Endpoint ${request.method} ${pathname} tidak ditemukan.`
    }, 404, corsHeaders);
  },

  async scheduled(event, env, ctx) {
    const nowMs = event?.scheduledTime || Date.now();
    ctx.waitUntil(runScheduledReminders(env, nowMs));
  }
};
