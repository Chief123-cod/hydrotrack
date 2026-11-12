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
    water: { label: 'Water', icon: 'ri-drop-fill' },
    coffee: { label: 'Coffee', icon: 'ri-cup-line' },
    energy: { label: 'Energy Drink', icon: 'ri-flashlight-line' },
    juice: { label: 'Fruit Juice', icon: 'ri-goblet-fill' },
    milk: { label: 'Milk', icon: 'ri-goblet-line' },
    qrs: { label: 'QRS', icon: 'ri-heart-pulse-line' },
    soda: { label: 'Soft Drink', icon: 'ri-drinks-2-line' },
    sports: { label: 'Sports Drink', icon: 'ri-water-flash-line' },
    tea: { label: 'Tea', icon: 'ri-leaf-line' },
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
  } catch (e) {}

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

  /* --- Helper: Get today's date string (YYYY-MM-DD) --- */
  function _todayStr() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  // CREATE — Add a new drink log
  function addLog(amount, type = 'water', note = '', timestamp = null, containerIcon = null) {
    const logs = getAllLogs();
    const now = timestamp ? new Date(timestamp) : new Date();
    const resolvedIcon = containerIcon || getContainerIconByAmount(amount);

    const newLog = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      amount: parseInt(amount),
      type: type,
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0],
      note: note.trim(),
      containerIcon: resolvedIcon
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
    if (updates.containerIcon !== undefined) logs[index].containerIcon = updates.containerIcon;
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

  // Get comprehensive analytics statistics
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

  // Auto initialize sample data on first run if localStorage is empty
  if (localStorage.getItem(KEYS.logs) === null) {
    loadSampleData();
  }

  /* ==================== CONTAINERS (DEFAULT & CUSTOM) ==================== */
  const CONTAINERS_KEY = 'hydrotrack_containers';

  const DEFAULT_CONTAINERS = [
    { id: 'cup-coffee', name: 'Coffee Cup', amount: 100, icon: 'icon-coffee' },
    { id: 'cup-tea', name: 'Tea Cup', amount: 150, icon: 'icon-cup-40' },
    { id: 'cup-small', name: 'Small Cup', amount: 175, icon: 'icon-cup-50' },
    { id: 'cup-medium', name: 'Medium Glass', amount: 200, icon: 'icon-glass-60' },
    { id: 'cup-large', name: 'Large Glass', amount: 300, icon: 'icon-glass-75' },
    { id: 'cup-bottle', name: 'Water Bottle', amount: 500, icon: 'icon-bottle' },
    { id: 'cup-bottle-lg', name: 'Large Bottle', amount: 1000, icon: 'icon-bottle-lg' }
  ];

  function getAllContainers() {
    const stored = localStorage.getItem(CONTAINERS_KEY);
    if (!stored) {
      const legacyCustom = _parse('hydrotrack_custom_containers', []);
      const initial = [...DEFAULT_CONTAINERS, ...legacyCustom];
      _save(CONTAINERS_KEY, initial);
      return initial;
    }
    return _parse(CONTAINERS_KEY, DEFAULT_CONTAINERS);
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

