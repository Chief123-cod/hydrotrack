const HydroNotifications = (() => {
  // Optional hardcoded Cloudflare Worker URL; users can also configure it in Settings.
  const DEFAULT_PUSH_SERVER_URL = 'https://hydrotrack-push.faithpontoh182.workers.dev';

  const STORAGE_KEY = 'hydrotrack_notification_settings';
  const AUDIO_DB_NAME = 'hydrotrack_audio_db';
  const AUDIO_DB_VERSION = 1;
  const AUDIO_STORE_NAME = 'ringtones';
  const AUDIO_KEY_UPLOAD = 'custom-upload';
  const AUDIO_KEY_VOICE = 'custom-voice';
  const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
  const MAX_VOICE_SECONDS = 15;
  const ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm', '.flac', '.opus'];

  const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
    enabled: false,
    mode: 'fixed',
    startTime: '07:00',
    endTime: '21:00',
    intervalMinutes: 120,
    pauseWhenGoalMet: true,
    soundType: 'default',
    defaultSoundId: 'water-drop',
    customAudioName: '',
    customVoiceName: '',
    customVoiceDuration: 0,
    pushServerUrl: '',
    pushConnected: false,
    lastScheduledAt: null,
    lastNotifiedSlot: ''
  });

  const VALID_SOUND_TYPES = new Set(['default', 'custom-upload']);
  const VALID_DEFAULT_SOUNDS = new Set(['water-drop', 'soft-bell', 'fresh-chime', 'gentle-pulse']);

  let initialized = false;
  let settingsUiBound = false;
  let swRegistration = null;
  let deferredInstallPrompt = null;
  let localTimerId = null;
  let syncProgressDebounceId = null;
  let syncScheduleDebounceId = null;
  let testCountdownIntervalId = null;
  let testLocalFallbackTimeoutId = null;
  let audioDbPromise = null;
  let sharedAudioContext = null;
  let activeAudioElement = null;
  let activeAudioObjectUrl = null;
  let activePreviewBtn = null;
  let activePreviewBtnTimerId = null;
  let lastSoundPlayedAt = 0;
  let lastPushErrorMessage = '';

  let mediaRecorder = null;
  let activeMicStream = null;
  let recordingChunks = [];
  let recordingStartedAt = 0;
  let recordingTimerId = null;
  let isRecordingVoice = false;
  let isStartingVoice = false;

  const audioAvailability = {
    [AUDIO_KEY_UPLOAD]: null,
    [AUDIO_KEY_VOICE]: null
  };

  // Capture install prompt as early as possible since Chrome may fire it before DOMContentLoaded.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      renderPwaInstallUI();
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      renderPwaInstallUI();
      showToastSafe('HydroTrack berhasil diinstal di perangkatmu.', 'success');
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumberId(num) {
    return (parseInt(num, 10) || 0).toLocaleString('id-ID');
  }

  function formatMl(num) {
    return `${formatNumberId(num)} ml`;
  }

  function formatDurationMMSS(totalSeconds) {
    const safe = Math.max(0, Math.min(MAX_VOICE_SECONDS, Math.floor(Number(totalSeconds) || 0)));
    const mins = String(Math.floor(safe / 60)).padStart(2, '0');
    const secs = String(safe % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function formatIntervalLabel(minutes) {
    const mins = Math.max(15, parseInt(minutes, 10) || 120);
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hours > 0 && rem > 0) return `${hours} jam ${rem} menit`;
    if (hours > 0) return `${hours} jam`;
    return `${rem} menit`;
  }

  function showToastSafe(message, type = 'success') {
    if (typeof UI !== 'undefined' && typeof UI.showToast === 'function' && document.getElementById('toastContainer')) {
      UI.showToast(message, type);
    }
  }

  function safeFormatDateKey(date) {
    if (typeof Storage !== 'undefined' && typeof Storage.formatDateKey === 'function') {
      return Storage.formatDateKey(date);
    }
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function safeGetAppSettings() {
    if (typeof Storage !== 'undefined' && typeof Storage.getSettings === 'function') {
      return Storage.getSettings();
    }
    return { userName: 'Pengguna', dailyGoal: 2000 };
  }

  function safeGetTodayLogs() {
    if (typeof Storage !== 'undefined' && typeof Storage.getTodayLogs === 'function') {
      return Storage.getTodayLogs();
    }
    return [];
  }

  function safeGetTodayTotal() {
    if (typeof Storage !== 'undefined' && typeof Storage.getTodayTotal === 'function') {
      return Storage.getTodayTotal();
    }
    return 0;
  }

  function safeGetTodayRemaining() {
    if (typeof Storage !== 'undefined' && typeof Storage.getTodayRemaining === 'function') {
      return Storage.getTodayRemaining();
    }
    const goal = Number(safeGetAppSettings().dailyGoal) || 2000;
    return Math.max(goal - safeGetTodayTotal(), 0);
  }

  function safeGetTodayPercentage() {
    if (typeof Storage !== 'undefined' && typeof Storage.getTodayPercentage === 'function') {
      return Storage.getTodayPercentage();
    }
    const goal = Number(safeGetAppSettings().dailyGoal) || 2000;
    if (goal <= 0) return 0;
    return Math.min(Math.round((safeGetTodayTotal() / goal) * 100), 100);
  }

  function getLatestDrinkDateToday() {
    const logs = safeGetTodayLogs();
    let latestMs = 0;
    for (let i = 0; i < logs.length; i++) {
      const ts = logs[i] && logs[i].timestamp ? new Date(logs[i].timestamp).getTime() : NaN;
      if (!isNaN(ts) && ts > latestMs) {
        latestMs = ts;
      }
    }
    return latestMs > 0 ? new Date(latestMs) : null;
  }

  // Settings persistence integrated with Storage.getSettings().notifications (fallback to dedicated key).
  function sanitizeSettings(raw) {
    const merged = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(raw && typeof raw === 'object' ? raw : {})
    };

    if (!merged.pushServerUrl && DEFAULT_PUSH_SERVER_URL) {
      merged.pushServerUrl = DEFAULT_PUSH_SERVER_URL;
    }

    merged.enabled = Boolean(merged.enabled);
    merged.mode = merged.mode === 'smart' ? 'smart' : 'fixed';
    merged.startTime = parseTimeToMinutes(merged.startTime) !== null ? merged.startTime : DEFAULT_NOTIFICATION_SETTINGS.startTime;
    merged.endTime = parseTimeToMinutes(merged.endTime) !== null ? merged.endTime : DEFAULT_NOTIFICATION_SETTINGS.endTime;

    const parsedInterval = parseInt(merged.intervalMinutes, 10);
    merged.intervalMinutes = (!isNaN(parsedInterval) && parsedInterval >= 15 && parsedInterval <= 480)
      ? parsedInterval
      : DEFAULT_NOTIFICATION_SETTINGS.intervalMinutes;

    merged.pauseWhenGoalMet = merged.pauseWhenGoalMet !== false;
    merged.soundType = VALID_SOUND_TYPES.has(merged.soundType) ? merged.soundType : 'default';
    merged.defaultSoundId = VALID_DEFAULT_SOUNDS.has(merged.defaultSoundId) ? merged.defaultSoundId : 'water-drop';
    merged.customAudioName = typeof merged.customAudioName === 'string' ? merged.customAudioName : '';
    merged.customVoiceName = typeof merged.customVoiceName === 'string' ? merged.customVoiceName : '';
    merged.customVoiceDuration = Math.max(0, Number(merged.customVoiceDuration) || 0);
    merged.pushServerUrl = typeof merged.pushServerUrl === 'string' ? merged.pushServerUrl.trim() : '';
    merged.pushConnected = Boolean(merged.pushConnected && merged.pushServerUrl);
    merged.lastScheduledAt = typeof merged.lastScheduledAt === 'string' ? merged.lastScheduledAt : null;
    merged.lastNotifiedSlot = typeof merged.lastNotifiedSlot === 'string' ? merged.lastNotifiedSlot : '';

    return merged;
  }

  function getSettings() {
    try {
      if (typeof Storage !== 'undefined' && typeof Storage.getSettings === 'function') {
        const appSettings = Storage.getSettings();
        if (appSettings && typeof appSettings.notifications === 'object' && appSettings.notifications) {
          return sanitizeSettings(appSettings.notifications);
        }
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return sanitizeSettings(parsed);
    } catch (err) {
      return sanitizeSettings(null);
    }
  }

  function saveSettings(updates) {
    const current = getSettings();
    const next = sanitizeSettings({ ...current, ...(updates || {}) });
    try {
      if (typeof Storage !== 'undefined' && typeof Storage.saveSettings === 'function') {
        Storage.saveSettings({ notifications: next });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch (err) {
      console.error('Gagal menyimpan pengaturan notifikasi:', err);
    }
    return next;
  }

  // Platform and browser capability inspection.
  function isStandaloneMode() {
    if (typeof window === 'undefined') return false;
    const displayStandalone = Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    const iosStandalone = window.navigator.standalone === true;
    const twa = typeof document !== 'undefined' && document.referrer.includes('android-app://');
    return displayStandalone || iosStandalone || twa;
  }

  function isIOSDevice() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isClassicIOS = /iPad|iPhone|iPod/.test(ua);
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return isClassicIOS || isIPadOS;
  }

  function isSecureOrigin() {
    if (typeof window === 'undefined') return false;
    return Boolean(
      window.isSecureContext ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1'
    );
  }

  function getNotificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission || 'default';
  }

  function getPlatformState() {
    const ios = isIOSDevice();
    const standalone = isStandaloneMode();
    const secure = isSecureOrigin();
    const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && secure;
    const notifSupported = typeof window !== 'undefined' && 'Notification' in window;
    const pushSupported = swSupported && typeof window !== 'undefined' && 'PushManager' in window && notifSupported;
    const permission = notifSupported ? getNotificationPermission() : 'unsupported';

    return {
      isIOS: ios,
      isStandalone: standalone,
      isSecureContext: secure,
      swSupported: swSupported,
      notifSupported: notifSupported,
      pushSupported: pushSupported,
      permission: permission,
      needsIosInstall: ios && !standalone,
      canPromptInstall: Boolean(deferredInstallPrompt)
    };
  }

  // IndexedDB audio storage (keeps audio binaries out of localStorage).
  function openAudioDB() {
    if (audioDbPromise) return audioDbPromise;

    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB tidak didukung di browser ini.'));
    }

    audioDbPromise = new Promise((resolve, reject) => {
      let request;
      try {
        request = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);
      } catch (err) {
        audioDbPromise = null;
        reject(err);
        return;
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
          db.createObjectStore(AUDIO_STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        db.onclose = () => {
          audioDbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        audioDbPromise = null;
        reject(request.error || new Error('Gagal membuka penyimpanan audio.'));
      };
    });

    return audioDbPromise;
  }

  async function saveAudioBlob(key, blob, meta = {}) {
    const db = await openAudioDB();
    const record = {
      key: key,
      blob: blob,
      name: meta.name || '',
      type: (blob && blob.type) || meta.type || 'audio/mpeg',
      duration: Number(meta.duration) || 0,
      updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUDIO_STORE_NAME);
      store.put(record);
      tx.oncomplete = () => {
        audioAvailability[key] = true;
        resolve(record);
      };
      tx.onerror = () => reject(tx.error || new Error('Gagal menyimpan file audio.'));
    });
  }

  async function getAudioBlob(key) {
    try {
      const db = await openAudioDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(AUDIO_STORE_NAME, 'readonly');
        const store = tx.objectStore(AUDIO_STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          const result = req.result || null;
          audioAvailability[key] = Boolean(result && result.blob);
          resolve(result);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      audioAvailability[key] = false;
      return null;
    }
  }

  async function deleteAudioBlob(key) {
    try {
      const db = await openAudioDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
        const store = tx.objectStore(AUDIO_STORE_NAME);
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      // Ignore if IndexedDB is blocked in private mode.
    }
    audioAvailability[key] = false;
  }

  async function clearAllAudio() {
    try {
      const db = await openAudioDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
        const store = tx.objectStore(AUDIO_STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      // Ignore if IndexedDB is unavailable.
    }
    audioAvailability[AUDIO_KEY_UPLOAD] = false;
    audioAvailability[AUDIO_KEY_VOICE] = false;
  }

  async function syncAudioAvailabilityFromDB() {
    const [uploadRec, voiceRec] = await Promise.all([
      getAudioBlob(AUDIO_KEY_UPLOAD),
      getAudioBlob(AUDIO_KEY_VOICE)
    ]);

    const config = getSettings();
    const updates = {};

    if (!uploadRec && config.customAudioName) {
      updates.customAudioName = '';
      if (config.soundType === AUDIO_KEY_UPLOAD) updates.soundType = 'default';
    } else if (uploadRec && !config.customAudioName && uploadRec.name) {
      updates.customAudioName = uploadRec.name;
    }

    if (!voiceRec && config.customVoiceName) {
      updates.customVoiceName = '';
      updates.customVoiceDuration = 0;
      if (config.soundType === AUDIO_KEY_VOICE) updates.soundType = 'default';
    } else if (voiceRec && !config.customVoiceName && voiceRec.name) {
      updates.customVoiceName = voiceRec.name;
      updates.customVoiceDuration = voiceRec.duration || 0;
    }

    if (Object.keys(updates).length > 0) {
      saveSettings(updates);
    }

    renderSoundUI(getSettings());
  }

  function isValidAudioFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith('audio/')) return true;
    const lowerName = (file.name || '').toLowerCase();
    return ALLOWED_AUDIO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  }

  function probeAudioDuration(blob) {
    return new Promise((resolve) => {
      if (typeof Audio === 'undefined' || !blob) {
        resolve(0);
        return;
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      let settled = false;

      const finish = (seconds) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        audio.removeAttribute('src');
        resolve(isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0);
      };

      const timeout = setTimeout(() => finish(0), 2500);
      audio.onloadedmetadata = () => {
        clearTimeout(timeout);
        finish(audio.duration);
      };
      audio.onerror = () => {
        clearTimeout(timeout);
        finish(0);
      };
      audio.preload = 'metadata';
      audio.src = url;
    });
  }

  // Web Audio API synthesized default ringtones (100% offline, zero external files).
  function clearPreviewButtonHighlight() {
    if (activePreviewBtnTimerId) {
      clearTimeout(activePreviewBtnTimerId);
      activePreviewBtnTimerId = null;
    }
    if (activePreviewBtn) {
      activePreviewBtn.classList.remove('is-playing');
      activePreviewBtn = null;
    }
  }

  function highlightPreviewButton(btn, durationMs = 1000) {
    clearPreviewButtonHighlight();
    if (!btn) return;
    activePreviewBtn = btn;
    btn.classList.add('is-playing');
    activePreviewBtnTimerId = setTimeout(() => {
      clearPreviewButtonHighlight();
    }, durationMs);
  }

  function stopAudioPlayback() {
    clearPreviewButtonHighlight();
    if (activeAudioElement) {
      try {
        activeAudioElement.pause();
        activeAudioElement.currentTime = 0;
      } catch (err) {
        // Ignore media reset errors.
      }
      activeAudioElement = null;
    }
    if (activeAudioObjectUrl) {
      URL.revokeObjectURL(activeAudioObjectUrl);
      activeAudioObjectUrl = null;
    }
  }

  async function getUnlockedAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!sharedAudioContext) {
      sharedAudioContext = new AudioCtx();
    }
    if (sharedAudioContext.state === 'suspended') {
      try {
        await sharedAudioContext.resume();
      } catch (err) {
        return null;
      }
    }
    return sharedAudioContext.state === 'running' ? sharedAudioContext : null;
  }

  // Keep Web Audio session alive in background during delayed test push so custom/app ringtone can play while minimized or screen-locked.
  let keepAliveOscillator = null;
  let keepAliveStopTimer = null;
  let pendingRingtoneOnWake = false;

  function stopSilentAudioKeepAlive() {
    if (keepAliveStopTimer) {
      clearTimeout(keepAliveStopTimer);
      keepAliveStopTimer = null;
    }
    if (keepAliveOscillator) {
      try {
        keepAliveOscillator.stop();
        keepAliveOscillator.disconnect();
      } catch (err) {
        // Ignore already stopped oscillator.
      }
      keepAliveOscillator = null;
    }
  }

  async function startSilentAudioKeepAlive(durationSeconds = 22) {
    stopSilentAudioKeepAlive();
    const ctx = await getUnlockedAudioContext();
    if (!ctx) return false;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1, ctx.currentTime);
      gain.gain.setValueAtTime(0.00001, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      keepAliveOscillator = osc;
      keepAliveStopTimer = setTimeout(() => {
        stopSilentAudioKeepAlive();
      }, Math.max(5, durationSeconds) * 1000);
      return true;
    } catch (err) {
      return false;
    }
  }

  function scheduleToneNote(ctx, opts) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = opts.startTime;
    const duration = opts.duration;
    const peak = opts.peakGain || 0.2;

    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freqStart, start);
    if (opts.freqEnd && opts.freqEnd !== opts.freqStart) {
      osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, start + (opts.glideTime || duration * 0.45));
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + Math.min(0.025, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  async function playDefaultTone(soundId = 'water-drop') {
    stopAudioPlayback();
    const ctx = await getUnlockedAudioContext();
    if (!ctx) return false;

    const now = ctx.currentTime + 0.02;
    const tone = VALID_DEFAULT_SOUNDS.has(soundId) ? soundId : 'water-drop';

    if (tone === 'water-drop') {
      // Rising water-droplet chirp followed by light crystalline arpeggio.
      scheduleToneNote(ctx, { type: 'sine', freqStart: 480, freqEnd: 940, glideTime: 0.08, startTime: now, duration: 0.14, peakGain: 0.22 });
      scheduleToneNote(ctx, { type: 'sine', freqStart: 659.25, startTime: now + 0.16, duration: 0.26, peakGain: 0.16 });
      scheduleToneNote(ctx, { type: 'triangle', freqStart: 783.99, startTime: now + 0.28, duration: 0.3, peakGain: 0.14 });
      scheduleToneNote(ctx, { type: 'sine', freqStart: 1046.5, startTime: now + 0.41, duration: 0.45, peakGain: 0.18 });
      return true;
    }

    if (tone === 'soft-bell') {
      scheduleToneNote(ctx, { type: 'sine', freqStart: 587.33, startTime: now, duration: 0.85, peakGain: 0.2 });
      scheduleToneNote(ctx, { type: 'triangle', freqStart: 1174.66, startTime: now, duration: 0.5, peakGain: 0.06 });
      scheduleToneNote(ctx, { type: 'sine', freqStart: 880.0, startTime: now + 0.34, duration: 0.95, peakGain: 0.18 });
      scheduleToneNote(ctx, { type: 'triangle', freqStart: 1760.0, startTime: now + 0.34, duration: 0.48, peakGain: 0.05 });
      return true;
    }

    if (tone === 'fresh-chime') {
      scheduleToneNote(ctx, { type: 'triangle', freqStart: 659.25, startTime: now, duration: 0.34, peakGain: 0.16 });
      scheduleToneNote(ctx, { type: 'sine', freqStart: 987.77, startTime: now + 0.14, duration: 0.42, peakGain: 0.18 });
      scheduleToneNote(ctx, { type: 'sine', freqStart: 1318.51, startTime: now + 0.29, duration: 0.62, peakGain: 0.16 });
      return true;
    }

    // gentle-pulse
    scheduleToneNote(ctx, { type: 'sine', freqStart: 440.0, startTime: now, duration: 0.28, peakGain: 0.17 });
    scheduleToneNote(ctx, { type: 'sine', freqStart: 554.37, startTime: now + 0.04, duration: 0.26, peakGain: 0.1 });
    scheduleToneNote(ctx, { type: 'sine', freqStart: 440.0, startTime: now + 0.38, duration: 0.34, peakGain: 0.17 });
    scheduleToneNote(ctx, { type: 'sine', freqStart: 554.37, startTime: now + 0.42, duration: 0.32, peakGain: 0.1 });
    return true;
  }

  async function playStoredAudio(key) {
    stopAudioPlayback();
    const record = await getAudioBlob(key);
    if (!record || !record.blob) {
      return { ok: false, reason: 'missing' };
    }

    const url = URL.createObjectURL(record.blob);
    const audio = new Audio(url);
    activeAudioElement = audio;
    activeAudioObjectUrl = url;

    const cleanup = () => {
      if (activeAudioObjectUrl === url) {
        URL.revokeObjectURL(url);
        activeAudioObjectUrl = null;
      }
      if (activeAudioElement === audio) {
        activeAudioElement = null;
      }
    };

    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });

    try {
      await audio.play();
      return { ok: true };
    } catch (err) {
      cleanup();
      const reason = err && err.name === 'NotAllowedError' ? 'autoplay' : 'error';
      return { ok: false, reason: reason };
    }
  }

  async function playSelectedSound(options = {}) {
    const config = options.config || getSettings();
    const dedupeMs = Number(options.dedupeMs) || 0;

    // Mode Default menggunakan nada notifikasi bawaan sistem perangkat (tanpa Web Audio buatan).
    if (config.soundType !== AUDIO_KEY_UPLOAD) return false;
    if (dedupeMs > 0 && (Date.now() - lastSoundPlayedAt) < dedupeMs) return false;

    const markPlayed = (ok) => {
      if (ok) lastSoundPlayedAt = Date.now();
      return ok;
    };

    const res = await playStoredAudio(AUDIO_KEY_UPLOAD);
    if (res.ok) return markPlayed(true);
    return false;
  }

  async function playSoundWithRetryOnGesture(options = {}) {
    stopSilentAudioKeepAlive();
    const config = options.config || getSettings();
    if (config.soundType !== AUDIO_KEY_UPLOAD) {
      pendingRingtoneOnWake = false;
      return false;
    }

    const played = await playSelectedSound(options);
    if (played) {
      pendingRingtoneOnWake = false;
      return true;
    }

    // If browser suspended audio in background, queue immediate playback on wake or next touch.
    pendingRingtoneOnWake = true;
    const retryOnce = async () => {
      if (!pendingRingtoneOnWake) return;
      const ok = await playSelectedSound({ dedupeMs: 1500 });
      if (ok) pendingRingtoneOnWake = false;
    };
    window.addEventListener('pointerdown', retryOnce, { once: true });
    window.addEventListener('touchstart', retryOnce, { once: true });
    window.addEventListener('keydown', retryOnce, { once: true });
    return false;
  }

  // MediaRecorder voice recorder (max 15 seconds, stored in IndexedDB).
  function pickSupportedRecorderMimeType() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/aac'
    ];
    for (let i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i])) {
        return candidates[i];
      }
    }
    return '';
  }

  function releaseMicStream() {
    if (activeMicStream) {
      activeMicStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          // Ignore track stop errors.
        }
      });
      activeMicStream = null;
    }
  }

  function updateVoiceRecorderControls(elapsedSeconds, statusMessage) {
    const btn = document.getElementById('btnToggleVoiceRecord');
    const timerEl = document.getElementById('voiceRecordTimer');
    const statusEl = document.getElementById('voiceRecordStatus');

    if (btn) {
      btn.classList.toggle('is-recording', isRecordingVoice);
      btn.setAttribute('aria-pressed', isRecordingVoice ? 'true' : 'false');
      btn.innerHTML = isRecordingVoice
        ? '<i class="ri-stop-circle-fill" aria-hidden="true"></i><span>Hentikan Rekaman</span>'
        : '<i class="ri-mic-fill" aria-hidden="true"></i><span>Mulai Rekam Suara</span>';
    }

    if (timerEl) {
      timerEl.textContent = `${formatDurationMMSS(elapsedSeconds)} / ${formatDurationMMSS(MAX_VOICE_SECONDS)}`;
    }

    if (statusEl && typeof statusMessage === 'string') {
      statusEl.textContent = statusMessage;
    }
  }

  function stopVoiceRecording() {
    if (recordingTimerId) {
      clearInterval(recordingTimerId);
      recordingTimerId = null;
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (err) {
        isRecordingVoice = false;
        releaseMicStream();
        updateVoiceRecorderControls(0, 'Rekaman dihentikan.');
      }
    } else {
      isRecordingVoice = false;
      releaseMicStream();
    }
  }

  async function startVoiceRecording() {
    if (isRecordingVoice || isStartingVoice) return;

    stopAudioPlayback();

    if (!isSecureOrigin()) {
      const msg = 'Perekam suara membutuhkan koneksi aman (HTTPS atau localhost).';
      updateVoiceRecorderControls(0, msg);
      showToastSafe(msg, 'warning');
      return;
    }

    const canRecord = Boolean(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined'
    );

    if (!canRecord) {
      const msg = 'Browser ini belum mendukung perekaman suara langsung. Kamu bisa unggah file audio sebagai gantinya.';
      updateVoiceRecorderControls(0, msg);
      showToastSafe(msg, 'warning');
      return;
    }

    isStartingVoice = true;
    updateVoiceRecorderControls(0, 'Meminta izin mikrofon...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      activeMicStream = stream;
      recordingChunks = [];

      const mimeType = pickSupportedRecorderMimeType();
      const recorderOptions = mimeType ? { mimeType } : undefined;
      mediaRecorder = new MediaRecorder(stream, recorderOptions);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunks.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        isRecordingVoice = false;
        if (recordingTimerId) {
          clearInterval(recordingTimerId);
          recordingTimerId = null;
        }
        releaseMicStream();
        updateVoiceRecorderControls(0, 'Terjadi kesalahan saat merekam suara. Coba ulangi.');
        showToastSafe('Gagal merekam suara.', 'danger');
      };

      mediaRecorder.onstop = async () => {
        const elapsed = Math.min(MAX_VOICE_SECONDS, Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000)));
        isRecordingVoice = false;
        if (recordingTimerId) {
          clearInterval(recordingTimerId);
          recordingTimerId = null;
        }
        releaseMicStream();

        const resolvedType = (mediaRecorder && mediaRecorder.mimeType) || mimeType || 'audio/webm';
        const blob = new Blob(recordingChunks, { type: resolvedType });
        recordingChunks = [];
        mediaRecorder = null;

        if (!blob || blob.size === 0) {
          updateVoiceRecorderControls(0, 'Rekaman kosong. Coba rekam minimal 1 detik.');
          return;
        }

        const label = `Rekaman Suara (${formatDurationMMSS(elapsed)})`;
        try {
          await saveAudioBlob(AUDIO_KEY_VOICE, blob, {
            name: label,
            type: resolvedType,
            duration: elapsed
          });
          saveSettings({
            soundType: AUDIO_KEY_VOICE,
            customVoiceName: label,
            customVoiceDuration: elapsed
          });
          queueScheduleSyncToServer();
          updateVoiceRecorderControls(elapsed, 'Rekaman suara tersimpan dan aktif sebagai nada pengingat.');
          renderSettingsUI();
          showToastSafe('Rekaman suara berhasil disimpan.', 'success');
        } catch (saveErr) {
          updateVoiceRecorderControls(0, 'Gagal menyimpan rekaman suara ke penyimpanan browser.');
          showToastSafe('Gagal menyimpan rekaman suara.', 'danger');
        }
      };

      recordingStartedAt = Date.now();
      isRecordingVoice = true;
      mediaRecorder.start(250);
      updateVoiceRecorderControls(0, 'Sedang merekam... Ketuk tombol lagi untuk berhenti (maks. 15 detik).');

      recordingTimerId = setInterval(() => {
        const secs = (Date.now() - recordingStartedAt) / 1000;
        if (secs >= MAX_VOICE_SECONDS) {
          updateVoiceRecorderControls(MAX_VOICE_SECONDS, 'Batas 15 detik tercapai, menyimpan rekaman...');
          stopVoiceRecording();
          return;
        }
        updateVoiceRecorderControls(Math.floor(secs));
      }, 200);
    } catch (err) {
      releaseMicStream();
      isRecordingVoice = false;
      let errMsg = 'Gagal mengakses mikrofon. Pastikan izin mikrofon aktif.';
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        errMsg = 'Izin mikrofon ditolak. Aktifkan izin mikrofon di pengaturan browser untuk merekam suara.';
      } else if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
        errMsg = 'Mikrofon tidak ditemukan pada perangkat ini.';
      } else if (err && err.name === 'NotReadableError') {
        errMsg = 'Mikrofon sedang dipakai aplikasi lain. Tutup aplikasi lain lalu coba lagi.';
      }
      updateVoiceRecorderControls(0, errMsg);
      showToastSafe(errMsg, 'danger');
    } finally {
      isStartingVoice = false;
    }
  }

  function toggleVoiceRecording() {
    if (isRecordingVoice) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  }

  // Zero-token dynamic Indonesian hydration reminder generator using live Storage stats.
  function buildReminderMessage(nowDate = new Date()) {
    const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
    const hour = now.getHours();
    const appSettings = safeGetAppSettings();
    const rawName = (appSettings.userName || '').trim();
    const hasPersonalName = rawName.length > 0 && rawName.toLowerCase() !== 'pengguna';
    const nameComma = hasPersonalName ? `, ${rawName}` : '';
    const dailyGoal = Number(appSettings.dailyGoal) || 2000;
    const todayTotal = safeGetTodayTotal();
    const remaining = safeGetTodayRemaining();
    const percentage = safeGetTodayPercentage();

    let period = 'malam';
    let greeting = 'Selamat malam';
    if (hour >= 4 && hour < 11) {
      period = 'pagi';
      greeting = 'Selamat pagi';
    } else if (hour >= 11 && hour < 15) {
      period = 'siang';
      greeting = 'Selamat siang';
    } else if (hour >= 15 && hour < 19) {
      period = 'sore';
      greeting = 'Selamat sore';
    }

    const totalText = formatMl(todayTotal);
    const goalText = formatMl(dailyGoal);
    const remText = formatMl(remaining);
    const variantSeed = hour + Math.floor(now.getMinutes() / 15);

    let title = `Waktunya Minum Air${nameComma}`;
    let body = '';

    if (percentage >= 100) {
      title = `Target Hidrasi Tercapai${nameComma}`;
      const doneOptions = [
        `${greeting}${nameComma}. Asupan airmu hari ini sudah mencapai ${totalText} dari target ${goalText} (${percentage}%). Pertahankan kebiasaan baik ini.`,
        `Kerja bagus${nameComma}. Catatan minummu hari ini sudah ${totalText} (${percentage}%), target harian ${goalText} terpenuhi.`
      ];
      body = doneOptions[variantSeed % doneOptions.length];
    } else if (todayTotal === 0) {
      const startTitles = {
        pagi: `Awali Pagi dengan Air Putih${nameComma}`,
        siang: `Belum Ada Catatan Minum${nameComma}`,
        sore: `Yuk Mulai Catat Minum${nameComma}`,
        malam: `Jangan Lupa Minum Air${nameComma}`
      };
      title = startTitles[period];
      const zeroOptions = [
        `${greeting}${nameComma}. Hari ini belum ada catatan minum. Mulai dari segelas air sekarang menuju target ${goalText}.`,
        `${greeting}${nameComma}. Asupan airmu masih 0 ml hari ini. Ambil segelas air dulu agar tubuh tetap segar mengejar target ${goalText}.`
      ];
      body = zeroOptions[variantSeed % zeroOptions.length];
    } else if (percentage < 40) {
      const earlyOptions = [
        `${greeting}${nameComma}. Asupan airmu baru ${totalText} (${percentage}%). Masih tersisa ${remText} untuk mencapai target ${goalText}.`,
        `Rehat sebentar untuk minum${nameComma}. Catatan hari ini ${totalText} (${percentage}%), kurang ${remText} lagi dari target ${goalText}.`
      ];
      body = earlyOptions[variantSeed % earlyOptions.length];
    } else if (percentage < 80) {
      const midOptions = [
        `${greeting}${nameComma}. Progres hidrasimu sudah ${totalText} (${percentage}%). Tambah segelas air untuk mengejar sisa ${remText}.`,
        `Jaga ritme minummu${nameComma}. Hari ini sudah masuk ${totalText} (${percentage}%), tersisa ${remText} menuju target ${goalText}.`
      ];
      body = midOptions[variantSeed % midOptions.length];
    } else {
      title = `Sedikit Lagi Capai Target${nameComma}`;
      const closeOptions = [
        `${greeting}${nameComma}. Kamu sudah minum ${totalText} (${percentage}%) hari ini. Tinggal ${remText} lagi untuk menuntaskan target ${goalText}.`,
        `Hampir selesai${nameComma}. Asupan air hari ini ${totalText} (${percentage}%), cukup ${remText} lagi agar target ${goalText} terpenuhi.`
      ];
      body = closeOptions[variantSeed % closeOptions.length];
    }

    return {
      title,
      body,
      period,
      todayTotal,
      dailyGoal,
      remaining,
      percentage
    };
  }

  // Fixed & Smart schedule math.
  function parseTimeToMinutes(timeStr) {
    if (typeof timeStr !== 'string') return null;
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr.trim());
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  function minutesToTimeStr(totalMinutes) {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
    const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
    const mm = String(clamped % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function buildSlotKey(dateObj) {
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const mm = String(dateObj.getMinutes()).padStart(2, '0');
    return `${safeFormatDateKey(dateObj)} ${hh}:${mm}`;
  }

  function validateSchedule(config) {
    const startMin = parseTimeToMinutes(config.startTime);
    const endMin = parseTimeToMinutes(config.endTime);
    const interval = parseInt(config.intervalMinutes, 10);

    if (startMin === null || endMin === null) {
      return {
        valid: false,
        error: 'Format jam mulai dan jam selesai harus valid (JJ:MM).'
      };
    }

    if (startMin >= endMin) {
      return {
        valid: false,
        error: 'Jam selesai harus lebih besar daripada jam mulai.'
      };
    }

    if (isNaN(interval) || interval < 15 || interval > 480) {
      return {
        valid: false,
        error: 'Interval pengingat harus antara 15 menit hingga 8 jam (480 menit).'
      };
    }

    return {
      valid: true,
      error: '',
      startMin: startMin,
      endMin: endMin,
      intervalMinutes: interval
    };
  }

  function getTodayScheduleSlots(config = getSettings()) {
    const check = validateSchedule(config);
    if (!check.valid) return [];

    const slots = [];
    let cursor = check.startMin;
    let safety = 0;

    while (cursor <= check.endMin && safety < 100) {
      slots.push(minutesToTimeStr(cursor));
      cursor += check.intervalMinutes;
      safety += 1;
    }

    return slots;
  }

  function buildDateAtMinutes(baseDate, totalMinutes, dayOffset = 0) {
    return new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate() + dayOffset,
      Math.floor(totalMinutes / 60),
      totalMinutes % 60,
      0,
      0
    );
  }

  function computeNextReminder(config = getSettings(), nowDate = new Date()) {
    const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
    const check = validateSchedule(config);
    if (!check.valid) {
      return {
        valid: false,
        error: check.error,
        pausedByGoal: false,
        nextDate: null,
        nextSlotKey: '',
        isTomorrow: false,
        slots: [],
        lastDrinkAt: null
      };
    }

    const slots = getTodayScheduleSlots(config);
    const todayPct = safeGetTodayPercentage();
    const tomorrowStart = buildDateAtMinutes(now, check.startMin, 1);
    const todayStart = buildDateAtMinutes(now, check.startMin, 0);
    const todayEnd = buildDateAtMinutes(now, check.endMin, 0);
    const lastDrinkDate = getLatestDrinkDateToday();

    if (config.pauseWhenGoalMet && todayPct >= 100) {
      return {
        valid: true,
        error: '',
        pausedByGoal: true,
        nextDate: tomorrowStart,
        nextSlotKey: buildSlotKey(tomorrowStart),
        isTomorrow: true,
        slots: slots,
        lastDrinkAt: lastDrinkDate ? lastDrinkDate.toISOString() : null
      };
    }

    if (config.mode === 'smart' && lastDrinkDate) {
      const intervalMs = check.intervalMinutes * 60000;
      let candidate = new Date(lastDrinkDate.getTime() + intervalMs);

      while (candidate.getTime() <= now.getTime() || buildSlotKey(candidate) === config.lastNotifiedSlot) {
        candidate = new Date(candidate.getTime() + intervalMs);
      }

      if (candidate.getTime() < todayStart.getTime()) {
        candidate = todayStart;
      }

      if (candidate.getTime() <= todayEnd.getTime()) {
        return {
          valid: true,
          error: '',
          pausedByGoal: false,
          nextDate: candidate,
          nextSlotKey: buildSlotKey(candidate),
          isTomorrow: false,
          slots: slots,
          lastDrinkAt: lastDrinkDate.toISOString()
        };
      }

      return {
        valid: true,
        error: '',
        pausedByGoal: false,
        nextDate: tomorrowStart,
        nextSlotKey: buildSlotKey(tomorrowStart),
        isTomorrow: true,
        slots: slots,
        lastDrinkAt: lastDrinkDate.toISOString()
      };
    }

    for (let i = 0; i < slots.length; i++) {
      const slotMins = parseTimeToMinutes(slots[i]);
      const slotDate = buildDateAtMinutes(now, slotMins, 0);
      const slotKey = buildSlotKey(slotDate);
      if (slotDate.getTime() > now.getTime() && slotKey !== config.lastNotifiedSlot) {
        return {
          valid: true,
          error: '',
          pausedByGoal: false,
          nextDate: slotDate,
          nextSlotKey: slotKey,
          isTomorrow: false,
          slots: slots,
          lastDrinkAt: lastDrinkDate ? lastDrinkDate.toISOString() : null
        };
      }
    }

    return {
      valid: true,
      error: '',
      pausedByGoal: false,
      nextDate: tomorrowStart,
      nextSlotKey: buildSlotKey(tomorrowStart),
      isTomorrow: true,
      slots: slots,
      lastDrinkAt: lastDrinkDate ? lastDrinkDate.toISOString() : null
    };
  }

  // Local reminder scheduler (single precise setTimeout, recalculated on visibility/focus/storage).
  function clearLocalTimer() {
    if (localTimerId) {
      clearTimeout(localTimerId);
      localTimerId = null;
    }
  }

  const LAST_FIRED_LOCK_KEY = 'hydrotrack_last_notif_lock';
  let lastPushReceivedAt = 0;

  function readLastFiredLock() {
    try {
      const raw = localStorage.getItem(LAST_FIRED_LOCK_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        return { slotKey: String(parsed.slotKey || ''), at: Number(parsed.at) || 0 };
      }
    } catch (err) {
      // Ignore storage access errors.
    }
    return { slotKey: '', at: 0 };
  }

  function recordLastFiredLock(slotKey, atMs = Date.now()) {
    try {
      localStorage.setItem(LAST_FIRED_LOCK_KEY, JSON.stringify({
        slotKey: String(slotKey || ''),
        at: Number(atMs) || Date.now()
      }));
    } catch (err) {
      // Ignore storage quota errors.
    }
  }

  async function handleLocalTimerFire(expectedSlotKey, expectedFireMs, isPushFallback = false) {
    localTimerId = null;
    const config = getSettings();
    if (!config.enabled) return;

    const nowMs = Date.now();

    // If timer was frozen while the app was closed (> 15s overdue), do NOT pop up a late surprise notification on app reopen.
    if (expectedFireMs && (nowMs - expectedFireMs) > 15000) {
      scheduleLocalTimer();
      renderSettingsUI();
      return;
    }

    if (config.pauseWhenGoalMet && safeGetTodayPercentage() >= 100) {
      scheduleLocalTimer();
      renderSettingsUI();
      return;
    }

    // If Push Server already delivered a notification in the last 3 minutes, skip local fallback to prevent duplicates.
    if (isPushFallback && lastPushReceivedAt && (nowMs - lastPushReceivedAt) < 180000) {
      saveSettings({ lastNotifiedSlot: expectedSlotKey || buildSlotKey(new Date()) });
      scheduleLocalTimer();
      renderSettingsUI();
      return;
    }

    const lock = readLastFiredLock();
    if (
      (expectedSlotKey && config.lastNotifiedSlot === expectedSlotKey) ||
      (expectedSlotKey && lock.slotKey === expectedSlotKey && (nowMs - lock.at) < 10 * 60000) ||
      (lock.at && (nowMs - lock.at) < 55000)
    ) {
      scheduleLocalTimer();
      return;
    }

    if (getNotificationPermission() === 'granted') {
      const slot = expectedSlotKey || buildSlotKey(new Date());
      recordLastFiredLock(slot, nowMs);
      saveSettings({ lastNotifiedSlot: slot });
      await showHydroNotification({ isTest: false, playAudio: true, slotKey: slot });
    }

    scheduleLocalTimer();
    renderSettingsUI();
  }

  function scheduleLocalTimer() {
    clearLocalTimer();
    const config = getSettings();
    if (!config.enabled) {
      if (config.lastScheduledAt !== null) {
        saveSettings({ lastScheduledAt: null });
      }
      return null;
    }

    const next = computeNextReminder(config, new Date());
    if (!next.valid || !next.nextDate) {
      saveSettings({ lastScheduledAt: null });
      return null;
    }

    saveSettings({ lastScheduledAt: next.nextDate.toISOString() });

    if (next.pausedByGoal) {
      // Wait until tomorrow's startTime to re-evaluate once the new day starts.
      const waitUntilTomorrow = Math.max(5000, next.nextDate.getTime() - Date.now());
      localTimerId = setTimeout(() => {
        scheduleLocalTimer();
        renderSettingsUI();
      }, Math.min(waitUntilTomorrow, 2147483647));
      return next;
    }

    // When Push Server is actively connected and online, delay local timer by 90s as a pure fallback so server push and local timer never collide.
    const isPushActive = Boolean(config.pushConnected && config.pushServerUrl && navigator.onLine !== false);
    const fallbackGraceMs = isPushActive ? 90000 : 0;
    const targetMs = next.nextDate.getTime() + fallbackGraceMs;
    const delayMs = Math.max(1000, targetMs - Date.now());
    localTimerId = setTimeout(() => {
      handleLocalTimerFire(next.nextSlotKey, targetMs, isPushActive);
    }, Math.min(delayMs, 2147483647));

    return next;
  }

  // Recalculate next timer cleanly on wake without firing late frozen notifications when the user opens the app.
  function reconcileTimerOnWake() {
    if (pendingRingtoneOnWake) {
      playSelectedSound({ dedupeMs: 1500 }).then((ok) => {
        if (ok) pendingRingtoneOnWake = false;
      });
    }
    const config = getSettings();
    if (!config.enabled) return;

    scheduleLocalTimer();
    renderSettingsUI();
  }

  // Notification display via Service Worker (required on Android Chrome) with clean fallback.
  async function showHydroNotification(options = {}) {
    const permission = getNotificationPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: permission };
    }

    const config = getSettings();
    const msg = options.message || buildReminderMessage(new Date());
    const title = options.title || msg.title;
    const body = options.body || msg.body;
    const isTest = Boolean(options.isTest);
    const isSilent = false;
    const targetUrl = options.url || (isTest ? './pengaturan.html?from=notification' : './index.html?from=notification');
    const payload = {
      title: title,
      body: body,
      tag: options.tag || (isTest ? 'hydrotrack-test' : 'hydrotrack-reminder'),
      url: targetUrl,
      isTest: isTest,
      slotKey: options.slotKey || '',
      silent: isSilent,
      sentAt: Date.now()
    };

    let shown = false;

    const reg = await ensureServiceWorker();
    if (reg && typeof reg.showNotification === 'function') {
      try {
        const notifOpts = {
          body: payload.body,
          icon: './img/icon-192.png',
          badge: './img/icon-192.png',
          tag: payload.tag,
          renotify: true,
          requireInteraction: false,
          silent: isSilent,
          data: {
            url: payload.url,
            isTest: isTest,
            sentAt: payload.sentAt
          },
          actions: [
            { action: 'open', title: 'Catat Minum' },
            { action: 'dismiss', title: 'Nanti' }
          ]
        };
        if (!isSilent) {
          notifOpts.vibrate = [180, 90, 180];
        }
        await reg.showNotification(payload.title, notifOpts);
        shown = true;
      } catch (err) {
        shown = false;
      }
    }

    if (!shown && navigator.serviceWorker && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_LOCAL_NOTIFICATION',
          payload: payload
        });
        shown = true;
      } catch (err) {
        shown = false;
      }
    }

    if (!shown && typeof Notification === 'function') {
      try {
        new Notification(payload.title, {
          body: payload.body,
          icon: './img/icon-192.png',
          tag: payload.tag,
          silent: isSilent
        });
        shown = true;
      } catch (err) {
        return { ok: false, reason: 'display-failed', error: err };
      }
    }

    if (shown && options.playAudio !== false) {
      await playSelectedSound({ config, dedupeMs: 3000 });
    }

    return { ok: shown, message: msg };
  }

  // Service Worker registration and Web Push (Cloudflare Worker) integration.
  async function ensureServiceWorker() {
    const state = getPlatformState();
    if (!state.swSupported) return null;

    if (swRegistration && swRegistration.active) {
      return swRegistration;
    }

    try {
      swRegistration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none'
      });
      swRegistration.update().catch(() => {});
      const readyReg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(() => resolve(swRegistration), 3000))
      ]);
      swRegistration = readyReg || swRegistration;
      return swRegistration;
    } catch (err) {
      console.warn('Service Worker tidak dapat didaftarkan:', err);
      return null;
    }
  }

  function normalizePushServerUrl(raw) {
    const trimmed = String(raw || '').trim().replace(/\/+$/, '');
    if (!trimmed) return { valid: true, url: '' };

    try {
      const parsed = new URL(trimmed);
      const isHttps = parsed.protocol === 'https:';
      const isLocal = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
      if (!isHttps && !isLocal) {
        return {
          valid: false,
          url: '',
          error: 'URL Push Server harus menggunakan https:// (atau http://localhost untuk uji lokal).'
        };
      }
      return { valid: true, url: trimmed };
    } catch (err) {
      return {
        valid: false,
        url: '',
        error: 'Format URL Push Server tidak valid. Contoh: https://hydrotrack-push.namamu.workers.dev'
      };
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const clean = String(base64String || '').trim();
    const padding = '='.repeat((4 - (clean.length % 4)) % 4);
    const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function uint8ArraysEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller ? controller.signal : undefined
      });
      return response;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function buildPushPayload(subscription, config = getSettings()) {
    const appSettings = safeGetAppSettings();
    let timeZone = 'Asia/Jakarta';
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone;
    } catch (err) {
      // Keep default timezone fallback.
    }

    const lastDrink = getLatestDrinkDateToday();
    const subJson = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
    const soundLabel = config.soundType === AUDIO_KEY_UPLOAD ? 'custom-upload' : 'default';

    return {
      subscription: subJson,
      schedule: {
        enabled: Boolean(config.enabled),
        mode: config.mode === 'smart' ? 'smart' : 'fixed',
        startTime: config.startTime,
        endTime: config.endTime,
        intervalMinutes: config.intervalMinutes,
        pauseWhenGoalMet: Boolean(config.pauseWhenGoalMet),
        soundLabel: soundLabel,
        timeZone: timeZone,
        timezoneOffsetMinutes: new Date().getTimezoneOffset()
      },
      profile: {
        userName: appSettings.userName || 'Pengguna',
        dailyGoal: Number(appSettings.dailyGoal) || 2000,
        todayTotal: safeGetTodayTotal(),
        todayDate: safeFormatDateKey(new Date()),
        lastDrinkAt: lastDrink ? lastDrink.toISOString() : null
      }
    };
  }

  async function getActivePushSubscription() {
    const reg = await ensureServiceWorker();
    if (!reg || !reg.pushManager) return null;
    try {
      return await reg.pushManager.getSubscription();
    } catch (err) {
      return null;
    }
  }

  async function requestPermission() {
    const state = getPlatformState();
    if (state.needsIosInstall) {
      renderSettingsUI();
      showToastSafe('Instal HydroTrack ke Layar Utama terlebih dahulu agar notifikasi aktif di iOS.', 'warning');
      return 'unsupported';
    }

    if (!state.notifSupported) {
      renderSettingsUI();
      showToastSafe('Browser ini tidak mendukung notifikasi web.', 'warning');
      return 'unsupported';
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      renderSettingsUI();
      showToastSafe('Izin notifikasi diblokir. Aktifkan lewat pengaturan situs di browsermu.', 'warning');
      return 'denied';
    }

    try {
      const result = await Notification.requestPermission();
      renderSettingsUI();
      return result;
    } catch (err) {
      return getNotificationPermission();
    }
  }

  async function connectAndSubscribePush(rawServerUrl, options = {}) {
    const normalized = normalizePushServerUrl(rawServerUrl);
    if (!normalized.valid) {
      lastPushErrorMessage = normalized.error;
      saveSettings({ pushConnected: false });
      renderSettingsUI();
      return { ok: false, error: normalized.error };
    }

    const serverUrl = normalized.url;
    if (!serverUrl) {
      await unsubscribePush();
      saveSettings({ pushServerUrl: '', pushConnected: false });
      lastPushErrorMessage = '';
      renderSettingsUI();
      return { ok: true, disconnected: true };
    }

    saveSettings({ pushServerUrl: serverUrl });

    const state = getPlatformState();
    if (state.needsIosInstall) {
      const msg = 'Di iPhone/iPad, instal HydroTrack ke Layar Utama terlebih dahulu agar Web Push background bekerja.';
      lastPushErrorMessage = msg;
      saveSettings({ pushConnected: false });
      renderSettingsUI();
      return { ok: false, error: msg };
    }

    if (!state.pushSupported) {
      const msg = state.isSecureContext
        ? 'Browser ini belum mendukung Web Push background. Pengingat tetap berjalan lokal saat aplikasi terbuka.'
        : 'Web Push membutuhkan HTTPS (misalnya saat dibuka di Vercel).';
      lastPushErrorMessage = msg;
      saveSettings({ pushConnected: false });
      renderSettingsUI();
      return { ok: false, error: msg };
    }

    let permission = getNotificationPermission();
    if (permission === 'default' && options.requestPermission !== false) {
      permission = await requestPermission();
    }

    if (permission !== 'granted') {
      const msg = permission === 'denied'
        ? 'Izin notifikasi diblokir browser. Buka pengaturan izin situs untuk mengaktifkannya.'
        : 'Izinkan notifikasi terlebih dahulu untuk menghubungkan Push Server.';
      lastPushErrorMessage = msg;
      saveSettings({ pushConnected: false });
      renderSettingsUI();
      return { ok: false, error: msg };
    }

    const reg = await ensureServiceWorker();
    if (!reg || !reg.pushManager) {
      const msg = 'Service Worker belum aktif. Coba muat ulang halaman lalu ketuk Coba Ulang.';
      lastPushErrorMessage = msg;
      saveSettings({ pushConnected: false });
      renderSettingsUI();
      return { ok: false, error: msg };
    }

    try {
      const keyRes = await fetchWithTimeout(`${serverUrl}/vapid-public-key`, {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain' }
      });

      if (!keyRes.ok) {
        throw new Error(`Server membalas status ${keyRes.status} saat mengambil kunci VAPID.`);
      }

      const contentType = keyRes.headers.get('content-type') || '';
      let vapidKey = '';
      if (contentType.includes('application/json')) {
        const keyData = await keyRes.json();
        vapidKey = keyData.publicKey || keyData.vapidPublicKey || '';
      } else {
        vapidKey = (await keyRes.text()).trim();
      }

      if (!vapidKey) {
        throw new Error('Kunci publik VAPID dari server kosong.');
      }

      const appServerKey = urlBase64ToUint8Array(vapidKey);
      let subscription = await reg.pushManager.getSubscription();

      // Re-subscribe cleanly if Worker VAPID keys changed to avoid InvalidStateError.
      if (subscription && subscription.options && subscription.options.applicationServerKey) {
        const existingBytes = new Uint8Array(subscription.options.applicationServerKey);
        if (!uint8ArraysEqual(existingBytes, appServerKey)) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }

      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey
        });
      }

      const config = getSettings();
      const payload = buildPushPayload(subscription, config);
      const subRes = await fetchWithTimeout(`${serverUrl}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!subRes.ok) {
        throw new Error(`Gagal mendaftarkan langganan push (HTTP ${subRes.status}).`);
      }

      lastPushErrorMessage = '';
      saveSettings({ pushServerUrl: serverUrl, pushConnected: true });
      renderSettingsUI();
      return { ok: true, subscription: subscription };
    } catch (err) {
      const readable = err && err.name === 'AbortError'
        ? 'Koneksi ke Push Server melebihi batas waktu. Periksa URL Worker dan koneksi internetmu.'
        : (err && err.message ? err.message : 'Gagal terhubung ke Push Server. Pengingat lokal tetap aktif sebagai cadangan.');
      lastPushErrorMessage = readable;
      saveSettings({ pushServerUrl: serverUrl, pushConnected: false });
      renderSettingsUI();
      return { ok: false, error: readable };
    }
  }

  async function unsubscribePush(explicitUrl) {
    const config = getSettings();
    const serverUrl = explicitUrl || config.pushServerUrl;
    const subscription = await getActivePushSubscription();

    if (serverUrl && subscription) {
      try {
        await fetchWithTimeout(`${serverUrl}/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            subscription: typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription
          })
        }, 6000);
      } catch (err) {
        // Offline or unreachable server should not block local unsubscribe.
      }
    }

    if (subscription) {
      try {
        await subscription.unsubscribe();
      } catch (err) {
        // Ignore browser unsubscribe errors.
      }
    }

    saveSettings({ pushConnected: false });
    renderSettingsUI();
  }

  let pendingScheduleSyncFn = null;
  let pendingProgressSyncFn = null;

  function flushPendingServerSyncs() {
    if (syncScheduleDebounceId && typeof pendingScheduleSyncFn === 'function') {
      clearTimeout(syncScheduleDebounceId);
      syncScheduleDebounceId = null;
      const fn = pendingScheduleSyncFn;
      pendingScheduleSyncFn = null;
      fn();
    }
    if (syncProgressDebounceId && typeof pendingProgressSyncFn === 'function') {
      clearTimeout(syncProgressDebounceId);
      syncProgressDebounceId = null;
      const fn = pendingProgressSyncFn;
      pendingProgressSyncFn = null;
      fn();
    }
  }

  function queueScheduleSyncToServer(options = {}) {
    const config = getSettings();
    const serverUrl = config.pushServerUrl || DEFAULT_PUSH_SERVER_URL;
    if (!serverUrl) return;

    if (syncScheduleDebounceId) {
      clearTimeout(syncScheduleDebounceId);
      syncScheduleDebounceId = null;
    }

    const executeSync = async () => {
      pendingScheduleSyncFn = null;
      const latest = getSettings();
      const targetUrl = latest.pushServerUrl || DEFAULT_PUSH_SERVER_URL;
      if (!targetUrl) return;

      let subscription = await getActivePushSubscription();
      if ((!latest.pushConnected || !subscription) && getNotificationPermission() === 'granted') {
        const connected = await connectAndSubscribePush(targetUrl, { requestPermission: false });
        if (connected.ok) return;
        subscription = await getActivePushSubscription();
      }
      if (!subscription) return;

      try {
        const res = await fetchWithTimeout(`${targetUrl}/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify(buildPushPayload(subscription, latest))
        }, 8000);

        if (!res.ok) {
          lastPushErrorMessage = `Sinkronisasi jadwal gagal (HTTP ${res.status}).`;
        } else {
          lastPushErrorMessage = '';
        }
      } catch (err) {
        // Stay silent when offline; next online action will resync.
      }
    };

    if (options.immediate) {
      executeSync();
      return;
    }

    pendingScheduleSyncFn = executeSync;
    syncScheduleDebounceId = setTimeout(() => {
      syncScheduleDebounceId = null;
      executeSync();
    }, 150);
  }

  function syncHydrationProgress() {
    scheduleLocalTimer();
    renderSettingsUI();

    const config = getSettings();
    const serverUrl = config.pushServerUrl || DEFAULT_PUSH_SERVER_URL;
    if (!serverUrl) return;

    if (syncProgressDebounceId) {
      clearTimeout(syncProgressDebounceId);
      syncProgressDebounceId = null;
    }

    const executeProgressSync = async () => {
      pendingProgressSyncFn = null;
      const latest = getSettings();
      const targetUrl = latest.pushServerUrl || DEFAULT_PUSH_SERVER_URL;
      if (!targetUrl) return;

      let subscription = await getActivePushSubscription();
      if ((!latest.pushConnected || !subscription) && getNotificationPermission() === 'granted') {
        const connected = await connectAndSubscribePush(targetUrl, { requestPermission: false });
        if (connected.ok) return;
        subscription = await getActivePushSubscription();
      }
      if (!subscription) return;

      const payload = buildPushPayload(subscription, latest);
      try {
        const res = await fetchWithTimeout(`${targetUrl}/sync-progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            subscription: payload.subscription,
            schedule: payload.schedule,
            profile: payload.profile
          })
        }, 8000);

        // Re-register automatically if KV record expired or server was reset.
        if (res.status === 404) {
          await fetchWithTimeout(`${targetUrl}/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify(payload)
          }, 8000);
        }
      } catch (err) {
        // Ignore network errors while offline so water logging stays instant.
      }
    };

    pendingProgressSyncFn = executeProgressSync;
    syncProgressDebounceId = setTimeout(() => {
      syncProgressDebounceId = null;
      executeProgressSync();
    }, 250);
  }

  // Test notification actions (instant and delayed 15-second closed-browser test).
  function clearTestTimers() {
    if (testCountdownIntervalId) {
      clearInterval(testCountdownIntervalId);
      testCountdownIntervalId = null;
    }
    if (testLocalFallbackTimeoutId) {
      clearTimeout(testLocalFallbackTimeoutId);
      testLocalFallbackTimeoutId = null;
    }
  }

  function setTestFeedback(message, state = 'info') {
    const el = document.getElementById('testPushFeedback');
    if (!el) return;
    if (!message) {
      el.textContent = '';
      el.classList.add('hidden');
      el.removeAttribute('data-status');
      return;
    }
    el.textContent = message;
    const mapped = state === 'danger' ? 'error' : state;
    if (mapped === 'success' || mapped === 'warning' || mapped === 'error') {
      el.dataset.status = mapped;
    } else {
      el.removeAttribute('data-status');
    }
    el.classList.remove('hidden');
  }

  let isSendingDemoNotif = false;
  let demoStatusResetTimerId = null;

  function setDemoTestStatusText(text, autoResetMs = 0) {
    if (demoStatusResetTimerId) {
      clearTimeout(demoStatusResetTimerId);
      demoStatusResetTimerId = null;
    }
    const statusEl = document.getElementById('notifDemoTestStatusText');
    if (statusEl) {
      statusEl.textContent = text;
    }
    if (autoResetMs > 0 && statusEl) {
      demoStatusResetTimerId = setTimeout(() => {
        demoStatusResetTimerId = null;
        statusEl.textContent = 'Kirim contoh push notifikasi untuk demo';
      }, autoResetMs);
    }
  }

  async function ensurePushSubscriptionForDemoOnly(serverUrl) {
    const reg = await ensureServiceWorker();
    if (!reg || !reg.pushManager) return null;

    try {
      let subscription = await reg.pushManager.getSubscription();
      if (subscription) return subscription;

      const keyRes = await fetchWithTimeout(`${serverUrl}/vapid-public-key`, {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain' }
      }, 8000);
      if (!keyRes.ok) return null;

      const contentType = keyRes.headers.get('content-type') || '';
      let vapidKey = '';
      if (contentType.includes('application/json')) {
        const keyData = await keyRes.json();
        vapidKey = keyData.publicKey || keyData.vapidPublicKey || '';
      } else {
        vapidKey = (await keyRes.text()).trim();
      }
      if (!vapidKey) return null;

      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
      return subscription;
    } catch (err) {
      return null;
    }
  }

  // Isolated Demo Push Notification (uses tag "hydrotrack-test" and never touches the user's scheduled reminders or KV schedule).
  async function sendDemoPushNotification() {
    if (isSendingDemoNotif) return { ok: false, reason: 'busy' };

    const state = getPlatformState();
    if (state.needsIosInstall || !state.notifSupported) {
      const msg = state.needsIosInstall
        ? 'Tambahkan HydroTrack ke Layar Utama Safari terlebih dahulu untuk mencoba notifikasi.'
        : 'Browser ini tidak mendukung notifikasi web.';
      showToastSafe(msg, 'warning');
      return { ok: false };
    }

    let permission = getNotificationPermission();
    if (permission === 'default') {
      permission = await requestPermission();
    }

    if (permission !== 'granted') {
      const msg = permission === 'denied'
        ? 'Izin notifikasi diblokir browser. Aktifkan lewat pengaturan situs terlebih dahulu.'
        : 'Izin notifikasi diperlukan untuk mengirim tes notifikasi.';
      showToastSafe(msg, 'warning');
      return { ok: false };
    }

    isSendingDemoNotif = true;
    const demoBtn = document.getElementById('btnDemoTestNotif');
    if (demoBtn) demoBtn.disabled = true;
    setDemoTestStatusText('Mengirim tes notifikasi...');

    try {
      const config = getSettings();
      const appSettings = safeGetAppSettings();
      const msgObj = buildReminderMessage(new Date());
      const soundLabel = config.soundType === AUDIO_KEY_UPLOAD ? 'custom-upload' : 'default';
      const serverUrl = config.pushServerUrl || DEFAULT_PUSH_SERVER_URL;

      // Primary: real Web Push through Cloudflare Worker /test-push (isolated from user's real reminder schedule).
      if (state.pushSupported && serverUrl && navigator.onLine !== false) {
        const subscription = await ensurePushSubscriptionForDemoOnly(serverUrl);
        if (subscription) {
          try {
            const res = await fetchWithTimeout(`${serverUrl}/test-push`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                endpoint: subscription.endpoint,
                subscription: typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription,
                delaySeconds: 0,
                userName: appSettings.userName || 'Pengguna',
                todayTotal: safeGetTodayTotal(),
                dailyGoal: Number(appSettings.dailyGoal) || 2000,
                remaining: safeGetTodayRemaining(),
                percentage: safeGetTodayPercentage(),
                soundLabel: soundLabel
              })
            }, 10000);

            if (res.ok) {
              setDemoTestStatusText('Tes push notifikasi terkirim!', 4000);
              showToastSafe('Tes push notifikasi demo berhasil dikirim.', 'success');
              return { ok: true, mode: 'push' };
            }
          } catch (err) {
            // Fall through to isolated local SW demo notification if offline/timeout.
          }
        }
      }

      // Fallback (offline / local environment): isolated local SW notification with tag "hydrotrack-test".
      const localRes = await showHydroNotification({
        isTest: true,
        tag: 'hydrotrack-test',
        title: 'Tes Notifikasi HydroTrack',
        body: msgObj.body,
        playAudio: true,
        url: './pengaturan.html?from=notification'
      });

      if (localRes.ok) {
        setDemoTestStatusText('Tes notifikasi terkirim!', 4000);
        showToastSafe('Tes notifikasi demo berhasil dikirim.', 'success');
        return { ok: true, mode: 'local' };
      }

      setDemoTestStatusText('Gagal mengirim tes notifikasi', 4000);
      showToastSafe('Gagal menampilkan tes notifikasi. Pastikan notifikasi perangkat tidak diblokir.', 'danger');
      return { ok: false };
    } finally {
      isSendingDemoNotif = false;
      if (demoBtn) demoBtn.disabled = false;
    }
  }

  async function sendTestNotificationNow() {
    clearTestTimers();
    let permission = getNotificationPermission();
    if (permission === 'default') {
      permission = await requestPermission();
    }

    if (permission !== 'granted') {
      const msg = permission === 'denied'
        ? 'Izin notifikasi diblokir. Aktifkan izin notifikasi di browser terlebih dahulu.'
        : 'Notifikasi belum diizinkan pada perangkat ini.';
      setTestFeedback(msg, 'warning');
      showToastSafe(msg, 'warning');
      return { ok: false };
    }

    const res = await showHydroNotification({
      isTest: true,
      playAudio: true,
      url: './pengaturan.html?from=notification'
    });

    if (res.ok) {
      setTestFeedback('Notifikasi uji coba berhasil dikirim beserta nada pengingat aktif.', 'success');
      showToastSafe('Notifikasi uji coba terkirim.', 'success');
      return { ok: true };
    }

    setTestFeedback('Gagal menampilkan notifikasi. Pastikan notifikasi sistem tidak diblokir.', 'danger');
    showToastSafe('Gagal menampilkan notifikasi.', 'danger');
    return { ok: false };
  }

  async function triggerDelayedServerTest(delaySeconds = 15) {
    clearTestTimers();
    const waitSecs = Math.max(5, parseInt(delaySeconds, 10) || 15);

    // Unlock audio immediately inside user gesture when Custom audio is selected.
    const initialConfig = getSettings();
    if (initialConfig.soundType === AUDIO_KEY_UPLOAD) {
      startSilentAudioKeepAlive(waitSecs + 8);
    }

    let permission = getNotificationPermission();
    if (permission === 'default') {
      permission = await requestPermission();
    }

    if (permission !== 'granted') {
      stopSilentAudioKeepAlive();
      const msg = permission === 'denied'
        ? 'Izin notifikasi diblokir. Aktifkan izin notifikasi browser terlebih dahulu.'
        : 'Izinkan notifikasi terlebih dahulu untuk menjalankan uji coba push.';
      setTestFeedback(msg, 'warning');
      showToastSafe(msg, 'warning');
      return { ok: false };
    }

    let config = getSettings();
    let subscription = await getActivePushSubscription();

    if (config.pushServerUrl && (!config.pushConnected || !subscription)) {
      setTestFeedback('Menghubungkan ke Push Server (tunggu 1 detik sebelum keluar aplikasi)...', 'info');
      const connectRes = await connectAndSubscribePush(config.pushServerUrl, { requestPermission: false });
      config = getSettings();
      subscription = connectRes.ok ? connectRes.subscription : await getActivePushSubscription();
    }

    const appSettings = safeGetAppSettings();
    const msgObj = buildReminderMessage(new Date());
    const soundLabel = config.soundType === AUDIO_KEY_UPLOAD ? 'custom-upload' : 'default';

    // Arm Service-Worker-level background timer backup so notification still fires while minimized even if mobile network delays FCM.
    const reg = await ensureServiceWorker();
    const swTarget = (reg && (reg.active || reg.waiting || reg.installing)) || (navigator.serviceWorker && navigator.serviceWorker.controller);
    if (swTarget && typeof swTarget.postMessage === 'function') {
      try {
        swTarget.postMessage({
          type: 'SCHEDULE_SW_DELAYED_TEST',
          delaySeconds: waitSecs,
          payload: {
            title: 'Tes Push Latar Belakang Berhasil',
            body: `Halo ${appSettings.userName || 'Pengguna'}, pengingat HydroTrack aktif di latar belakang. ${msgObj.body}`,
            soundLabel: soundLabel,
            silent: false,
            url: './pengaturan.html?from=notification'
          }
        });
      } catch (err) {
        // Ignore SW message error.
      }
    }

    if (config.pushServerUrl && config.pushConnected && subscription) {
      setTestFeedback('Menjadwalkan push di server Cloudflare...', 'info');
      try {
        const res = await fetchWithTimeout(`${config.pushServerUrl}/test-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            subscription: typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription,
            delaySeconds: waitSecs,
            userName: appSettings.userName || 'Pengguna',
            todayTotal: safeGetTodayTotal(),
            dailyGoal: Number(appSettings.dailyGoal) || 2000,
            remaining: safeGetTodayRemaining(),
            percentage: safeGetTodayPercentage(),
            soundLabel: soundLabel,
            title: msgObj.title,
            body: msgObj.body
          })
        }, 10000);

        if (!res.ok) {
          throw new Error(`Push Server membalas HTTP ${res.status}.`);
        }

        let remainingSecs = waitSecs;
        const updateCloudCountdown = () => {
          if (remainingSecs > 0) {
            setTestFeedback(
              `SIAP! Tekan tombol Home atau kunci layar HP sekarang (jangan hapus paksa / swipe dari Recent Apps agar Android tidak memutus proses latar belakang). Notifikasi & nada dering akan berbunyi dalam ${remainingSecs} detik...`,
              'success'
            );
          } else {
            clearTestTimers();
            setTestFeedback(
              'Push sudah dikirim! Jika tadi aplikasi di-swipe habis dari Recent Apps, beberapa HP Android menahan push hingga aplikasi tidak dibatasi baterai.',
              'info'
            );
          }
        };

        updateCloudCountdown();
        testCountdownIntervalId = setInterval(() => {
          remainingSecs -= 1;
          updateCloudCountdown();
        }, 1000);

        return { ok: true, mode: 'server' };
      } catch (err) {
        const fallbackReason = err && err.message ? err.message : 'Push Server tidak dapat dijangkau.';
        setTestFeedback(
          `${fallbackReason} Cadangan Service Worker tetap berjalan dalam ${waitSecs} detik (tekan tombol Home atau kunci layar)...`,
          'warning'
        );
      }
    }

    // Service Worker background countdown when server is offline.
    let localRemaining = waitSecs;
    const renderLocalCountdown = () => {
      if (localRemaining > 0) {
        setTestFeedback(
          `Uji coba latar belakang Service Worker dijadwalkan dalam ${localRemaining} detik. Tekan tombol Home atau kunci layar sekarang...`,
          'warning'
        );
      } else {
        clearTestTimers();
        setTestFeedback('Notifikasi uji coba telah dikirim oleh Service Worker.', 'info');
      }
    };

    renderLocalCountdown();
    testCountdownIntervalId = setInterval(() => {
      localRemaining -= 1;
      renderLocalCountdown();
    }, 1000);

    return { ok: true, mode: 'sw-fallback' };
  }

  // PWA install and Push diagnostics retry.
  async function handleInstallPwaClick() {
    const state = getPlatformState();

    if (state.isStandalone) {
      showToastSafe('HydroTrack sudah berjalan sebagai aplikasi terinstal.', 'success');
      renderPwaInstallUI();
      return;
    }

    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        if (choice && choice.outcome === 'accepted') {
          showToastSafe('Instalasi HydroTrack sedang diproses.', 'success');
        } else {
          showToastSafe('Instalasi dibatalkan. Kamu dapat menginstal kapan saja.', 'warning');
        }
      } catch (err) {
        showToastSafe('Gagal membuka dialog instalasi browser.', 'warning');
      }
      renderPwaInstallUI();
      return;
    }

    if (state.isIOS) {
      const hint = document.getElementById('iosInstallHint');
      if (hint) {
        hint.classList.remove('hidden');
        hint.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      showToastSafe('Ketuk tombol Bagikan di Safari lalu pilih Tambah ke Layar Utama.', 'success');
      return;
    }

    const manualMsg = state.isSecureContext
      ? 'Buka menu browser (ikon titik tiga) lalu pilih "Instal aplikasi" atau "Tambahkan ke layar utama".'
      : 'Instalasi PWA aktif saat aplikasi dibuka lewat HTTPS (seperti Vercel) atau localhost.';
    const statusText = document.getElementById('pwaInstallStatusText');
    if (statusText) statusText.textContent = manualMsg;
    showToastSafe(manualMsg, 'warning');
  }

  async function retryPushSetup() {
    const btn = document.getElementById('btnRetryPushSetup');
    if (btn) btn.disabled = true;

    try {
      const state = getPlatformState();
      if (state.needsIosInstall) {
        const hint = document.getElementById('iosInstallHint');
        if (hint) hint.classList.remove('hidden');
        setTestFeedback('Instal HydroTrack ke Layar Utama terlebih dahulu melalui Safari agar notifikasi aktif di iOS.', 'warning');
        showToastSafe('Instal ke Layar Utama dulu untuk perangkat iOS.', 'warning');
        return { ok: false };
      }

      const reg = await ensureServiceWorker();
      if (reg && typeof reg.update === 'function') {
        try {
          await reg.update();
        } catch (err) {
          // Ignore update failure while offline.
        }
      }

      let permission = getNotificationPermission();
      if (permission === 'default') {
        permission = await requestPermission();
      }

      const config = getSettings();
      if (permission === 'denied') {
        setTestFeedback('Izin notifikasi masih diblokir browser. Buka pengaturan izin situs lalu aktifkan Notifikasi.', 'danger');
        showToastSafe('Izin notifikasi masih diblokir di browser.', 'warning');
        return { ok: false };
      }

      if (config.pushServerUrl) {
        const res = await connectAndSubscribePush(config.pushServerUrl, { requestPermission: false });
        if (res.ok) {
          scheduleLocalTimer();
          setTestFeedback('Service Worker, izin notifikasi, dan koneksi Push Server berhasil diperbarui.', 'success');
          showToastSafe('Koneksi notifikasi dan Push Server siap.', 'success');
          return { ok: true };
        }
        setTestFeedback(`Pemulihan gagal: ${res.error}`, 'danger');
        showToastSafe(res.error, 'danger');
        return { ok: false };
      }

      scheduleLocalTimer();
      renderSettingsUI();
      const summary = reg
        ? 'Service Worker dan izin notifikasi aktif. Hubungkan URL Push Server jika ingin notifikasi saat browser ditutup.'
        : 'Izin notifikasi aktif (mode pengingat lokal).';
      setTestFeedback(summary, 'success');
      showToastSafe('Pengaturan notifikasi berhasil diperiksa ulang.', 'success');
      return { ok: true };
    } finally {
      if (btn) btn.disabled = false;
      renderSettingsUI();
    }
  }

  // Settings UI rendering (all DOM accesses strictly null-safe for cross-page usage).
  function setSelectableState(el, isSelected) {
    if (!el) return;
    if (el.tagName === 'INPUT') {
      el.checked = Boolean(isSelected);
      const label = el.closest('label');
      if (label) label.classList.toggle('active', Boolean(isSelected));
    } else {
      el.classList.toggle('active', Boolean(isSelected));
      el.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    }
  }

  function bindSelectableControl(el, onSelect) {
    if (!el) return;
    if (el.tagName === 'INPUT') {
      el.addEventListener('change', () => {
        if (el.checked) onSelect();
      });
    } else {
      el.addEventListener('click', () => onSelect());
    }
  }

  function setButtonLabel(btn, text) {
    if (!btn) return;
    const span = btn.querySelector('span');
    if (span) {
      span.textContent = text;
    } else {
      btn.textContent = text;
    }
  }

  function renderPwaInstallUI() {
    const state = getPlatformState();
    const card = document.getElementById('pwaInstallCard');
    const statusText = document.getElementById('pwaInstallStatusText');
    const installBtn = document.getElementById('btnInstallPwa');
    const iosHint = document.getElementById('iosInstallHint');

    if (iosHint) {
      iosHint.classList.toggle('hidden', !state.needsIosInstall);
    }

    if (!card && !statusText && !installBtn) return;

    if (state.isStandalone) {
      if (statusText) {
        statusText.textContent = 'HydroTrack sudah terinstal sebagai aplikasi di perangkat ini.';
      }
      if (installBtn) {
        installBtn.disabled = true;
        setButtonLabel(installBtn, 'Sudah Terinstal');
      }
      return;
    }

    if (state.isIOS) {
      if (statusText) {
        statusText.textContent = 'Untuk notifikasi di iPhone/iPad, tambahkan HydroTrack ke Layar Utama melalui tombol Bagikan di Safari.';
      }
      if (installBtn) {
        installBtn.disabled = false;
        setButtonLabel(installBtn, 'Lihat Cara Instal di iOS');
      }
      return;
    }

    if (state.canPromptInstall) {
      if (statusText) {
        statusText.textContent = 'HydroTrack siap diinstal sebagai aplikasi agar pengingat hidrasi berjalan lebih stabil.';
      }
      if (installBtn) {
        installBtn.disabled = false;
        setButtonLabel(installBtn, 'Install Aplikasi dari Web');
      }
      return;
    }

    if (statusText) {
      statusText.textContent = state.isSecureContext
        ? 'Kamu bisa menginstal HydroTrack lewat menu browser untuk pengalaman aplikasi penuh.'
        : 'Buka HydroTrack melalui HTTPS (misalnya domain Vercel) untuk mengaktifkan instalasi aplikasi dan push background.';
    }
    if (installBtn) {
      installBtn.disabled = false;
      setButtonLabel(installBtn, 'Install Aplikasi dari Web');
    }
  }

  function renderSoundUI(config = getSettings()) {
    const isCustom = config.soundType === AUDIO_KEY_UPLOAD;
    setSelectableState(document.getElementById('soundTypeDefault'), !isCustom);
    setSelectableState(document.getElementById('soundTypeUpload'), isCustom);

    const uploadPanel = document.getElementById('soundUploadPanel');
    if (uploadPanel) uploadPanel.classList.toggle('hidden', !isCustom);

    const hasUpload = Boolean(config.customAudioName) && audioAvailability[AUDIO_KEY_UPLOAD] !== false;
    const customAudioInfo = document.getElementById('customAudioInfo');
    const customAudioName = document.getElementById('customAudioName');
    const previewUploadBtn = document.getElementById('btnPreviewCustomAudio');
    const removeUploadBtn = document.getElementById('btnRemoveCustomAudio');
    if (customAudioInfo) customAudioInfo.dataset.hasAudio = hasUpload ? 'true' : 'false';
    if (customAudioName) customAudioName.textContent = hasUpload ? config.customAudioName : 'Belum ada file audio dipilih';
    if (previewUploadBtn) previewUploadBtn.classList.toggle('hidden', !hasUpload);
    if (removeUploadBtn) removeUploadBtn.classList.toggle('hidden', !hasUpload);
  }

  function renderScheduleTimeline(config, nextInfo) {
    const container = document.getElementById('notifScheduleTimeline');
    if (!container) return;

    if (!nextInfo.valid) {
      container.innerHTML = '<span class="notif-timeline-empty">Perbaiki jam mulai, jam selesai, atau interval untuk melihat jadwal.</span>';
      return;
    }

    const now = new Date();
    const nowKey = buildSlotKey(now);
    const nextKey = nextInfo.nextSlotKey;

    if (config.mode === 'smart') {
      const lastDrink = getLatestDrinkDateToday();
      if (nextInfo.pausedByGoal) {
        container.innerHTML = `<span class="notif-timeline-chip is-next">Target hari ini tercapai, aktif lagi besok ${escapeHtml(config.startTime)}</span>`;
        return;
      }

      if (lastDrink && nextInfo.nextDate) {
        const lastStr = `${String(lastDrink.getHours()).padStart(2, '0')}:${String(lastDrink.getMinutes()).padStart(2, '0')}`;
        const nextStr = `${String(nextInfo.nextDate.getHours()).padStart(2, '0')}:${String(nextInfo.nextDate.getMinutes()).padStart(2, '0')}`;
        const dayPrefix = nextInfo.isTomorrow ? 'Besok ' : '';
        container.innerHTML =
          `<span class="notif-timeline-chip is-past">Terakhir minum ${escapeHtml(lastStr)}</span>` +
          `<span class="notif-timeline-chip is-next">Berikutnya ${escapeHtml(dayPrefix + nextStr)}</span>`;
        return;
      }
    }

    const slots = nextInfo.slots || [];
    if (slots.length === 0) {
      container.innerHTML = '<span class="notif-timeline-empty">Belum ada slot jadwal pada rentang waktu ini.</span>';
      return;
    }

    const todayStr = safeFormatDateKey(now);
    const html = slots.map((slot) => {
      const slotKey = `${todayStr} ${slot}`;
      let stateClass = '';
      if (nextInfo.pausedByGoal) {
        stateClass = 'is-past';
      } else if (slotKey === nextKey && !nextInfo.isTomorrow) {
        stateClass = 'is-next';
      } else if (slotKey <= nowKey) {
        stateClass = 'is-past';
      }
      return `<span class="notif-timeline-chip ${stateClass}">${escapeHtml(slot)}</span>`;
    }).join('');

    container.innerHTML = html;
  }

  function renderSettingsUI() {
    const config = getSettings();
    const state = getPlatformState();
    const nextInfo = computeNextReminder(config, new Date());
    const previewMsg = buildReminderMessage(new Date());

    // Main settings menu subtitle.
    const menuSub = document.getElementById('menuNotificationsSub');
    if (menuSub) {
      if (!config.enabled) {
        menuSub.textContent = 'Nonaktif';
      } else if (nextInfo.pausedByGoal) {
        menuSub.textContent = 'Aktif, target hari ini tercapai';
      } else {
        const modeText = config.mode === 'smart' ? 'Mode Pintar' : 'Jadwal Tetap';
        menuSub.textContent = `Aktif (${modeText}), tiap ${formatIntervalLabel(config.intervalMinutes)}`;
      }
    }

    // Master toggle.
    const toggle = document.getElementById('notifEnabledToggle');
    if (toggle) {
      toggle.checked = Boolean(config.enabled);
      toggle.setAttribute('aria-checked', config.enabled ? 'true' : 'false');
    }

    // Status badge (#notifStatusText sits inside #notifStatusBadge alongside .notif-status-dot).
    const badge = document.getElementById('notifStatusBadge');
    const statusText = document.getElementById('notifStatusText');
    let badgeLabel = 'Nonaktif';
    let badgeStatus = '';
    let fallbackScheduleMsg = 'Aktifkan pengingat untuk mulai menjadwalkan notifikasi minum.';

    if (state.needsIosInstall) {
      badgeLabel = 'Butuh Instalasi';
      badgeStatus = 'warning';
      fallbackScheduleMsg = 'Tambahkan HydroTrack ke Layar Utama Safari untuk mengaktifkan notifikasi di iOS.';
    } else if (!state.notifSupported) {
      badgeLabel = 'Tidak Didukung';
      badgeStatus = 'warning';
      fallbackScheduleMsg = 'Browser ini tidak mendukung Web Notification API.';
    } else if (state.permission === 'denied') {
      badgeLabel = 'Izin Diblokir';
      badgeStatus = 'denied';
      fallbackScheduleMsg = 'Izin notifikasi diblokir browser. Buka pengaturan izin situs untuk mengaktifkannya kembali.';
    } else if (config.enabled) {
      if (nextInfo.pausedByGoal) {
        badgeLabel = 'Dijeda (100%)';
        badgeStatus = 'active';
      } else {
        badgeLabel = 'Aktif';
        badgeStatus = 'active';
      }
    }

    if (badge) {
      if (badgeStatus) {
        badge.dataset.status = badgeStatus;
      } else {
        badge.removeAttribute('data-status');
      }
      if (!statusText) {
        badge.textContent = badgeLabel;
      }
    }
    if (statusText) {
      statusText.textContent = badgeLabel;
    }

    // Next reminder time & status explanation.
    const nextTextEl = document.getElementById('notifNextScheduleText');
    if (nextTextEl) {
      if (!config.enabled || state.needsIosInstall || !state.notifSupported || state.permission === 'denied') {
        nextTextEl.textContent = fallbackScheduleMsg;
      } else if (!nextInfo.valid || !nextInfo.nextDate) {
        nextTextEl.textContent = 'Periksa pengaturan jam mulai, jam selesai, dan interval.';
      } else {
        const hh = String(nextInfo.nextDate.getHours()).padStart(2, '0');
        const mm = String(nextInfo.nextDate.getMinutes()).padStart(2, '0');
        const dayLabel = nextInfo.isTomorrow ? 'Besok' : 'Hari ini';
        if (nextInfo.pausedByGoal) {
          nextTextEl.textContent = `Target hari ini tercapai (100%). Pengingat dilanjutkan ${dayLabel.toLowerCase()}, ${hh}:${mm}.`;
        } else {
          nextTextEl.textContent = `Pengingat berikutnya: ${dayLabel}, ${hh}:${mm}`;
        }
      }
    }

    // Live zero-token reminder message preview.
    const previewEl = document.getElementById('notifMessagePreview');
    if (previewEl) {
      previewEl.innerHTML = `<strong>${escapeHtml(previewMsg.title)}</strong><br>${escapeHtml(previewMsg.body)}`;
    }

    // Permission banner.
    const permBanner = document.getElementById('notifPermissionBanner');
    const permText = document.getElementById('notifPermissionBannerText');
    const permBtn = document.getElementById('btnRequestNotifPermission');
    if (permBanner) {
      let showBanner = false;
      let bannerMsg = '';
      let showRequestBtn = false;

      if (state.needsIosInstall) {
        showBanner = true;
        bannerMsg = 'Di iPhone/iPad, notifikasi web hanya bekerja setelah aplikasi ditambahkan ke Layar Utama lewat Safari.';
      } else if (!state.notifSupported) {
        showBanner = true;
        bannerMsg = 'Browser ini tidak mendukung notifikasi web. Coba buka di Chrome, Edge, Firefox, atau Safari iOS versi terbaru.';
      } else if (state.permission === 'denied') {
        showBanner = true;
        bannerMsg = 'Izin notifikasi sedang diblokir browser. Ketuk ikon gembok di bilah alamat lalu izinkan Notifikasi, kemudian tekan Coba Ulang.';
      } else if (state.permission === 'default') {
        showBanner = true;
        bannerMsg = 'HydroTrack memerlukan izin notifikasi browser agar pengingat hidrasi dapat muncul di perangkatmu.';
        showRequestBtn = true;
      }

      permBanner.classList.toggle('hidden', !showBanner);
      if (permText && bannerMsg) permText.textContent = bannerMsg;
      if (permBtn) permBtn.classList.toggle('hidden', !showRequestBtn);
    }

    // Mode, start/end times, intervals, goal pause.
    setSelectableState(document.getElementById('notifModeFixed'), config.mode === 'fixed');
    setSelectableState(document.getElementById('notifModeSmart'), config.mode === 'smart');

    const startInput = document.getElementById('notifStartTime');
    if (startInput && document.activeElement !== startInput) {
      startInput.value = config.startTime;
    }

    const endInput = document.getElementById('notifEndTime');
    if (endInput && document.activeElement !== endInput) {
      endInput.value = config.endTime;
    }

    const presetButtons = document.querySelectorAll('[data-notif-interval]');
    presetButtons.forEach((btn) => {
      const val = parseInt(btn.dataset.notifInterval, 10);
      const isActive = val === config.intervalMinutes;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    const customHours = document.getElementById('notifCustomHours');
    const customMinutes = document.getElementById('notifCustomMinutes');
    if (customHours && document.activeElement !== customHours) {
      customHours.value = String(Math.floor(config.intervalMinutes / 60));
    }
    if (customMinutes && document.activeElement !== customMinutes) {
      customMinutes.value = String(config.intervalMinutes % 60);
    }

    const scheduleErrorEl = document.getElementById('notifScheduleError');
    if (scheduleErrorEl) {
      if (nextInfo.valid) {
        scheduleErrorEl.textContent = '';
        scheduleErrorEl.classList.add('hidden');
      } else {
        scheduleErrorEl.textContent = nextInfo.error;
        scheduleErrorEl.classList.remove('hidden');
      }
    }

    const pauseGoalToggle = document.getElementById('notifPauseGoalMet');
    if (pauseGoalToggle) {
      pauseGoalToggle.checked = Boolean(config.pauseWhenGoalMet);
    }

    renderScheduleTimeline(config, nextInfo);
    renderSoundUI(config);

    // Summary subtitles on the trigger cards ("Jadwal & Interval" and "Nada Dering & Suara").
    const scheduleSummaryEl = document.getElementById('notifScheduleSummaryText');
    if (scheduleSummaryEl) {
      const modeLabel = config.mode === 'smart' ? 'Mode Pintar' : 'Jadwal Tetap';
      scheduleSummaryEl.textContent = `${modeLabel} · ${config.startTime} - ${config.endTime} · Tiap ${formatIntervalLabel(config.intervalMinutes)}`;
    }

    const soundSummaryEl = document.getElementById('notifSoundSummaryText');
    if (soundSummaryEl) {
      if (config.soundType === AUDIO_KEY_UPLOAD) {
        const hasUpload = Boolean(config.customAudioName) && audioAvailability[AUDIO_KEY_UPLOAD] !== false;
        soundSummaryEl.textContent = hasUpload
          ? `Custom · ${config.customAudioName}`
          : 'Custom · Belum ada file audio dipilih';
      } else {
        soundSummaryEl.textContent = 'Default · Mengikuti sistem perangkat';
      }
    }

    // Push server section.
    const pushBadge = document.getElementById('pushServerStatusBadge');
    const pushDesc = document.getElementById('pushServerStatusDesc');
    const pushInput = document.getElementById('inputPushServerUrl');

    if (pushInput && document.activeElement !== pushInput && !(lastPushErrorMessage && pushInput.value.trim())) {
      pushInput.value = config.pushServerUrl || '';
    }

    if (pushBadge) {
      if (!state.pushSupported) {
        pushBadge.textContent = state.needsIosInstall ? 'Butuh Instalasi' : 'Mode Lokal';
        pushBadge.dataset.status = 'unsupported';
      } else if (config.pushConnected && config.pushServerUrl) {
        pushBadge.textContent = 'Terhubung';
        pushBadge.dataset.status = 'connected';
      } else if (lastPushErrorMessage) {
        pushBadge.textContent = 'Gagal Terhubung';
        pushBadge.dataset.status = 'error';
      } else {
        pushBadge.textContent = 'Belum Terhubung';
        pushBadge.dataset.status = 'disconnected';
      }
    }

    if (pushDesc) {
      if (config.pushConnected && config.pushServerUrl) {
        pushDesc.textContent = config.enabled
          ? 'Notifikasi latar belakang aktif melalui Push Server walaupun tab browser ditutup.'
          : 'Push Server terhubung. Aktifkan pengingat di atas agar jadwal latar belakang berjalan.';
      } else if (lastPushErrorMessage) {
        pushDesc.textContent = lastPushErrorMessage;
      } else if (!state.pushSupported) {
        pushDesc.textContent = state.needsIosInstall
          ? 'Instal ke Layar Utama iOS terlebih dahulu untuk mengaktifkan Push Server.'
          : 'Pengingat berjalan lokal saat aplikasi dibuka.';
      } else {
        pushDesc.textContent = 'Hubungkan URL Cloudflare Worker Push Server agar pengingat tetap masuk meski browser ditutup.';
      }
    }

    renderPwaInstallUI();
  }

  // Settings UI event bindings (idempotent).
  function applyScheduleUpdate(partialUpdates) {
    const current = getSettings();
    const candidate = { ...current, ...partialUpdates };
    const check = validateSchedule(candidate);
    const errEl = document.getElementById('notifScheduleError');

    if (!check.valid) {
      if (errEl) {
        errEl.textContent = check.error;
        errEl.classList.remove('hidden');
      }
      return false;
    }

    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }

    saveSettings({
      ...partialUpdates,
      lastNotifiedSlot: ''
    });
    scheduleLocalTimer();
    queueScheduleSyncToServer();
    renderSettingsUI();
    return true;
  }

  function initSettingsUI() {
    const hasSettingsDom = Boolean(
      document.getElementById('notifEnabledToggle') ||
      document.getElementById('menuNotificationsSub') ||
      document.getElementById('subview-notifications')
    );

    if (!hasSettingsDom) return;
    if (settingsUiBound) {
      renderSettingsUI();
      return;
    }
    settingsUiBound = true;

    const toggle = document.getElementById('notifEnabledToggle');
    if (toggle) {
      toggle.addEventListener('change', async () => {
        const wantsEnabled = toggle.checked;
        if (!wantsEnabled) {
          saveSettings({ enabled: false });
          clearLocalTimer();
          queueScheduleSyncToServer({ immediate: true, keepalive: true });
          renderSettingsUI();
          showToastSafe('Pengingat hidrasi dinonaktifkan.', 'success');
          return;
        }

        const state = getPlatformState();
        if (state.needsIosInstall || !state.notifSupported) {
          toggle.checked = false;
          renderSettingsUI();
          showToastSafe(
            state.needsIosInstall
              ? 'Tambahkan HydroTrack ke Layar Utama Safari dulu untuk mengaktifkan notifikasi.'
              : 'Browser ini tidak mendukung notifikasi web.',
            'warning'
          );
          return;
        }

        let permission = state.permission;
        if (permission === 'default') {
          permission = await requestPermission();
        }

        if (permission !== 'granted') {
          toggle.checked = false;
          renderSettingsUI();
          showToastSafe('Izin notifikasi diperlukan untuk mengaktifkan pengingat.', 'warning');
          return;
        }

        const updated = saveSettings({ enabled: true, lastNotifiedSlot: '' });
        scheduleLocalTimer();

        if (updated.pushServerUrl) {
          if (updated.pushConnected) {
            queueScheduleSyncToServer();
          } else {
            connectAndSubscribePush(updated.pushServerUrl, { requestPermission: false });
          }
        }

        renderSettingsUI();
        showToastSafe('Pengingat hidrasi diaktifkan.', 'success');
      });
    }

    const reqPermBtn = document.getElementById('btnRequestNotifPermission');
    if (reqPermBtn) {
      reqPermBtn.addEventListener('click', async () => {
        const res = await requestPermission();
        if (res === 'granted') {
          showToastSafe('Izin notifikasi berhasil diberikan.', 'success');
          const config = getSettings();
          if (config.enabled) scheduleLocalTimer();
        }
        renderSettingsUI();
      });
    }

    bindSelectableControl(document.getElementById('notifModeFixed'), () => {
      applyScheduleUpdate({ mode: 'fixed' });
    });

    bindSelectableControl(document.getElementById('notifModeSmart'), () => {
      applyScheduleUpdate({ mode: 'smart' });
    });

    const startTimeInput = document.getElementById('notifStartTime');
    if (startTimeInput) {
      startTimeInput.addEventListener('change', () => {
        applyScheduleUpdate({ startTime: startTimeInput.value });
      });
    }

    const endTimeInput = document.getElementById('notifEndTime');
    if (endTimeInput) {
      endTimeInput.addEventListener('change', () => {
        applyScheduleUpdate({ endTime: endTimeInput.value });
      });
    }

    document.querySelectorAll('[data-notif-interval]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mins = parseInt(btn.dataset.notifInterval, 10);
        if (!isNaN(mins)) {
          applyScheduleUpdate({ intervalMinutes: mins });
        }
      });
    });

    const applyCustomIntervalBtn = document.getElementById('btnApplyCustomInterval');
    if (applyCustomIntervalBtn) {
      applyCustomIntervalBtn.addEventListener('click', () => {
        const hoursEl = document.getElementById('notifCustomHours');
        const minsEl = document.getElementById('notifCustomMinutes');
        const hours = Math.max(0, parseInt(hoursEl ? hoursEl.value : '0', 10) || 0);
        const mins = Math.max(0, parseInt(minsEl ? minsEl.value : '0', 10) || 0);
        const total = hours * 60 + mins;
        if (applyScheduleUpdate({ intervalMinutes: total })) {
          showToastSafe(`Interval pengingat diatur ke setiap ${formatIntervalLabel(total)}.`, 'success');
        }
      });
    }

    const pauseGoalToggle = document.getElementById('notifPauseGoalMet');
    if (pauseGoalToggle) {
      pauseGoalToggle.addEventListener('change', () => {
        saveSettings({ pauseWhenGoalMet: pauseGoalToggle.checked });
        scheduleLocalTimer();
        queueScheduleSyncToServer();
        renderSettingsUI();
      });
    }

    // Sound mode selectors.
    bindSelectableControl(document.getElementById('soundTypeDefault'), () => {
      stopAudioPlayback();
      saveSettings({ soundType: 'default' });
      queueScheduleSyncToServer();
      renderSettingsUI();
    });

    bindSelectableControl(document.getElementById('soundTypeUpload'), () => {
      stopAudioPlayback();
      saveSettings({ soundType: AUDIO_KEY_UPLOAD });
      queueScheduleSyncToServer();
      renderSettingsUI();
    });

    bindSelectableControl(document.getElementById('soundTypeVoice'), () => {
      stopAudioPlayback();
      saveSettings({ soundType: AUDIO_KEY_VOICE });
      queueScheduleSyncToServer();
      renderSettingsUI();
    });

    bindSelectableControl(document.getElementById('soundTypeSilent'), () => {
      stopAudioPlayback();
      saveSettings({ soundType: 'silent' });
      queueScheduleSyncToServer();
      renderSettingsUI();
    });

    document.querySelectorAll('input[name="notifDefaultSound"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        saveSettings({ soundType: 'default', defaultSoundId: radio.value });
        playDefaultTone(radio.value);
        queueScheduleSyncToServer();
        renderSettingsUI();
      });
    });

    document.querySelectorAll('[data-preview-sound]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const toneId = btn.dataset.previewSound || 'water-drop';
        playDefaultTone(toneId).then((played) => {
          if (played) highlightPreviewButton(btn, 1000);
        });
      });
    });

    // Custom ringtone file upload.
    const fileInput = document.getElementById('inputCustomRingtone');
    const chooseAudioBtn = document.getElementById('btnChooseCustomAudio');
    if (chooseAudioBtn && fileInput) {
      chooseAudioBtn.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;

        if (!isValidAudioFile(file)) {
          showToastSafe('Format file tidak didukung. Pilih file audio seperti MP3, WAV, M4A, atau OGG.', 'danger');
          return;
        }

        if (file.size > MAX_AUDIO_BYTES) {
          showToastSafe('Ukuran file audio terlalu besar. Maksimal 5 MB.', 'danger');
          return;
        }

        try {
          const duration = await probeAudioDuration(file);
          await saveAudioBlob(AUDIO_KEY_UPLOAD, file, {
            name: file.name,
            type: file.type || 'audio/mpeg',
            duration: duration
          });
          saveSettings({
            soundType: AUDIO_KEY_UPLOAD,
            customAudioName: file.name
          });
          queueScheduleSyncToServer();
          renderSettingsUI();
          showToastSafe(`Nada "${file.name}" berhasil disimpan.`, 'success');
        } catch (err) {
          showToastSafe('Gagal menyimpan file audio ke penyimpanan lokal browser.', 'danger');
        }
      });
    }

    const previewCustomAudioBtn = document.getElementById('btnPreviewCustomAudio');
    if (previewCustomAudioBtn) {
      previewCustomAudioBtn.addEventListener('click', async () => {
        const res = await playStoredAudio(AUDIO_KEY_UPLOAD);
        if (!res.ok) {
          showToastSafe('File audio kustom tidak ditemukan. Silakan unggah ulang.', 'warning');
          syncAudioAvailabilityFromDB();
        }
      });
    }

    const removeCustomAudioBtn = document.getElementById('btnRemoveCustomAudio');
    if (removeCustomAudioBtn) {
      removeCustomAudioBtn.addEventListener('click', async () => {
        stopAudioPlayback();
        await deleteAudioBlob(AUDIO_KEY_UPLOAD);
        const current = getSettings();
        saveSettings({
          customAudioName: '',
          soundType: current.soundType === AUDIO_KEY_UPLOAD ? 'default' : current.soundType
        });
        queueScheduleSyncToServer();
        renderSettingsUI();
        showToastSafe('File audio kustom dihapus.', 'success');
      });
    }

    // Voice recorder controls.
    const voiceRecordBtn = document.getElementById('btnToggleVoiceRecord');
    if (voiceRecordBtn) {
      voiceRecordBtn.addEventListener('click', () => {
        toggleVoiceRecording();
      });
    }

    const previewCustomVoiceBtn = document.getElementById('btnPreviewCustomVoice');
    if (previewCustomVoiceBtn) {
      previewCustomVoiceBtn.addEventListener('click', async () => {
        const res = await playStoredAudio(AUDIO_KEY_VOICE);
        if (!res.ok) {
          showToastSafe('Rekaman suara tidak ditemukan. Silakan rekam ulang.', 'warning');
          syncAudioAvailabilityFromDB();
        }
      });
    }

    const removeCustomVoiceBtn = document.getElementById('btnRemoveCustomVoice');
    if (removeCustomVoiceBtn) {
      removeCustomVoiceBtn.addEventListener('click', async () => {
        stopAudioPlayback();
        await deleteAudioBlob(AUDIO_KEY_VOICE);
        const current = getSettings();
        saveSettings({
          customVoiceName: '',
          customVoiceDuration: 0,
          soundType: current.soundType === AUDIO_KEY_VOICE ? 'default' : current.soundType
        });
        queueScheduleSyncToServer();
        updateVoiceRecorderControls(0, 'Rekaman suara dihapus. Ketuk tombol di atas untuk merekam baru.');
        renderSettingsUI();
        showToastSafe('Rekaman suara dihapus.', 'success');
      });
    }

    // Push server URL save & connect.
    const savePushBtn = document.getElementById('btnSavePushServer');
    const pushUrlInput = document.getElementById('inputPushServerUrl');
    if (savePushBtn) {
      savePushBtn.addEventListener('click', async () => {
        const rawUrl = pushUrlInput ? pushUrlInput.value : '';
        savePushBtn.disabled = true;
        const originalText = savePushBtn.textContent;
        savePushBtn.textContent = 'Menghubungkan...';

        try {
          const result = await connectAndSubscribePush(rawUrl);
          if (result.ok && result.disconnected) {
            showToastSafe('Koneksi Push Server diputus. Menggunakan pengingat lokal.', 'success');
          } else if (result.ok) {
            showToastSafe('Push Server berhasil terhubung untuk notifikasi latar belakang.', 'success');
          } else {
            showToastSafe(result.error || 'Gagal menghubungkan Push Server.', 'danger');
          }
        } finally {
          savePushBtn.disabled = false;
          savePushBtn.textContent = originalText;
          renderSettingsUI();
        }
      });
    }

    // Test notification buttons.
    const demoTestBtn = document.getElementById('btnDemoTestNotif');
    if (demoTestBtn) {
      demoTestBtn.addEventListener('click', () => {
        sendDemoPushNotification();
      });
    }

    const testNowBtn = document.getElementById('btnTestNotifNow');
    if (testNowBtn) {
      testNowBtn.addEventListener('click', () => {
        sendTestNotificationNow();
      });
    }

    const testDelayedBtn = document.getElementById('btnTestPushDelayed');
    if (testDelayedBtn) {
      testDelayedBtn.addEventListener('click', () => {
        triggerDelayedServerTest(15);
      });
    }

    // PWA install and retry controls.
    const installBtn = document.getElementById('btnInstallPwa');
    if (installBtn) {
      installBtn.addEventListener('click', () => {
        handleInstallPwaClick();
      });
    }

    const retryBtn = document.getElementById('btnRetryPushSetup');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        retryPushSetup();
      });
    }

    // Pop-up Modals for "Jadwal & Interval" and "Nada Dering & Suara".
    const bindNotifModal = (openBtnId, overlayId, closeBtnIds, onCloseCallback) => {
      const openBtn = document.getElementById(openBtnId);
      const overlay = document.getElementById(overlayId);
      if (!overlay) return;

      const closeModal = () => {
        overlay.classList.remove('active');
        if (typeof onCloseCallback === 'function') {
          onCloseCallback();
        }
        renderSettingsUI();
      };

      if (openBtn) {
        openBtn.addEventListener('click', () => {
          renderSettingsUI();
          overlay.classList.add('active');
        });
      }

      closeBtnIds.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) {
          btn.addEventListener('click', closeModal);
        }
      });

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          closeModal();
        }
      });
    };

    bindNotifModal(
      'btnOpenNotifScheduleModal',
      'notifScheduleModalOverlay',
      ['btnCloseNotifScheduleModal', 'btnDoneNotifScheduleModal']
    );

    bindNotifModal(
      'btnOpenNotifSoundModal',
      'notifSoundModalOverlay',
      ['btnCloseNotifSoundModal', 'btnDoneNotifSoundModal'],
      () => {
        stopAudioPlayback();
        if (isRecordingVoice) {
          stopVoiceRecording();
        }
      }
    );

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const scheduleOverlay = document.getElementById('notifScheduleModalOverlay');
      if (scheduleOverlay && scheduleOverlay.classList.contains('active')) {
        scheduleOverlay.classList.remove('active');
        renderSettingsUI();
      }
      const soundOverlay = document.getElementById('notifSoundModalOverlay');
      if (soundOverlay && soundOverlay.classList.contains('active')) {
        soundOverlay.classList.remove('active');
        stopAudioPlayback();
        if (isRecordingVoice) {
          stopVoiceRecording();
        }
        renderSettingsUI();
      }
    });

    syncAudioAvailabilityFromDB();
    renderSettingsUI();
  }

  // Handle tap-from-notification sound playback on app launch and SW postMessage.
  function handleIncomingNotificationParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('from') !== 'notification') return;

      const tryPlay = async () => {
        const played = await playSelectedSound({ dedupeMs: 4000 });
        if (!played && getSettings().soundType === AUDIO_KEY_UPLOAD) {
          const onFirstInteraction = () => {
            playSelectedSound({ dedupeMs: 4000 });
          };
          window.addEventListener('pointerdown', onFirstInteraction, { once: true });
          window.addEventListener('keydown', onFirstInteraction, { once: true });
        }
      };

      tryPlay();

      params.delete('from');
      const cleanedSearch = params.toString();
      const nextUrl = window.location.pathname + (cleanedSearch ? `?${cleanedSearch}` : '') + window.location.hash;
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState({}, document.title, nextUrl);
      }
    } catch (err) {
      // Ignore malformed URLs or restricted history contexts.
    }
  }

  function bindGlobalListeners() {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === 'HYDRO_NOTIFICATION_CLICKED') {
          playSoundWithRetryOnGesture({ dedupeMs: 3000 });
          if (data.isTest) {
            clearTestTimers();
            setTestFeedback('Notifikasi uji coba berhasil diterima dan dibuka.', 'success');
            showToastSafe('Notifikasi uji coba berhasil diterima.', 'success');
          }
          return;
        }

        if (data.type === 'HYDRO_PUSH_RECEIVED') {
          if (!data.isTest) {
            const nowMs = Date.now();
            lastPushReceivedAt = nowMs;
            const slot = data.slotKey || buildSlotKey(new Date(nowMs));
            recordLastFiredLock(slot, nowMs);
            saveSettings({ lastNotifiedSlot: slot });
            scheduleLocalTimer();
          }
          // Play custom user ringtone if configured when push arrives while app is open/active.
          playSoundWithRetryOnGesture({ dedupeMs: 3000 });
          if (data.isTest) {
            clearTestTimers();
            setTestFeedback('Push latar belakang berhasil diterima beserta nada pengingat!', 'success');
          }
        }
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        reconcileTimerOnWake();
      } else if (document.visibilityState === 'hidden') {
        flushPendingServerSyncs();
      }
    });

    window.addEventListener('focus', () => {
      reconcileTimerOnWake();
    });

    window.addEventListener('storage', (event) => {
      if (
        event.key === null ||
        event.key === STORAGE_KEY ||
        event.key === 'hydrotrack_logs' ||
        event.key === 'hydrotrack_settings'
      ) {
        scheduleLocalTimer();
        renderSettingsUI();
      }
    });

    window.addEventListener('pagehide', () => {
      flushPendingServerSyncs();
      if (isRecordingVoice) {
        stopVoiceRecording();
      }
      releaseMicStream();
    });
  }

  async function resetNotificationAudioData() {
    clearLocalTimer();
    clearTestTimers();
    stopAudioPlayback();
    if (isRecordingVoice) {
      stopVoiceRecording();
    }
    releaseMicStream();

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      // Ignore storage error.
    }
    lastPushErrorMessage = '';

    // Wipe IndexedDB audio immediately in parallel with quick existing-SW push unsubscribe so factory reset redirect never cuts off cleanup.
    const unsubscribeExisting = async () => {
      if (!navigator.serviceWorker || typeof navigator.serviceWorker.getRegistration !== 'function') return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || !reg.pushManager) return;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }
    };

    await Promise.allSettled([
      clearAllAudio(),
      unsubscribeExisting()
    ]);
  }

  async function resetNotificationData() {
    const prevUrl = getSettings().pushServerUrl;
    if (prevUrl) {
      await unsubscribePush(prevUrl);
    }
    await resetNotificationAudioData();
    renderSettingsUI();
  }

  function init() {
    if (!initialized) {
      initialized = true;
      bindGlobalListeners();
      handleIncomingNotificationParam();
      ensureServiceWorker().then(async (reg) => {
        if (!reg) return;
        const config = getSettings();
        if (!config.pushServerUrl) return;

        const sub = await getActivePushSubscription();
        if (config.pushConnected && !sub) {
          saveSettings({ pushConnected: false });
          renderSettingsUI();
        }

        // Auto-connect to Cloudflare Push Server on startup when permission is already granted.
        if (getNotificationPermission() === 'granted' && (!config.pushConnected || !sub)) {
          connectAndSubscribePush(config.pushServerUrl, { requestPermission: false });
        }
      });
    }

    initSettingsUI();
    scheduleLocalTimer();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => init());
    } else {
      init();
    }
  }

  return {
    DEFAULT_PUSH_SERVER_URL,
    DEFAULT_NOTIFICATION_SETTINGS,
    init,
    initSettingsUI,
    renderSettingsUI,
    getSettings,
    saveSettings,
    getPlatformState,
    buildReminderMessage,
    validateSchedule,
    getTodayScheduleSlots,
    computeNextReminder,
    scheduleLocalTimer,
    syncHydrationProgress,
    onHydrationChanged: syncHydrationProgress,
    connectAndSubscribePush,
    unsubscribePush,
    requestPermission,
    retryPushSetup,
    sendTestNotificationNow,
    triggerDelayedServerTest,
    showHydroNotification,
    playSelectedSound,
    playDefaultTone,
    stopAudioPlayback,
    saveAudioBlob,
    getAudioBlob,
    deleteAudioBlob,
    clearAllAudio,
    resetNotificationAudioData,
    resetNotificationData
  };
})();

if (typeof window !== 'undefined') {
  window.HydroNotifications = HydroNotifications;
}
