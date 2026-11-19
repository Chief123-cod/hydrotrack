/* ============================================
   STORAGE.JS — LocalStorage CRUD Module
   ============================================ */

// Apply saved theme early to prevent flash of wrong theme
(function initEarlyTheme() {
  try {
    const raw = localStorage.getItem('hydrotrack_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else if (parsed.theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme-setting', 'system');
      }
    }
  } catch (e) {}
})();

const Storage = (() => {
  // LocalStorage Keys
  const KEYS = {
    logs: 'hydrotrack_logs',
    settings: 'hydrotrack_settings'
  };

  // Default Settings
  const DEFAULT_SETTINGS = {
    userName: 'Pengguna',
    dailyGoal: 2000,
    weight: 60,
    activityLevel: 'moderate',
    gender: 'prefer-not-to-say',
    theme: 'system',
    enableSound: true
  };

  // Drink Type Labels & Icons
  const DRINK_TYPES = {
    water: { label: 'Air Putih', icon: 'ri-drop-fill' },
    coffee: { label: 'Kopi', icon: 'ri-cup-line' },
    energy: { label: 'Minuman Energi', icon: 'ri-flashlight-line' },
    juice: { label: 'Jus Buah', icon: 'ri-goblet-fill' },
    milk: { label: 'Susu', icon: 'ri-goblet-line' },
    qrs: { label: 'Oralit', icon: 'ri-heart-pulse-line' },
    soda: { label: 'Minuman Soda', icon: 'ri-drinks-2-line' },
    sports: { label: 'Minuman Isotonik', icon: 'ri-water-flash-line' },
    tea: { label: 'Teh', icon: 'ri-leaf-line' },
    coconut: { label: 'Air Kelapa', icon: 'ri-plant-line' }
  };

  const CUSTOM_BEVERAGES_KEY = 'hydrotrack_custom_beverages';

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

  // Merge stored custom beverages into DRINK_TYPES on load
  try {
    const storedCustom = _parse(CUSTOM_BEVERAGES_KEY, {});
    Object.assign(DRINK_TYPES, storedCustom);
  } catch (e) { }

  function getCustomBeverages() {
    return _parse(CUSTOM_BEVERAGES_KEY, {});
  }

  function addCustomBeverage(name, icon = 'ri-cup-line') {
    const custom = getCustomBeverages();
    const id = 'bev-' + Date.now();
    custom[id] = { label: name.trim(), icon: icon };
    DRINK_TYPES[id] = custom[id];
    _save(CUSTOM_BEVERAGES_KEY, custom);
    return { id, ...custom[id] };
  }

  /* --- Helper: Save to LocalStorage --- */
  function _save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error(`Error saving to localStorage key "${key}":`, e);
    }
  }

  /* --- Helper: Format any Date or timestamp to local date string (YYYY-MM-DD) --- */
  function formatDateKey(d) {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /* --- Helper: Get today's date string (YYYY-MM-DD) in user's local time --- */
  function _todayStr() {
    return formatDateKey(new Date());
  }

  /* ==================== LOGS CRUD ==================== */

  // Helper to get container icon based on amount or matching container
  function getContainerIconByAmount(amount) {
    const amt = parseInt(amount) || 0;
    const containers = getAllContainers ? getAllContainers() : DEFAULT_CONTAINERS;
    const matched = containers.find(c => c.amount === amt);
    if (matched && matched.icon) return matched.icon;

    if (amt <= 120) return 'icon-coffee';
    if (amt <= 160) return 'icon-cup-40';
    if (amt <= 180) return 'icon-cup-50';
    if (amt <= 250) return 'icon-glass-60';
    if (amt <= 350) return 'icon-glass-75';
    if (amt <= 750) return 'icon-bottle';
    return 'icon-bottle-lg';
  }

  // CREATE — Add a new drink log (selalu menggunakan tanggal lokal pengguna, bukan UTC)
  function addLog(amount, type = 'water', note = '', timestamp = null, containerIcon = null) {
    const logs = getAllLogs();
    const now = timestamp ? new Date(timestamp) : new Date();
    const resolvedIcon = containerIcon || getContainerIconByAmount(amount);

    const newLog = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      amount: parseInt(amount),
      type: type,
      timestamp: now.toISOString(),
      date: formatDateKey(now),
      note: note.trim(),
      containerIcon: resolvedIcon
    };

    logs.push(newLog);
    _save(KEYS.logs, logs);
    return newLog;
  }

  // READ — Get all logs (dengan auto-healing koreksi tanggal UTC ke tanggal lokal)
  function getAllLogs() {
    const logs = _parse(KEYS.logs, []);
    let modified = false;
    logs.forEach(log => {
      if (log.timestamp) {
        const correctDate = formatDateKey(log.timestamp);
        if (log.date !== correctDate) {
          log.date = correctDate;
          modified = true;
        }
      }
    });
    if (modified) {
      _save(KEYS.logs, logs);
    }
    return logs;
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
    if (updates.containerIcon !== undefined) logs[index].containerIcon = updates.containerIcon;
    if (updates.timestamp !== undefined) {
      const newDate = new Date(updates.timestamp);
      logs[index].timestamp = newDate.toISOString();
      logs[index].date = formatDateKey(newDate);
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

  // DELETE BEFORE DATE — Delete logs strictly before specified date (YYYY-MM-DD)
  function deleteLogsBeforeDate(cutoffDate) {
    if (!cutoffDate) return 0;
    const logs = getAllLogs();
    const remaining = logs.filter(log => log.date >= cutoffDate);
    const count = logs.length - remaining.length;
    _save(KEYS.logs, remaining);
    return count;
  }

  // DELETE LOCAL DATA ONLY — Clear only log entries for local device
  function deleteLocalLogsOnly() {
    _save(KEYS.logs, []);
    return true;
  }

  // RESET ALL DATA — Wipe all logs, settings, and custom items
  function resetAllData() {
    try {
      localStorage.removeItem(KEYS.logs);
      localStorage.removeItem(KEYS.settings);
      localStorage.removeItem(CUSTOM_BEVERAGES_KEY);
      localStorage.removeItem('hydrotrack_containers');
      localStorage.removeItem('hydrotrack_custom_containers');
      localStorage.removeItem('hydrotrack_logs_cleared_fresh');
      return true;
    } catch (e) {
      console.error('Error resetting all data:', e);
      return false;
    }
  }

  // Get total unique active days tracked
  function getDaysTrackedCount() {
    const logs = getAllLogs();
    const uniqueDates = new Set(logs.map(log => log.date));
    return uniqueDates.size;
  }

  // EXPORT — Download all logs as CSV file (Bonus Feature)
  function exportLogsToCSV() {
    const logs = getAllLogs();
    if (logs.length === 0) return false;

    const headers = ['ID', 'Tanggal', 'Waktu', 'Jenis Minuman', 'Volume (ml)', 'Catatan'];
    const rows = logs.map(log => {
      const typeLabel = DRINK_TYPES[log.type] ? DRINK_TYPES[log.type].label : log.type;
      const dateObj = new Date(log.timestamp);
      const formattedDate = dateObj.toLocaleDateString('id-ID');
      const formattedTime = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const cleanNote = (log.note || '').replace(/"/g, '""');

      return [
        `"${log.id}"`,
        `"${formattedDate}"`,
        `"${formattedTime}"`,
        `"${typeLabel}"`,
        log.amount,
        `"${cleanNote}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `hydrotrack_logs_${_todayStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
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
      const dateStr = formatDateKey(date);
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

  // Get drink distribution for last N days
  function getDrinkDistribution(days) {
    const logs = getLogsLastDays(days);
    const distribution = {};

    // Initialize all types with 0
    Object.keys(DRINK_TYPES).forEach(type => {
      distribution[type] = 0;
    });

    logs.forEach(log => {
      const type = log.type && DRINK_TYPES[log.type] ? log.type : 'water';
      distribution[type] = (distribution[type] || 0) + log.amount;
    });

    return distribution;
  }

  // Get comprehensive analytics statistics (Legacy)
  function getAnalyticsStats(days) {
    const daily = getDailyTotals(days);
    const settings = getSettings();
    const totalIntake = daily.reduce((sum, d) => sum + d.total, 0);
    const avgDaily = days > 0 ? Math.round(totalIntake / days) : 0;

    let bestDay = { dayName: '-', total: 0, date: '' };
    let goalsMet = 0;

    daily.forEach(d => {
      if (d.total > bestDay.total) {
        bestDay = { dayName: d.dayName, total: d.total, date: d.date };
      }
      if (d.total >= settings.dailyGoal) {
        goalsMet++;
      }
    });

    const completionRate = days > 0 ? Math.round((goalsMet / days) * 100) : 0;

    return {
      daily,
      avgDaily,
      bestDay,
      goalsMet,
      completionRate,
      totalIntake,
      dailyGoal: settings.dailyGoal
    };
  }

  // Get comprehensive Statistics Data (Medium Cards, Overview, Beverage Breakdown, Container Usage)
  function getStatisticsData(period = 'all') {
    let logs = getAllLogs();
    const settings = getSettings();
    const dailyGoal = settings.dailyGoal || 2000;

    // Filter logs if period is specified
    if (period && period !== 'all') {
      const numDays = parseInt(period);
      if (!isNaN(numDays) && numDays > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - numDays + 1);
        cutoff.setHours(0, 0, 0, 0);
        logs = logs.filter(l => new Date(l.timestamp) >= cutoff);
      }
    }

    // 1. Group logs by date
    const dayMap = {};
    logs.forEach(l => {
      const d = l.date || (l.timestamp ? l.timestamp.split('T')[0] : '');
      if (!d) return;
      if (!dayMap[d]) dayMap[d] = [];
      dayMap[d].push(l);
    });

    const uniqueDates = Object.keys(dayMap);
    const daysTracked = uniqueDates.length;
    const totalIntake = logs.reduce((sum, l) => sum + (parseInt(l.amount) || 0), 0);
    const dailyAverage = daysTracked > 0 ? Math.round(totalIntake / daysTracked) : 0;

    let goalsMet = 0;
    uniqueDates.forEach(d => {
      const daySum = dayMap[d].reduce((s, l) => s + (parseInt(l.amount) || 0), 0);
      if (daySum >= dailyGoal) goalsMet++;
    });

    const successRate = daysTracked > 0 ? Math.round((goalsMet / daysTracked) * 100) : 0;

    // 2. Current Streak calculation (across all recorded logs)
    const allLogs = getAllLogs();
    const allDayMap = {};
    allLogs.forEach(l => {
      const d = l.date || (l.timestamp ? l.timestamp.split('T')[0] : '');
      if (d) allDayMap[d] = (allDayMap[d] || 0) + (parseInt(l.amount) || 0);
    });

    let currentStreak = 0;
    const streakCursor = new Date();
    streakCursor.setHours(0, 0, 0, 0);
    const todayKey = formatDateKey(streakCursor);

    if ((allDayMap[todayKey] || 0) >= dailyGoal) {
      currentStreak++;
      streakCursor.setDate(streakCursor.getDate() - 1);
    } else {
      streakCursor.setDate(streakCursor.getDate() - 1);
    }

    while (true) {
      const k = formatDateKey(streakCursor);
      if ((allDayMap[k] || 0) >= dailyGoal) {
        currentStreak++;
        streakCursor.setDate(streakCursor.getDate() - 1);
      } else {
        break;
      }
    }

    // 3. Average Interval between drinks (in days with >= 2 logs)
    let totalIntervalMin = 0;
    let intervalCount = 0;
    uniqueDates.forEach(d => {
      const dayLogs = dayMap[d].slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      for (let i = 1; i < dayLogs.length; i++) {
        const diffMs = new Date(dayLogs[i].timestamp) - new Date(dayLogs[i - 1].timestamp);
        const diffMin = Math.round(diffMs / 60000);
        if (diffMin > 0 && diffMin <= 960) {
          totalIntervalMin += diffMin;
          intervalCount++;
        }
      }
    });

    let avgIntervalStr = '-';
    if (intervalCount > 0) {
      const avgMin = Math.round(totalIntervalMin / intervalCount);
      const hours = Math.floor(avgMin / 60);
      const mins = avgMin % 60;
      if (hours > 0 && mins > 0) {
        avgIntervalStr = `${hours}j ${mins}m`;
      } else if (hours > 0) {
        avgIntervalStr = `${hours} jam`;
      } else {
        avgIntervalStr = `${mins} mnt`;
      }
    }

    // 4. Drink sizes
    const avgDrinkSize = logs.length > 0 ? Math.round(totalIntake / logs.length) : 0;
    const largestDrink = logs.length > 0 ? Math.max(...logs.map(l => parseInt(l.amount) || 0)) : 0;

    // 5. First Drink & Last Drink (Average time of day)
    let sumFirstMin = 0;
    let sumLastMin = 0;
    let validDaysWithTime = 0;

    uniqueDates.forEach(d => {
      const dayLogs = dayMap[d].slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      if (dayLogs.length > 0) {
        const fDate = new Date(dayLogs[0].timestamp);
        const lDate = new Date(dayLogs[dayLogs.length - 1].timestamp);
        sumFirstMin += fDate.getHours() * 60 + fDate.getMinutes();
        sumLastMin += lDate.getHours() * 60 + lDate.getMinutes();
        validDaysWithTime++;
      }
    });

    function formatTimeMinutes(minTotal) {
      const hh = String(Math.floor(minTotal / 60)).padStart(2, '0');
      const mm = String(minTotal % 60).padStart(2, '0');
      return `${hh}:${mm}`;
    }

    const firstDrinkStr = validDaysWithTime > 0 ? formatTimeMinutes(Math.round(sumFirstMin / validDaysWithTime)) : '-';
    const lastDrinkStr = validDaysWithTime > 0 ? formatTimeMinutes(Math.round(sumLastMin / validDaysWithTime)) : '-';

    // 6. Beverage Breakdown
    const bevColors = {
      water: '#2E86DE',
      tea: '#10B981',
      coffee: '#8B5A2B',
      juice: '#F59E0B',
      milk: '#06B6D4',
      energy: '#EF4444',
      sports: '#3B82F6',
      soda: '#EC4899',
      coconut: '#14B8A6',
      qrs: '#8B5CF6'
    };

    const bevAmountMap = {};
    Object.keys(DRINK_TYPES).forEach(k => { bevAmountMap[k] = 0; });
    logs.forEach(l => {
      const t = l.type || 'water';
      bevAmountMap[t] = (bevAmountMap[t] || 0) + (parseInt(l.amount) || 0);
    });

    const beverageBreakdown = [];
    Object.keys(DRINK_TYPES).forEach(key => {
      const amount = bevAmountMap[key] || 0;
      const typeInfo = DRINK_TYPES[key];
      const pct = totalIntake > 0 ? Math.round((amount / totalIntake) * 100) : 0;
      beverageBreakdown.push({
        type: key,
        label: typeInfo.label || key,
        icon: typeInfo.icon || 'ri-drop-fill',
        amount: amount,
        percentage: pct,
        color: bevColors[key] || '#6366F1'
      });
    });

    // Urutkan: yang sudah ada asupan didahulukan
    beverageBreakdown.sort((a, b) => b.amount - a.amount);

    // 7. Container Usage (Hanya tampil jika ada input minuman)
    const allContainers = getAllContainers();
    const containerUsage = [];

    allContainers.forEach(c => {
      const uses = logs.filter(l => l.containerId === c.id || l.amount === c.amount).length;
      if (uses > 0) {
        containerUsage.push({
          id: c.id,
          name: c.name,
          amount: c.amount,
          icon: c.icon,
          uses: uses
        });
      }
    });

    const totalUses = containerUsage.reduce((s, c) => s + c.uses, 0);
    containerUsage.forEach(c => {
      c.percentage = totalUses > 0 ? Math.round((c.uses / totalUses) * 100) : 0;
    });

    containerUsage.sort((a, b) => b.uses - a.uses);

    return {
      period,
      totalIntake,
      dailyAverage,
      successRate,
      daysTracked,
      goalsMet,
      dailyGoal,
      currentStreak,
      avgIntervalStr,
      avgDrinkSize,
      largestDrink,
      firstDrinkStr,
      lastDrinkStr,
      beverageBreakdown,
      containerUsage,
      totalUses,
      hasData: logs.length > 0
    };
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
          date: formatDateKey(logDate),
          note: ''
        });
      }
    }

    _save(KEYS.logs, sampleLogs);
    saveSettings({ userName: 'Matthew', dailyGoal: 2500 });
  }

  // Initialize with empty logs on first run (clean state for real user input)
  if (localStorage.getItem(KEYS.logs) === null) {
    _save(KEYS.logs, []);
  }

  // Clear previous sample logs if requested so user starts completely clean with 0 ml
  if (localStorage.getItem('hydrotrack_logs_cleared_fresh') !== 'true') {
    _save(KEYS.logs, []);
    localStorage.setItem('hydrotrack_logs_cleared_fresh', 'true');
  }

  /* ==================== CONTAINERS (DEFAULT & CUSTOM) ==================== */
  const CONTAINERS_KEY = 'hydrotrack_containers';

  const DEFAULT_CONTAINERS = [
    { id: 'cup-coffee', name: 'Cangkir Kopi', amount: 100, icon: 'icon-coffee' },
    { id: 'cup-tea', name: 'Cangkir Teh', amount: 150, icon: 'icon-cup-40' },
    { id: 'cup-small', name: 'Gelas Kecil', amount: 175, icon: 'icon-cup-50' },
    { id: 'cup-medium', name: 'Gelas Sedang', amount: 200, icon: 'icon-glass-60' },
    { id: 'cup-large', name: 'Gelas Besar', amount: 300, icon: 'icon-glass-75' },
    { id: 'cup-bottle', name: 'Botol Minum', amount: 500, icon: 'icon-bottle' },
    { id: 'cup-bottle-lg', name: 'Botol Besar', amount: 1000, icon: 'icon-bottle-lg' }
  ];

  const LEGACY_CONTAINER_NAME_MAP = {
    'cup-coffee': { en: 'Coffee Cup', id: 'Cangkir Kopi' },
    'cup-tea': { en: 'Tea Cup', id: 'Cangkir Teh' },
    'cup-small': { en: 'Small Cup', id: 'Gelas Kecil' },
    'cup-medium': { en: 'Medium Glass', id: 'Gelas Sedang' },
    'cup-large': { en: 'Large Glass', id: 'Gelas Besar' },
    'cup-bottle': { en: 'Water Bottle', id: 'Botol Minum' },
    'cup-bottle-lg': { en: 'Large Bottle', id: 'Botol Besar' }
  };

  function getAllContainers() {
    const stored = localStorage.getItem(CONTAINERS_KEY);
    if (!stored) {
      const legacyCustom = _parse('hydrotrack_custom_containers', []);
      const initial = [...DEFAULT_CONTAINERS, ...legacyCustom];
      _save(CONTAINERS_KEY, initial);
      return initial;
    }
    const parsed = _parse(CONTAINERS_KEY, DEFAULT_CONTAINERS);
    let migrated = false;
    parsed.forEach(c => {
      const mapItem = LEGACY_CONTAINER_NAME_MAP[c.id];
      if (mapItem && c.name === mapItem.en) {
        c.name = mapItem.id;
        migrated = true;
      }
    });
    if (migrated) {
      _save(CONTAINERS_KEY, parsed);
    }
    return parsed;
  }

  function getCustomContainers() {
    return getAllContainers();
  }

  function addCustomContainer(name, amount, icon = 'icon-glass-60') {
    const list = getAllContainers();
    const newContainer = {
      id: 'container-' + Date.now(),
      name: name.trim(),
      amount: parseInt(amount),
      icon: icon
    };
    list.push(newContainer);
    _save(CONTAINERS_KEY, list);
    return newContainer;
  }

  function updateCustomContainer(id, updates) {
    const list = getAllContainers();
    const index = list.findIndex(c => c.id === id);
    if (index === -1) return null;
    if (updates.name) list[index].name = updates.name.trim();
    if (updates.amount) list[index].amount = parseInt(updates.amount);
    if (updates.icon) list[index].icon = updates.icon;
    _save(CONTAINERS_KEY, list);
    return list[index];
  }

  function deleteCustomContainer(id) {
    const list = getAllContainers();
    const filtered = list.filter(c => c.id !== id);
    if (filtered.length === list.length) return false;
    _save(CONTAINERS_KEY, filtered);
    return true;
  }

  /* ==================== HISTORY ADVANCED QUERIES ==================== */

  // 1. Weekly History Data
  function getWeeklyHistory(weekOffset = 0) {
    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - currentDayOfWeek + (weekOffset * 7));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const settings = getSettings();
    const dailyGoal = settings.dailyGoal || 2000;
    const allLogs = getAllLogs();

    const days = [];
    let totalIntake = 0;
    let bestDay = { date: '', dayName: '', dayNum: '', total: 0 };
    let hasData = false;

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateKey = formatDateKey(d);

      const dayLogs = allLogs.filter(log => log.date === dateKey);
      const dayTotal = dayLogs.reduce((sum, log) => sum + (log.amount || 0), 0);
      if (dayTotal > 0) hasData = true;

      totalIntake += dayTotal;

      const dayName = d.toLocaleDateString('id-ID', { weekday: 'short' });
      const dayNum = String(d.getDate()).padStart(2, '0');

      if (dayTotal > bestDay.total) {
        bestDay = { date: dateKey, dayName, dayNum, total: dayTotal };
      }

      days.push({
        date: dateKey,
        dayNum: dayNum,
        dayName: dayName,
        total: dayTotal,
        goalMet: dayTotal >= dailyGoal && dailyGoal > 0,
        percentage: dailyGoal > 0 ? Math.round((dayTotal / dailyGoal) * 100) : 0,
        isToday: dateKey === _todayStr()
      });
    }

    let periodLabel = '';
    if (weekOffset === 0) {
      periodLabel = 'Minggu Ini';
    } else if (weekOffset === -1) {
      periodLabel = 'Minggu Lalu';
    } else {
      const startStr = startOfWeek.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      const endStr = endOfWeek.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      periodLabel = `${startStr} - ${endStr}`;
    }

    const average = Math.round(totalIntake / 7);

    return {
      periodLabel,
      weekOffset,
      startDate: formatDateKey(startOfWeek),
      endDate: formatDateKey(endOfWeek),
      days,
      totalIntake,
      average,
      bestDay: bestDay.total > 0 ? bestDay : null,
      dailyGoal,
      hasData
    };
  }

  // 2. Monthly History Data
  function getMonthlyHistory(monthOffset = 0) {
    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth(); // 0 - 11

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const totalDaysInPrevMonth = new Date(year, month, 0).getDate();

    const settings = getSettings();
    const dailyGoal = settings.dailyGoal || 2000;
    const allLogs = getAllLogs();

    let daysTracked = 0;
    let goalsMet = 0;
    let totalIntake = 0;
    let hasData = false;

    const days = [];

    for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
      const d = new Date(year, month, dayNum);
      const dateKey = formatDateKey(d);

      const dayLogs = allLogs.filter(log => log.date === dateKey);
      const dayTotal = dayLogs.reduce((sum, log) => sum + (log.amount || 0), 0);

      if (dayTotal > 0) {
        daysTracked++;
        hasData = true;
      }
      if (dayTotal >= dailyGoal && dailyGoal > 0) {
        goalsMet++;
      }
      totalIntake += dayTotal;

      days.push({
        date: dateKey,
        dayNum: dayNum,
        dayOfWeek: d.getDay(),
        total: dayTotal,
        goalMet: dayTotal >= dailyGoal && dailyGoal > 0,
        isToday: dateKey === _todayStr()
      });
    }

    let periodLabel = '';
    if (monthOffset === 0) {
      periodLabel = 'Bulan Ini';
    } else if (monthOffset === -1) {
      periodLabel = 'Bulan Lalu';
    } else {
      periodLabel = targetDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    }

    const successRate = daysTracked > 0 ? Math.round((goalsMet / daysTracked) * 100) : 0;

    return {
      periodLabel,
      monthOffset,
      year,
      month,
      firstDayIndex,
      totalDaysInMonth,
      totalDaysInPrevMonth,
      days,
      daysTracked,
      goalsMet,
      successRate,
      totalIntake,
      dailyGoal,
      hasData
    };
  }

  // 3. Yearly History Data
  function getYearlyHistory(yearOffset = 0) {
    const now = new Date();
    const year = now.getFullYear() + yearOffset;

    const settings = getSettings();
    const dailyGoal = settings.dailyGoal || 2000;
    const allLogs = getAllLogs();

    const days = [];
    let daysTracked = 0;
    let goalsMet = 0;
    let totalIntake = 0;
    let hasData = false;

    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const totalDays = isLeap ? 366 : 365;

    const cur = new Date(year, 0, 1);
    for (let i = 0; i < totalDays; i++) {
      const dateKey = formatDateKey(cur);
      const dayLogs = allLogs.filter(log => log.date === dateKey);
      const dayTotal = dayLogs.reduce((sum, log) => sum + (log.amount || 0), 0);

      if (dayTotal > 0) {
        daysTracked++;
        hasData = true;
      }
      if (dayTotal >= dailyGoal && dailyGoal > 0) {
        goalsMet++;
      }
      totalIntake += dayTotal;

      let level = 0;
      if (dayTotal > 0) {
        if (dayTotal >= dailyGoal) level = 3;
        else if (dayTotal >= dailyGoal / 2) level = 2;
        else level = 1;
      }

      days.push({
        date: dateKey,
        month: cur.getMonth(),
        dayNum: cur.getDate(),
        total: dayTotal,
        goalMet: dayTotal >= dailyGoal && dailyGoal > 0,
        level: level,
        isToday: dateKey === _todayStr()
      });

      cur.setDate(cur.getDate() + 1);
    }

    let periodLabel = '';
    if (yearOffset === 0) {
      periodLabel = 'Tahun Ini';
    } else if (yearOffset === -1) {
      periodLabel = 'Tahun Lalu';
    } else {
      periodLabel = `${year}`;
    }

    return {
      periodLabel,
      yearOffset,
      year,
      days,
      daysTracked,
      goalsMet,
      totalIntake,
      dailyGoal,
      hasData
    };
  }

  /* ==================== PUBLIC API ==================== */
  return {
    DRINK_TYPES,
    formatDateKey,
    getWeeklyHistory,
    getMonthlyHistory,
    getYearlyHistory,
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
    deleteLogsBeforeDate,
    deleteLocalLogsOnly,
    resetAllData,
    getDaysTrackedCount,
    exportLogsToCSV,
    getSettings,
    saveSettings,
    getTodayTotal,
    getTodayPercentage,
    getTodayRemaining,
    getTodayGlasses,
    getDailyTotals,
    getDrinkDistribution,
    getAnalyticsStats,
    getStatisticsData,
    loadSampleData,
    getContainerIconByAmount,
    getCustomBeverages,
    addCustomBeverage,
    getAllContainers,
    getCustomContainers,
    addCustomContainer,
    updateCustomContainer,
    deleteCustomContainer
  };
})();

