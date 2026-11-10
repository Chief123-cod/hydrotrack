/* ============================================
   STORAGE.JS — LocalStorage CRUD Module
   ============================================ */

const Storage = (() => {
  // LocalStorage Keys
  const KEYS = {
    logs: 'hydrotrack_logs',
    settings: 'hydrotrack_settings'
  };

  // Default Settings
  const DEFAULT_SETTINGS = {
    userName: 'User',
    dailyGoal: 2000,
    weight: 60,
    activityLevel: 'moderate',
    enableSound: true
  };

  // Drink Type Labels & Icons
  const DRINK_TYPES = {
    water: { label: 'Air Mineral', icon: 'ri-drop-fill' },
    tea: { label: 'Teh Hijau', icon: 'ri-cup-line' },
    coffee: { label: 'Kopi', icon: 'ri-cup-fill' },
    juice: { label: 'Jus Buah', icon: 'ri-goblet-fill' },
    milk: { label: 'Susu', icon: 'ri-goblet-line' },
    coconut: { label: 'Air Kelapa', icon: 'ri-plant-line' }
  };

  /* --- Helper: Safe JSON Parse --- */
  function _parse(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error(`Error parsing localStorage key "${key}":`, e);
      return fallback;
    }
  }

  /* --- Helper: Save to LocalStorage --- */
  function _save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error(`Error saving to localStorage key "${key}":`, e);
    }
  }

  /* --- Helper: Get today's date string (YYYY-MM-DD) --- */
  function _todayStr() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /* ==================== LOGS CRUD ==================== */

  // CREATE — Add a new drink log
  function addLog(amount, type = 'water', note = '', timestamp = null) {
    const logs = getAllLogs();
    const now = timestamp ? new Date(timestamp) : new Date();

    const newLog = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      amount: parseInt(amount),
      type: type,
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0],
      note: note.trim()
    };

    logs.push(newLog);
    _save(KEYS.logs, logs);
    return newLog;
  }

  // READ — Get all logs
  function getAllLogs() {
    return _parse(KEYS.logs, []);
  }

  // READ — Get logs for today
  function getTodayLogs() {
    const today = _todayStr();
    return getAllLogs().filter(log => log.date === today);
  }

  // READ — Get logs for a specific date
  function getLogsByDate(dateStr) {
    return getAllLogs().filter(log => log.date === dateStr);
  }

  // READ — Get logs for last N days
  function getLogsLastDays(days) {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    return getAllLogs().filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= start && logDate <= now;
    });
  }

  // READ — Get a single log by ID
  function getLogById(id) {
    return getAllLogs().find(log => log.id === id) || null;
  }

  // READ & SEARCH — Get filtered logs
  function getFilteredLogs({ search = '', dateRange = '7days', drinkType = 'all' } = {}) {
    let logs = getAllLogs();

    // 1. Date Range Filter
    const now = new Date();
    if (dateRange === 'today') {
      const todayStr = _todayStr();
      logs = logs.filter(log => log.date === todayStr);
    } else if (dateRange === '7days') {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      logs = logs.filter(log => new Date(log.timestamp) >= start);
    } else if (dateRange === '30days') {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      logs = logs.filter(log => new Date(log.timestamp) >= start);
    }

    // 2. Drink Type Filter
    if (drinkType && drinkType !== 'all') {
      logs = logs.filter(log => log.type === drinkType);
    }

    // 3. Search Keyword (in note, drink type label, or amount)
    if (search && search.trim() !== '') {
      const term = search.trim().toLowerCase();
      logs = logs.filter(log => {
        const typeInfo = DRINK_TYPES[log.type];
        const typeLabel = typeInfo ? typeInfo.label.toLowerCase() : '';
        const note = (log.note || '').toLowerCase();
        return note.includes(term) || typeLabel.includes(term) || `${log.amount}`.includes(term);
      });
    }

    // Sort descending by timestamp
    return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // UPDATE — Edit an existing log
  function updateLog(id, updates) {
    const logs = getAllLogs();
    const index = logs.findIndex(log => log.id === id);

    if (index === -1) return null;

    if (updates.amount !== undefined) logs[index].amount = parseInt(updates.amount);
    if (updates.type !== undefined) logs[index].type = updates.type;
    if (updates.note !== undefined) logs[index].note = updates.note.trim();
    if (updates.timestamp !== undefined) {
      const newDate = new Date(updates.timestamp);
      logs[index].timestamp = newDate.toISOString();
      logs[index].date = newDate.toISOString().split('T')[0];
    }

    _save(KEYS.logs, logs);
    return logs[index];
  }

  // DELETE — Remove a log by ID
  function deleteLog(id) {
    const logs = getAllLogs();
    const filtered = logs.filter(log => log.id !== id);

    if (filtered.length === logs.length) return false;

    _save(KEYS.logs, filtered);
    return true;
  }

  // DELETE ALL — Clear all logs
  function clearAllLogs() {
    _save(KEYS.logs, []);
  }

  /* ==================== SETTINGS ==================== */

  // Get settings (with defaults)
  function getSettings() {
    return { ...DEFAULT_SETTINGS, ..._parse(KEYS.settings, {}) };
  }

  // Save settings
  function saveSettings(updates) {
    const current = getSettings();
    const merged = { ...current, ...updates };
    _save(KEYS.settings, merged);
    return merged;
  }

  /* ==================== STATISTICS ==================== */

  // Get today's total intake
  function getTodayTotal() {
    return getTodayLogs().reduce((sum, log) => sum + log.amount, 0);
  }

  // Get today's percentage
  function getTodayPercentage() {
    const settings = getSettings();
    const total = getTodayTotal();
    return Math.min(Math.round((total / settings.dailyGoal) * 100), 100);
  }

  // Get remaining ml for today
  function getTodayRemaining() {
    const settings = getSettings();
    const total = getTodayTotal();
    return Math.max(settings.dailyGoal - total, 0);
  }

  // Get glass count (1 glass = 250 ml)
  function getTodayGlasses() {
    const total = getTodayTotal();
    return Math.floor(total / 250);
  }

  // Get daily totals for last N days (for chart)
  function getDailyTotals(days) {
    const result = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayLogs = getLogsByDate(dateStr);
      const total = dayLogs.reduce((sum, log) => sum + log.amount, 0);

      result.push({
        date: dateStr,
        dayName: date.toLocaleDateString('id-ID', { weekday: 'short' }),
        total: total
      });
    }

    return result;
  }

  /* ==================== SAMPLE DATA ==================== */

  function loadSampleData() {
    const today = new Date();
    const sampleLogs = [];
    const types = ['water', 'water', 'water', 'tea', 'coffee', 'juice'];

    // Generate 7 days of sample data
    for (let d = 6; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const logCount = 4 + Math.floor(Math.random() * 5);

      for (let i = 0; i < logCount; i++) {
        const hour = 7 + Math.floor(Math.random() * 14);
        const minute = Math.floor(Math.random() * 60);
        const logDate = new Date(date);
        logDate.setHours(hour, minute, 0, 0);

        sampleLogs.push({
          id: 'log-' + logDate.getTime() + '-' + Math.random().toString(36).substring(2, 7),
          amount: [100, 250, 250, 250, 500, 600][Math.floor(Math.random() * 6)],
          type: types[Math.floor(Math.random() * types.length)],
          timestamp: logDate.toISOString(),
          date: logDate.toISOString().split('T')[0],
          note: ''
        });
      }
    }

    _save(KEYS.logs, sampleLogs);
    saveSettings({ userName: 'Matthew', dailyGoal: 2500 });
  }

  /* ==================== PUBLIC API ==================== */
  return {
    DRINK_TYPES,
    addLog,
    getAllLogs,
    getTodayLogs,
    getLogsByDate,
    getLogsLastDays,
    getLogById,
    getFilteredLogs,
    updateLog,
    deleteLog,
    clearAllLogs,
    getSettings,
    saveSettings,
    getTodayTotal,
    getTodayPercentage,
    getTodayRemaining,
    getTodayGlasses,
    getDailyTotals,
    loadSampleData
  };
})();

