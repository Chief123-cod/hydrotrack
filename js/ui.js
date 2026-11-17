/* ============================================
   UI.JS — DOM Manipulation & Render Module
   ============================================ */

const UI = (() => {

  /* ==================== DASHBOARD RENDERING ==================== */

  // Update user name in header and sidebar
  function updateUserInfo() {
    const settings = Storage.getSettings();
    const headerUser = document.getElementById('headerUserName');
    if (headerUser) headerUser.textContent = settings.userName;
    const sidebarUser = document.getElementById('sidebarUserName');
    if (sidebarUser) sidebarUser.textContent = settings.userName;
    const topHeaderUser = document.getElementById('topHeaderUserName');
    if (topHeaderUser) topHeaderUser.textContent = settings.userName;
    updateGreeting();
  }

  // Update greeting dynamically based on hour of day
  function updateGreeting() {
    const greetingEl = document.getElementById('greetingTime');
    if (!greetingEl) return;

    const hour = new Date().getHours();
    let greeting = 'Good Evening';

    if (hour >= 4 && hour < 11) {
      greeting = 'Good Morning';
    } else if (hour >= 11 && hour < 15) {
      greeting = 'Good Afternoon';
    } else if (hour >= 15 && hour < 19) {
      greeting = 'Good Evening';
    } else {
      greeting = 'Good Night';
    }

    greetingEl.textContent = greeting;
  }

  // Update all dashboard metric cards
  function updateDashboardMetrics() {
    if (!document.getElementById('view-dashboard')) return;

    const todayTotal = Storage.getTodayTotal();
    const percentage = Storage.getTodayPercentage();
    const remaining = Storage.getTodayRemaining();
    const glasses = Storage.getTodayGlasses();
    const settings = Storage.getSettings();

    // Metric cards (if present)
    const intakeEl = document.getElementById('metricTodayIntake');
    if (intakeEl) intakeEl.textContent = formatMl(todayTotal);

    const percEl = document.getElementById('metricPercentage');
    if (percEl) percEl.textContent = percentage + '%';

    const remEl = document.getElementById('metricRemaining');
    if (remEl) remEl.textContent = formatMl(remaining);

    const glassesEl = document.getElementById('metricGlasses');
    if (glassesEl) glassesEl.textContent = glasses + ' gelas';

    // Bottle visualization
    updateBottle(percentage);

    // Goal progress
    const goalTarget = document.getElementById('goalTarget');
    if (goalTarget) {
      goalTarget.textContent = formatMl(todayTotal) + ' / ' + formatMl(settings.dailyGoal);
    }

    const progFill = document.getElementById('progressBarFill');
    if (progFill) progFill.style.width = percentage + '%';

    // Goal message
    const goalMsg = document.getElementById('goalMessage');
    if (goalMsg) {
      if (percentage === 0) {
        goalMsg.textContent = 'Mulai minum air untuk mencapai targetmu!';
      } else if (percentage < 25) {
        goalMsg.textContent = 'Awal yang baik! Teruskan minum air. 💪';
      } else if (percentage < 50) {
        goalMsg.textContent = 'Kerja bagus! Kamu sudah seperempatnya.';
      } else if (percentage < 75) {
        goalMsg.textContent = 'Luar biasa! Lebih dari setengah jalan! 🎯';
      } else if (percentage < 100) {
        goalMsg.textContent = 'Hampir tercapai! Sedikit lagi! 🔥';
      } else {
        goalMsg.textContent = 'Target harian tercapai! Kamu hebat! 🏆🎉';
      }
    }

    updateUserInfo();
  }

  // Update water bottle fill
  function updateBottle(percentage) {
    const fill = document.getElementById('bottleFill');
    const label = document.getElementById('bottlePercentage');
    const status = document.getElementById('bottleStatus');

    if (!fill || !label) return;

    fill.style.height = percentage + '%';
    label.textContent = percentage + '%';

    // Change percentage text color based on fill level
    if (percentage > 45) {
      label.style.color = '#FFFFFF';
      label.style.textShadow = '0 1px 3px rgba(0,0,0,0.3)';
    } else {
      label.style.color = 'var(--color-text-primary)';
      label.style.textShadow = '0 1px 2px rgba(255,255,255,0.6)';
    }

    if (status) {
      if (percentage === 0) {
        status.textContent = 'Ayo mulai minum air! 💧';
      } else if (percentage < 30) {
        status.textContent = 'Terus tingkatkan! 🌊';
      } else if (percentage < 60) {
        status.textContent = 'Kerja bagus! Lanjutkan! 💙';
      } else if (percentage < 100) {
        status.textContent = 'Hampir penuh! Sedikit lagi! 🎯';
      } else {
        status.textContent = 'Target tercapai! Luar biasa! 🏆';
      }
    }
  }

  // Render today's drink log list
  function renderTodayLogs() {
    const listEl = document.getElementById('drinkLogList');
    if (!listEl) return;

    const logs = Storage.getTodayLogs().sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    const countEl = document.getElementById('drinkLogCount');

    if (countEl) countEl.textContent = logs.length + ' catatan';

    if (logs.length === 0) {
      listEl.innerHTML = '';
      listEl.appendChild(createEmptyState());
      return;
    }

    listEl.innerHTML = '';
    logs.forEach(log => {
      listEl.appendChild(createLogItem(log));
    });
  }

  // Create empty state element
  function createEmptyState() {
    const div = document.createElement('div');
    div.className = 'drink-log__empty';
    div.id = 'drinkLogEmpty';
    div.innerHTML = `
      <i class="ri-drop-line"></i>
      <p>Belum ada catatan hari ini. Mulai catat konsumsi airmu!</p>
    `;
    return div;
  }

  // Helper to determine container glass/cup icon for a log entry
  function getLogContainerIcon(log) {
    if (log && log.containerIcon) return log.containerIcon;
    if (Storage.getContainerIconByAmount && log) {
      return Storage.getContainerIconByAmount(log.amount);
    }
    const amt = log ? log.amount : 0;
    if (amt <= 120) return 'icon-coffee';
    if (amt <= 160) return 'icon-cup-40';
    if (amt <= 180) return 'icon-cup-50';
    if (amt <= 250) return 'icon-glass-60';
    if (amt <= 350) return 'icon-glass-75';
    if (amt <= 750) return 'icon-bottle';
    return 'icon-bottle-lg';
  }

  // Create a single drink log list item
  function createLogItem(log) {
    const drinkType = Storage.DRINK_TYPES[log.type] || Storage.DRINK_TYPES.water;
    const time = new Date(log.timestamp).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const containerIcon = getLogContainerIcon(log);
    const isCustom = containerIcon.startsWith('icon-');
    const iconHtml = isCustom
      ? `<i class="custom-icon ${containerIcon}"></i>`
      : `<i class="${containerIcon}"></i>`;

    const item = document.createElement('div');
    item.className = 'drink-log__item';
    item.dataset.id = log.id;

    item.innerHTML = `
      <div class="drink-log__item-icon">
        ${iconHtml}
      </div>
      <div class="drink-log__item-info">
        <span class="drink-log__item-type">${drinkType.label}</span>
        <span class="drink-log__item-time">${time}</span>
        ${log.note ? `<span class="drink-log__item-note">${escapeHtml(log.note)}</span>` : ''}
      </div>
      <div class="drink-log__item-meta">
        <span class="drink-log__item-amount">${log.amount} ml</span>
      </div>
      <div class="drink-log__item-actions">
        <button class="btn-edit" data-id="${log.id}" title="Edit">
          <i class="ri-pencil-line"></i>
        </button>
        <button class="btn-delete" data-id="${log.id}" title="Hapus">
          <i class="ri-delete-bin-line"></i>
        </button>
      </div>
    `;

    return item;
  }

  /* ==================== DATE & GREETING ==================== */

  function updateDateDisplay() {
    const now = new Date();
    const options = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    const dateStr = now.toLocaleDateString('id-ID', options);

    const headerDate = document.getElementById('headerDate');
    const mobileDate = document.getElementById('mobileDate');

    if (headerDate) {
      headerDate.innerHTML = `<i class="ri-calendar-2-line"></i><span>${dateStr}</span>`;
    }
    if (mobileDate) {
      mobileDate.textContent = now.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }
  }

  /* ==================== TOAST NOTIFICATIONS ==================== */

  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');

    const icons = {
      success: 'ri-checkbox-circle-fill',
      warning: 'ri-alert-fill',
      danger: 'ri-error-warning-fill'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <i class="toast__icon ${icons[type] || icons.success}"></i>
      <span class="toast__message">${message}</span>
      <button class="toast__close" aria-label="Tutup">
        <i class="ri-close-line"></i>
      </button>
    `;

    // Close button
    toast.querySelector('.toast__close').addEventListener('click', () => {
      removeToast(toast);
    });

    container.appendChild(toast);

    // Auto remove after 3.5 seconds
    setTimeout(() => {
      removeToast(toast);
    }, 3500);
  }

  function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('toast--removing');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }

  /* ==================== MODAL ==================== */

  let _modalConfirmCallback = null;

  function showModal(title, message, confirmText = 'Hapus', onConfirm = null) {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const confirmBtn = document.getElementById('modalConfirm');

    titleEl.textContent = title;
    bodyEl.innerHTML = `<p>${message}</p>`;
    confirmBtn.textContent = confirmText;

    _modalConfirmCallback = onConfirm;
    overlay.classList.add('active');
  }

  function hideModal() {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('active');
    _modalConfirmCallback = null;
  }

  function getModalConfirmCallback() {
    return _modalConfirmCallback;
  }

  /* ==================== NAVIGATION ==================== */

  function switchView(viewName) {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('view--active');
    });

    // Show target view
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('view--active');

    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
      if (link.dataset.view === viewName) {
        link.classList.add('active');
      }
    });

    // Close mobile sidebar
    closeMobileSidebar();
  }

  /* ==================== MOBILE SIDEBAR ==================== */

  function openMobileSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
    document.body.style.overflow = '';
  }

  /* ==================== UTILITIES ==================== */

  function formatMl(ml) {
    if (ml >= 1000) {
      return (ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1) + ' L';
    }
    return ml.toLocaleString('id-ID') + ' ml';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ==================== FULL DASHBOARD REFRESH ==================== */

  function refreshDashboard() {
    updateDashboardMetrics();
    renderTodayLogs();
  }

  /* ==================== HISTORY RENDERING ==================== */

  // Format volume display: e.g. 1.200 ml or 12,2 L
  function formatVolumeDisplay(ml) {
    const val = parseInt(ml) || 0;
    if (val >= 1000) {
      const liters = (val / 1000).toFixed(1).replace('.', ',');
      return `${liters} L`;
    }
    return `${val.toLocaleString('id-ID')} ml`;
  }

  // 1. Render Weekly Chart View (Bar diagram 7 hari dengan Trophy piala)
  function renderWeeklyView(weekData, selectedDate, onSelectDate) {
    const barsContainer = document.getElementById('weeklyChartBars');
    const emptyView = document.getElementById('historyVisualEmpty');
    const emptyText = document.getElementById('historyVisualEmptyText');
    if (!barsContainer) return;

    if (!weekData.hasData && weekData.totalIntake === 0 && weekData.weekOffset < -4) {
      barsContainer.innerHTML = '';
      if (emptyView) {
        emptyView.classList.remove('hidden');
        if (emptyText) emptyText.textContent = 'Belum ada catatan air minum pada periode ini';
      }
      return;
    }

    if (emptyView) emptyView.classList.add('hidden');
    barsContainer.innerHTML = '';

    const dailyGoal = weekData.dailyGoal || 2000;

    weekData.days.forEach(day => {
      const col = document.createElement('div');
      col.className = 'weekly-bar-col';
      if (day.date === selectedDate) col.classList.add('is-selected');
      if (day.isToday) col.classList.add('is-today');

      const pct = dailyGoal > 0 ? Math.min(Math.round((day.total / dailyGoal) * 100), 100) : 0;
      const heightStyle = day.goalMet ? '100%' : (day.total > 0 ? `${Math.max(pct, 14)}%` : '6px');

      let fillHtml = '';
      if (day.total === 0) {
        fillHtml = `<div class="weekly-bar-fill is-empty" title="${day.dayName}: 0 ml"></div>`;
      } else if (day.goalMet) {
        fillHtml = `
          <div class="weekly-bar-fill is-goal-met" title="${day.dayName}: ${formatVolumeDisplay(day.total)} (Target Tercapai!)">
            <div class="trophy-badge">
              <i class="ri-trophy-fill"></i>
            </div>
            <span class="bar-amount-lbl">${formatVolumeDisplay(day.total)}</span>
          </div>
        `;
      } else {
        fillHtml = `
          <div class="weekly-bar-fill" style="height: ${heightStyle};" title="${day.dayName}: ${formatVolumeDisplay(day.total)}"></div>
        `;
      }

      col.innerHTML = `
        <div class="weekly-bar-track">
          ${fillHtml}
        </div>
        <div class="weekly-day-meta">
          <span class="weekly-day-num">${day.dayNum}</span>
          <span class="weekly-day-name">${day.dayName}</span>
        </div>
      `;

      col.addEventListener('click', () => {
        if (typeof onSelectDate === 'function') onSelectDate(day.date);
      });

      barsContainer.appendChild(col);
    });
  }

  // 2. Render Monthly Calendar View (Kalender Bulanan Interaktif)
  function renderMonthlyView(monthData, selectedDate, onSelectDate) {
    const gridEl = document.getElementById('monthlyCalendarGrid');
    const emptyView = document.getElementById('historyVisualEmpty');
    const emptyText = document.getElementById('historyVisualEmptyText');
    if (!gridEl) return;

    if (!monthData.hasData && monthData.monthOffset < -3) {
      gridEl.innerHTML = '';
      if (emptyView) {
        emptyView.classList.remove('hidden');
        if (emptyText) emptyText.textContent = 'Belum ada catatan air minum untuk 30 hari terakhir';
      }
      return;
    }

    if (emptyView) emptyView.classList.add('hidden');
    gridEl.innerHTML = '';

    // Sel hari bulan sebelumnya
    for (let i = 0; i < monthData.firstDayIndex; i++) {
      const prevDayNum = monthData.totalDaysInPrevMonth - monthData.firstDayIndex + 1 + i;
      const cell = document.createElement('div');
      cell.className = 'calendar-cell out-month';
      cell.textContent = prevDayNum;
      gridEl.appendChild(cell);
    }

    // Sel hari bulan berjalan
    monthData.days.forEach(day => {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      if (day.total > 0) cell.classList.add('has-data');
      if (day.goalMet) cell.classList.add('goal-met');
      if (day.date === selectedDate) cell.classList.add('is-selected');
      if (day.isToday) cell.classList.add('is-today');

      if (day.goalMet) {
        cell.innerHTML = `<i class="ri-trophy-fill"></i><span>${day.dayNum}</span>`;
        cell.title = `Tgl ${day.dayNum}: ${formatVolumeDisplay(day.total)} (Target Tercapai!)`;
      } else {
        cell.textContent = day.dayNum;
        if (day.total > 0) {
          cell.title = `Tgl ${day.dayNum}: ${formatVolumeDisplay(day.total)}`;
        }
      }

      cell.addEventListener('click', () => {
        if (typeof onSelectDate === 'function') onSelectDate(day.date);
      });

      gridEl.appendChild(cell);
    });

    // Sel hari bulan berikutnya agar kelipatan 7 genap
    const totalRendered = monthData.firstDayIndex + monthData.days.length;
    const remainder = totalRendered % 7;
    if (remainder !== 0) {
      const trailingCount = 7 - remainder;
      for (let i = 1; i <= trailingCount; i++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell out-month';
        cell.textContent = i;
        gridEl.appendChild(cell);
      }
    }
  }

  // 3. Render Yearly Heatmap View (Grid Kontribusi Tahunan)
  function renderYearlyView(yearData, selectedDate, onSelectDate) {
    const gridEl = document.getElementById('yearlyHeatmapGrid');
    const emptyView = document.getElementById('historyVisualEmpty');
    const emptyText = document.getElementById('historyVisualEmptyText');
    if (!gridEl) return;

    if (!yearData.hasData && yearData.yearOffset < -2) {
      gridEl.innerHTML = '';
      if (emptyView) {
        emptyView.classList.remove('hidden');
        if (emptyText) emptyText.textContent = 'Belum ada catatan air minum untuk tahun ini';
      }
      return;
    }

    if (emptyView) emptyView.classList.add('hidden');
    gridEl.innerHTML = '';

    yearData.days.forEach(day => {
      const dot = document.createElement('div');
      dot.className = `heatmap-dot lvl-${day.level}`;
      if (day.date === selectedDate) dot.classList.add('is-selected');
      dot.title = `${day.date}: ${formatVolumeDisplay(day.total)}${day.goalMet ? ' 🏆' : ''}`;

      dot.addEventListener('click', () => {
        if (typeof onSelectDate === 'function') onSelectDate(day.date);
      });

      gridEl.appendChild(dot);
    });
  }

  // 4. Render 3 Summary Metrics
  function renderHistoryMetrics(mode, data) {
    const v1 = document.getElementById('histMetricVal1');
    const l1 = document.getElementById('histMetricLbl1');
    const v2 = document.getElementById('histMetricVal2');
    const l2 = document.getElementById('histMetricLbl2');
    const v3 = document.getElementById('histMetricVal3');
    const l3 = document.getElementById('histMetricLbl3');

    if (!v1 || !v2 || !v3) return;

    if (mode === 'weekly') {
      v1.textContent = formatVolumeDisplay(data.totalIntake);
      if (l1) l1.textContent = 'Total';

      v2.textContent = formatVolumeDisplay(data.average);
      if (l2) l2.textContent = 'Average';

      v3.textContent = data.bestDay ? formatVolumeDisplay(data.bestDay.total) : '0 ml';
      if (l3) l3.textContent = 'Best Day';
    } else if (mode === 'monthly') {
      v1.textContent = `${data.daysTracked} Hari`;
      if (l1) l1.textContent = 'Days Tracked';

      v2.textContent = `${data.goalsMet} Kali`;
      if (l2) l2.textContent = 'Goals Met';

      v3.textContent = `${data.successRate}%`;
      if (l3) l3.textContent = 'Success Rate';
    } else if (mode === 'yearly') {
      v1.textContent = `${data.daysTracked} Hari`;
      if (l1) l1.textContent = 'Days Tracked';

      v2.textContent = `${data.goalsMet} Kali`;
      if (l2) l2.textContent = 'Goals Met';

      v3.textContent = formatVolumeDisplay(data.totalIntake);
      if (l3) l3.textContent = 'Total Intake';
    }
  }

  // 5. Render Selected Day Entries List
  function renderHistoryEntriesList(dateStr, search = '', filterDrink = 'all') {
    const listEl = document.getElementById('historyDrinkLogList') || document.getElementById('historyEntriesList');
    const dateDisplayEl = document.getElementById('historyEntriesDate');
    const countEl = document.getElementById('historyEntriesCount');
    const totalEl = document.getElementById('selectedDateTotal');
    const displayEl = document.getElementById('selectedDateDisplay');

    if (!listEl) return;

    let logs = Storage.getLogsByDate(dateStr);
    const dayTotal = logs.reduce((sum, l) => sum + (l.amount || 0), 0);

    // Update selected date header info
    if (totalEl) totalEl.textContent = formatMl(dayTotal);
    if (displayEl) {
      const d = new Date(dateStr + 'T00:00:00');
      const isToday = dateStr === Storage.formatDateKey(new Date());
      const prefix = isToday ? 'Hari Ini, ' : '';
      displayEl.textContent = prefix + d.toLocaleDateString('id-ID', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }

    if (dateDisplayEl) {
      const d = new Date(dateStr + 'T00:00:00');
      const isToday = dateStr === Storage.formatDateKey(new Date());
      const prefix = isToday ? 'Hari Ini, ' : '';
      dateDisplayEl.textContent = prefix + d.toLocaleDateString('id-ID', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });
    }

    // Apply drink type filter
    if (filterDrink && filterDrink !== 'all') {
      logs = logs.filter(l => l.type === filterDrink);
    }

    // Apply search keyword filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      logs = logs.filter(l => {
        const typeInfo = Storage.DRINK_TYPES[l.type];
        const label = typeInfo ? typeInfo.label.toLowerCase() : '';
        const note = (l.note || '').toLowerCase();
        return label.includes(q) || note.includes(q) || `${l.amount}`.includes(q);
      });
    }

    // Sort descending by timestamp
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (countEl) {
      countEl.textContent = `${logs.length} catatan`;
    }

    listEl.innerHTML = '';

    if (logs.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'history-drink-log__empty';
      emptyDiv.innerHTML = `
        <i class="ri-drop-line"></i>
        <p>Belum ada catatan air minum untuk tanggal ini.</p>
      `;
      listEl.appendChild(emptyDiv);
      return;
    }

    logs.forEach(log => {
      listEl.appendChild(createLogItem(log));
    });
  }

  function renderHistoryTable(logs) {
    const tbody = document.getElementById('historyTableBody');
    const emptyEl = document.getElementById('historyEmpty');
    const tableEl = document.getElementById('historyTable');

    if (!tbody) return;

    // Summary calculation
    const totalLogs = logs.length;
    const totalVolume = logs.reduce((sum, log) => sum + log.amount, 0);

    // Count unique days for average daily calculation
    const uniqueDays = new Set(logs.map(log => log.date || (new Date(log.timestamp).toISOString().split('T')[0]))).size;
    const avgDaily = uniqueDays > 0 ? Math.round(totalVolume / uniqueDays) : 0;

    const totalLogsEl = document.getElementById('summaryTotalLogs');
    const totalVolumeEl = document.getElementById('summaryTotalVolume');
    const avgDailyEl = document.getElementById('summaryAvgDaily');

    if (totalLogsEl) totalLogsEl.textContent = totalLogs.toLocaleString('id-ID');
    if (totalVolumeEl) totalVolumeEl.textContent = formatMl(totalVolume);
    if (avgDailyEl) avgDailyEl.textContent = formatMl(avgDaily);

    // Empty state handling
    if (totalLogs === 0) {
      tbody.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
      if (tableEl) tableEl.classList.add('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    if (tableEl) tableEl.classList.remove('hidden');

    tbody.innerHTML = '';
    logs.forEach(log => {
      const tr = document.createElement('tr');
      const drinkType = Storage.DRINK_TYPES[log.type] || Storage.DRINK_TYPES.water;
      const logDate = new Date(log.timestamp);

      const formattedDate = logDate.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      const formattedTime = logDate.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      });

      tr.innerHTML = `
        <td>
          <div style="display:flex; flex-direction:column;">
            <span style="font-weight:600;">${formattedDate}</span>
            <span style="font-size:12px; color:var(--color-text-secondary);">${formattedTime}</span>
          </div>
        </td>
        <td>
          <span class="badge">
            <i class="${drinkType.icon}"></i>
            ${drinkType.label}
          </span>
        </td>
        <td>
          <span class="table-amount">${log.amount.toLocaleString('id-ID')} ml</span>
        </td>
        <td>
          <span class="table-note" title="${escapeHtml(log.note || '-')}">${escapeHtml(log.note || '-')}</span>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn-edit" data-id="${log.id}" title="Edit">
              <i class="ri-pencil-line"></i>
            </button>
            <button class="btn-delete" data-id="${log.id}" title="Hapus">
              <i class="ri-delete-bin-line"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function toLocalDatetimeInputValue(date) {
    const pad = num => String(num).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${y}-${m}-${d}T${h}:${min}`;
  }

  function openHistoryForm(logToEdit = null) {
    const formCard = document.getElementById('historyFormCard');
    const titleEl = document.getElementById('historyFormTitle');
    const logIdInput = document.getElementById('formLogId');
    const amountInput = document.getElementById('formAmount');
    const typeInput = document.getElementById('formType');
    const timeInput = document.getElementById('formTime');
    const noteInput = document.getElementById('formNote');
    const submitBtn = document.getElementById('btnSubmitForm');

    clearFormErrors();

    if (logToEdit) {
      titleEl.textContent = 'Edit Catatan Minum';
      logIdInput.value = logToEdit.id;
      amountInput.value = logToEdit.amount;
      typeInput.value = logToEdit.type;
      timeInput.value = toLocalDatetimeInputValue(new Date(logToEdit.timestamp));
      noteInput.value = logToEdit.note || '';
      submitBtn.innerHTML = '<i class="ri-check-line"></i> <span>Perbarui</span>';
    } else {
      titleEl.textContent = 'Tambah Catatan Baru';
      logIdInput.value = '';
      amountInput.value = '';
      typeInput.value = 'water';
      timeInput.value = toLocalDatetimeInputValue(new Date());
      noteInput.value = '';
      submitBtn.innerHTML = '<i class="ri-save-line"></i> <span>Simpan</span>';
    }

    formCard.classList.remove('hidden');
    formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    amountInput.focus();
  }

  function closeHistoryForm() {
    const formCard = document.getElementById('historyFormCard');
    if (formCard) formCard.classList.add('hidden');
    clearFormErrors();
  }

  function setFieldError(fieldId, errorMsg) {
    const inputEl = document.getElementById(fieldId);
    const errorEl = document.getElementById('error' + fieldId.replace('form', ''));
    if (inputEl) inputEl.classList.add('is-invalid');
    if (errorEl) errorEl.textContent = errorMsg;
  }

  function clearFormErrors() {
    ['formAmount', 'formType', 'formTime'].forEach(fieldId => {
      const inputEl = document.getElementById(fieldId);
      const errorEl = document.getElementById('error' + fieldId.replace('form', ''));
      if (inputEl) inputEl.classList.remove('is-invalid');
      if (errorEl) errorEl.textContent = '';
    });
  }

  /* ==================== STATISTICS / ANALYTICS RENDERING ==================== */

  function renderStatisticsPage(period = 'all') {
    const totalIntakeEl = document.getElementById('statsTotalIntake');
    // If not on statistics page, exit gracefully
    if (!totalIntakeEl && !document.getElementById('view-analytics')) return;

    const data = Storage.getStatisticsData(period);

    // 1. Medium Cards (4 Cards)
    if (totalIntakeEl) {
      totalIntakeEl.textContent = formatVolumeDisplay(data.totalIntake);
    }
    const totalIntakeSub = document.getElementById('statsTotalIntakeSub');
    if (totalIntakeSub) {
      totalIntakeSub.textContent = data.hasData ? `${data.totalIntake.toLocaleString('id-ID')} ml total` : 'Belum ada catatan';
    }

    const dailyAvgEl = document.getElementById('statsDailyAvg');
    if (dailyAvgEl) {
      dailyAvgEl.textContent = formatVolumeDisplay(data.dailyAverage);
    }

    const successRateEl = document.getElementById('statsSuccessRate');
    if (successRateEl) {
      successRateEl.textContent = `${data.successRate}%`;
    }
    const goalsMetSub = document.getElementById('statsGoalsMetSub');
    if (goalsMetSub) {
      goalsMetSub.textContent = `${data.goalsMet} / ${data.daysTracked} hari target`;
    }

    const daysTrackedEl = document.getElementById('statsDaysTracked');
    if (daysTrackedEl) {
      daysTrackedEl.textContent = `${data.daysTracked} Hari`;
    }

    // 2. Overview (8 Items)
    const streakEl = document.getElementById('overviewStreak');
    if (streakEl) streakEl.textContent = `${data.currentStreak} Hari`;

    const ovSuccessEl = document.getElementById('overviewSuccessRate');
    if (ovSuccessEl) ovSuccessEl.textContent = `${data.successRate}%`;

    const ovDaysEl = document.getElementById('overviewDaysTracked');
    if (ovDaysEl) ovDaysEl.textContent = `${data.daysTracked} Hari`;

    const intervalEl = document.getElementById('overviewAvgInterval');
    if (intervalEl) intervalEl.textContent = data.avgIntervalStr;

    const avgDrinkEl = document.getElementById('overviewAvgDrinkSize');
    if (avgDrinkEl) avgDrinkEl.textContent = formatVolumeDisplay(data.avgDrinkSize);

    const largestEl = document.getElementById('overviewLargestDrink');
    if (largestEl) largestEl.textContent = formatVolumeDisplay(data.largestDrink);

    const firstEl = document.getElementById('overviewFirstDrink');
    if (firstEl) firstEl.textContent = data.firstDrinkStr;

    const lastEl = document.getElementById('overviewLastDrink');
    if (lastEl) lastEl.textContent = data.lastDrinkStr;

    // 3. Beverage Breakdown (Grafik & Dynamic List)
    const centerValEl = document.getElementById('beverageCenterVal');
    if (centerValEl) {
      centerValEl.textContent = data.totalIntake >= 1000
        ? `${(data.totalIntake / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
        : `${data.totalIntake} ml`;
    }

    if (typeof ChartModule !== 'undefined' && ChartModule.renderBeverageBreakdown) {
      ChartModule.renderBeverageBreakdown('beverageBreakdownChart', data.beverageBreakdown, data.totalIntake);
    }

    const bevListEl = document.getElementById('beverageBreakdownList');
    if (bevListEl) {
      bevListEl.innerHTML = '';
      const activeBeverages = data.beverageBreakdown.filter(b => b.amount > 0);

      if (activeBeverages.length === 0) {
        bevListEl.innerHTML = `
          <div class="beverage-empty-hint">
            <i class="ri-drop-line"></i>
            <p>Belum ada catatan minuman. Catat minuman di Home untuk melihat distribusinya!</p>
          </div>
        `;
      } else {
        // Agar bentuk dan tinggi seimbang dengan 8 item (4 baris) di kartu Overview:
        // Tampilkan minuman aktif, dan genapkan hingga 4 baris dengan jenis minuman utama
        let displayList = [...activeBeverages];
        if (displayList.length < 4) {
          const inactive = data.beverageBreakdown.filter(b => b.amount === 0);
          for (let i = 0; i < inactive.length && displayList.length < 4; i++) {
            displayList.push(inactive[i]);
          }
        }

        displayList.forEach(b => {
          const isZero = b.amount === 0;
          const row = document.createElement('div');
          row.className = `beverage-item-row ${isZero ? 'is-zero' : ''}`;
          row.innerHTML = `
            <div class="beverage-item-main">
              <span class="beverage-dot" style="background-color: ${b.color};"></span>
              <span class="beverage-name">${escapeHtml(b.label)}</span>
            </div>
            <div class="beverage-bar-wrap">
              <div class="beverage-bar-fill" style="width: ${b.percentage}%; background-color: ${b.color};"></div>
            </div>
            <div class="beverage-item-meta">
              <span class="beverage-amount">${b.amount.toLocaleString('id-ID')} ml</span>
              <span class="beverage-pct">${b.percentage}%</span>
            </div>
          `;
          bevListEl.appendChild(row);
        });
      }
    }

    // 4. Container Usage (Table: container, volume dan uses)
    const containerTbody = document.getElementById('containerUsageTableBody');
    const containerTableContainer = document.getElementById('containerTableContainer');
    const containerUsageEmpty = document.getElementById('containerUsageEmpty');

    if (containerTbody) {
      containerTbody.innerHTML = '';
      const hasContainers = Array.isArray(data.containerUsage) && data.containerUsage.length > 0;

      if (!hasContainers) {
        if (containerTableContainer) containerTableContainer.classList.add('hidden');
        if (containerUsageEmpty) containerUsageEmpty.classList.remove('hidden');
      } else {
        if (containerTableContainer) containerTableContainer.classList.remove('hidden');
        if (containerUsageEmpty) containerUsageEmpty.classList.add('hidden');

        data.containerUsage.forEach(c => {
          const isSvg = c.icon && c.icon.startsWith('icon-');
          const iconHtml = isSvg
            ? `<i class="custom-icon ${c.icon}"></i>`
            : `<i class="${c.icon || 'ri-cup-line'}"></i>`;

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div class="container-cell">
                <div class="container-cell__icon">
                  ${iconHtml}
                </div>
                <div class="container-cell__info">
                  <span class="container-cell__name">${escapeHtml(c.name)}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="volume-badge">${c.amount.toLocaleString('id-ID')} ml</span>
            </td>
            <td>
              <div class="uses-cell">
                <span class="uses-badge">${c.uses}x</span>
                <div class="uses-bar-track">
                  <div class="uses-bar-fill" style="width: ${c.percentage}%;"></div>
                </div>
                <span class="uses-pct">${c.percentage}%</span>
              </div>
            </td>
          `;
          containerTbody.appendChild(tr);
        });
      }
    }
  }

  function renderAnalytics(days = 7) {
    renderStatisticsPage(days);
  }

  /* ==================== SETTINGS RENDERING ==================== */

  function renderSettings() {
    const settings = Storage.getSettings();
    const userName = (settings.userName || 'Faith').trim() || 'Faith';
    const initial = userName.charAt(0).toUpperCase();

    // 1. Main Menu & Profile Header Avatar Initial & Name
    const menuInitialEl = document.getElementById('menuProfileInitial');
    if (menuInitialEl) menuInitialEl.textContent = initial;

    const profileInitialEl = document.getElementById('profileInitial');
    if (profileInitialEl) profileInitialEl.textContent = initial;

    const menuNameEl = document.getElementById('menuProfileName');
    if (menuNameEl) menuNameEl.textContent = userName;

    const displayNameEl = document.getElementById('profileNameDisplay');
    if (displayNameEl) displayNameEl.textContent = userName;

    const greetingEl = document.getElementById('profileGreeting');
    if (greetingEl) {
      const hour = new Date().getHours();
      let greeting = 'Selamat Sore,';
      if (hour >= 4 && hour < 11) greeting = 'Selamat Pagi,';
      else if (hour >= 11 && hour < 15) greeting = 'Selamat Siang,';
      else if (hour >= 15 && hour < 19) greeting = 'Selamat Sore,';
      else greeting = 'Selamat Malam,';
      greetingEl.textContent = greeting;
    }

    // 2. Inner Mini Card: Today's Entries, Days Tracked, Today's Goal
    const todayLogs = Storage.getTodayLogs ? Storage.getTodayLogs() : [];
    const todayEntriesEl = document.getElementById('profileTodayEntries');
    if (todayEntriesEl) {
      todayEntriesEl.textContent = todayLogs.length;
    }

    const daysTrackedEl = document.getElementById('profileDaysTracked');
    if (daysTrackedEl) {
      const daysCount = Storage.getDaysTrackedCount ? Storage.getDaysTrackedCount() : 0;
      daysTrackedEl.textContent = daysCount;
    }

    const dailyGoalVal = settings.dailyGoal || 2000;
    const todayGoalEl = document.getElementById('profileTodayGoal');
    if (todayGoalEl) {
      const todayTotal = todayLogs.reduce((sum, l) => sum + (l.amount || 0), 0);
      const pct = dailyGoalVal > 0 ? Math.min(100, Math.round((todayTotal / dailyGoalVal) * 100)) : 0;
      todayGoalEl.textContent = `${pct}%`;
      todayGoalEl.title = `${formatMl(todayTotal)} / ${formatMl(dailyGoalVal)}`;
    }

    // 3. Personal: Name Input & Gender
    const nameInput = document.getElementById('inputUserName');
    if (nameInput) nameInput.value = userName;

    const modalNameInput = document.getElementById('inputModalUserName');
    if (modalNameInput) modalNameInput.value = userName;

    const gender = settings.gender || 'prefer-not-to-say';
    const genderLabels = {
      'male': 'Male',
      'female': 'Female',
      'prefer-not-to-say': 'Prefer not to say'
    };
    const genderLabelEl = document.getElementById('genderCurrentLabel');
    if (genderLabelEl) genderLabelEl.textContent = genderLabels[gender] || 'Prefer not to say';

    const genderRadios = document.querySelectorAll('input[name="gender"]');
    genderRadios.forEach(radio => {
      radio.checked = (radio.value === gender);
    });

    const modalGenderRadios = document.querySelectorAll('input[name="modal_gender_radio"]');
    modalGenderRadios.forEach(radio => {
      radio.checked = (radio.value === gender);
    });

    // 4. Daily Goals: Water Goal & Activity Level
    const goalInput = document.getElementById('inputDailyGoal');
    if (goalInput) goalInput.value = dailyGoalVal;

    const goalModalInput = document.getElementById('inputDailyGoalModal');
    if (goalModalInput) goalModalInput.value = dailyGoalVal;

    const modalPresets = document.querySelectorAll('[data-modal-goal-preset]');
    modalPresets.forEach(btn => {
      const pVal = parseInt(btn.getAttribute('data-modal-goal-preset'));
      if (pVal === dailyGoalVal) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const dailyGoalLabelEl = document.getElementById('dailyGoalCurrentLabel');
    if (dailyGoalLabelEl) {
      dailyGoalLabelEl.textContent = dailyGoalVal >= 1000 && dailyGoalVal % 500 === 0
        ? `${dailyGoalVal / 1000} L (${formatMl(dailyGoalVal)})`
        : formatMl(dailyGoalVal);
    }

    const activity = settings.activityLevel || 'moderate';
    const activityLabels = {
      'sedentary': 'Sedentary',
      'light': 'Light Activity',
      'moderate': 'Moderate Activity',
      'active': 'Active',
      'very_active': 'Very Active'
    };
    const activityLabelEl = document.getElementById('activityCurrentLabel');
    if (activityLabelEl) activityLabelEl.textContent = activityLabels[activity] || 'Moderate Activity';

    const activitySelect = document.getElementById('selectActivity');
    if (activitySelect) activitySelect.value = activity;

    const activityRadios = document.querySelectorAll('input[name="activity_radio"]');
    activityRadios.forEach(radio => {
      radio.checked = (radio.value === activity);
    });

    const modalActivityRadios = document.querySelectorAll('input[name="modal_activity_radio"]');
    modalActivityRadios.forEach(radio => {
      radio.checked = (radio.value === activity);
    });

    // 5. Appearance: Theme
    const currentTheme = settings.theme || 'system';
    updateThemePickerUI(currentTheme);

    // 6. Data Management: Default date for delete before date
    const deleteBeforeDateInput = document.getElementById('inputDeleteBeforeDate');
    if (deleteBeforeDateInput && !deleteBeforeDateInput.value) {
      deleteBeforeDateInput.value = Storage.formatDateKey(new Date());
    }
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.removeAttribute('data-theme-setting');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.removeAttribute('data-theme-setting');
    } else {
      // System: resolve OS preference
      const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', isSystemDark ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme-setting', 'system');
    }
  }

  function updateThemePickerUI(activeTheme) {
    const cards = document.querySelectorAll('#themePicker .theme-card');
    cards.forEach(card => {
      const val = card.dataset.themeValue;
      if (val === activeTheme) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  /* ==================== PUBLIC API ==================== */
  return {
    updateDashboardMetrics,
    updateUserInfo,
    updateGreeting,
    renderTodayLogs,
    updateDateDisplay,
    showToast,
    removeToast,
    showModal,
    hideModal,
    getModalConfirmCallback,
    switchView,
    openMobileSidebar,
    closeMobileSidebar,
    refreshDashboard,
    formatVolumeDisplay,
    renderWeeklyView,
    renderMonthlyView,
    renderYearlyView,
    renderHistoryMetrics,
    renderHistoryEntriesList,
    renderHistoryTable,
    openHistoryForm,
    closeHistoryForm,
    renderStatisticsPage,
    renderAnalytics,
    renderSettings,
    applyTheme,
    updateThemePickerUI,
    setFieldError,
    clearFormErrors,
    formatMl,
    escapeHtml
  };
})();

