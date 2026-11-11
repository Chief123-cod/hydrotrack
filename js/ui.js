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

  // Create a single drink log list item
  function createLogItem(log) {
    const drinkType = Storage.DRINK_TYPES[log.type] || Storage.DRINK_TYPES.water;
    const time = new Date(log.timestamp).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const item = document.createElement('div');
    item.className = 'drink-log__item';
    item.dataset.id = log.id;

    item.innerHTML = `
      <div class="drink-log__item-icon">
        <i class="${drinkType.icon}"></i>
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

    if (headerDate) headerDate.textContent = dateStr;
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

  /* ==================== ANALYTICS RENDERING ==================== */

  function renderAnalytics(days = 7) {
    const avgEl = document.getElementById('analyticsAvgDaily');
    if (!avgEl) return;

    const stats = Storage.getAnalyticsStats(days);

    // Update stat cards
    avgEl.textContent = formatMl(stats.avgDaily);

    const bestDayEl = document.getElementById('analyticsBestDay');
    if (bestDayEl) {
      bestDayEl.textContent = stats.bestDay.total > 0
        ? `${formatMl(stats.bestDay.total)} (${stats.bestDay.dayName})`
        : '-';
    }

    const goalsMetEl = document.getElementById('analyticsGoalsMet');
    if (goalsMetEl) {
      goalsMetEl.textContent = `${stats.goalsMet} / ${days} Hari (${stats.completionRate}%)`;
    }

    const totalIntakeEl = document.getElementById('analyticsTotalIntake');
    if (totalIntakeEl) {
      totalIntakeEl.textContent = formatMl(stats.totalIntake);
    }

    // Status evaluation message
    const evalMessage = document.getElementById('analyticsEvalMessage');
    const evalBadge = document.getElementById('analyticsEvalBadge');
    if (evalMessage) {
      if (stats.completionRate >= 80) {
        evalMessage.textContent = 'Luar biasa! Konsistensi hidrasimu sangat baik. Pertahankan kebiasaan sehat ini! 🌟';
        if (evalBadge) {
          evalBadge.className = 'analytics-badge analytics-badge--success';
          evalBadge.textContent = 'Sangat Baik';
        }
      } else if (stats.completionRate >= 50) {
        evalMessage.textContent = 'Progres yang cukup baik! Coba minum air lebih rutin di pagi dan siang hari untuk mencapai target harian. 💪';
        if (evalBadge) {
          evalBadge.className = 'analytics-badge analytics-badge--warning';
          evalBadge.textContent = 'Cukup Baik';
        }
      } else {
        evalMessage.textContent = 'Tingkat hidrasimu masih di bawah target. Pasang alarm atau bawa tumbler minum ke mana pun kamu beraktivitas! 💧';
        if (evalBadge) {
          evalBadge.className = 'analytics-badge analytics-badge--danger';
          evalBadge.textContent = 'Perlu Ditingkatkan';
        }
      }
    }

    // Render charts
    if (typeof ChartModule !== 'undefined' && ChartModule.initAnalyticsCharts) {
      ChartModule.initAnalyticsCharts(days);
    }
  }

  /* ==================== SETTINGS RENDERING ==================== */

  function renderSettings() {
    const settings = Storage.getSettings();

    const nameInput = document.getElementById('inputUserName');
    if (nameInput) nameInput.value = settings.userName || 'User';

    const goalInput = document.getElementById('inputDailyGoal');
    if (goalInput) goalInput.value = settings.dailyGoal || 2000;

    const weightInput = document.getElementById('inputWeight');
    if (weightInput) weightInput.value = settings.weight || 60;

    const activitySelect = document.getElementById('selectActivity');
    if (activitySelect) activitySelect.value = settings.activityLevel || 'moderate';

    updateWaterCalculator();
  }

  function updateWaterCalculator() {
    const weightInput = document.getElementById('inputWeight');
    const activitySelect = document.getElementById('selectActivity');
    const resultEl = document.getElementById('calcResultValue');

    if (!weightInput || !activitySelect || !resultEl) return;

    const weight = parseFloat(weightInput.value) || 60;
    const activity = activitySelect.value;

    let multiplier = 35;
    if (activity === 'sedentary') multiplier = 30;
    else if (activity === 'active') multiplier = 40;

    const recommendedMl = Math.round((weight * multiplier) / 50) * 50;
    resultEl.textContent = formatMl(recommendedMl);
    resultEl.dataset.recommended = recommendedMl;
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
    renderHistoryTable,
    openHistoryForm,
    closeHistoryForm,
    renderAnalytics,
    renderSettings,
    updateWaterCalculator,
    setFieldError,
    clearFormErrors,
    formatMl,
    escapeHtml
  };
})();

