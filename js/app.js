/* ============================================
   APP.JS — Main Initialization & Event Listeners
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ==================== ONBOARDING CHECK ==================== */
  // Redirect to welcome onboarding if settings don't exist or after a factory reset
  const isWelcomePage = window.location.pathname.endsWith('welcome.html');
  if (!isWelcomePage) {
    const hasSettings = localStorage.getItem('hydrotrack_settings');
    const needsOnboarding = localStorage.getItem('hydrotrack_onboarding_needed') === 'true';
    if (!hasSettings || needsOnboarding) {
      window.location.href = 'welcome.html';
      return;
    }
  }

  /* ==================== HISTORY STATE ==================== */
  const historyState = {
    period: 'weekly',
    weekOffset: 0,
    monthOffset: 0,
    yearOffset: 0,
    selectedDate: Storage.formatDateKey(new Date())
  };

  /* ==================== INITIALIZATION ==================== */

  // Apply saved theme across all pages immediately
  const initialSettings = Storage.getSettings();
  if (initialSettings && initialSettings.theme) {
    UI.applyTheme(initialSettings.theme);
  }

  // Listen for OS theme changes when user chooses 'system'
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const current = Storage.getSettings();
      if (!current.theme || current.theme === 'system') {
        UI.applyTheme('system');
      }
    });
  }

  // Display date & user info
  UI.updateDateDisplay();
  UI.updateUserInfo();

  // Render dashboard if on dashboard page (index.html)
  if (document.getElementById('drinkLogList') || document.getElementById('progressBarFill')) {
    UI.refreshDashboard();
  }

  // Render history if on history page
  if (document.getElementById('historyTableBody') || document.getElementById('historyVisualContainer')) {
    refreshHistory();

    // Check URL parameters for direct edit or search
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    const searchParam = urlParams.get('search');
    const searchInput = document.getElementById('historySearch');

    if (searchParam && searchInput) {
      searchInput.value = searchParam;
      refreshHistory();
    }

    if (editId) {
      const logToEdit = Storage.getLogById(editId);
      if (logToEdit) {
        setTimeout(() => {
          UI.openHistoryForm(logToEdit);
        }, 150);
      }
    }
  }

  // Render statistics if on statistics page (analisis.html)
  if (document.getElementById('statsTotalIntake') || document.getElementById('view-analytics')) {
    const periodSelect = document.getElementById('analyticsPeriod');
    const initialPeriod = periodSelect ? periodSelect.value : 'all';
    UI.renderStatisticsPage(initialPeriod);

    if (periodSelect) {
      periodSelect.addEventListener('change', (e) => {
        UI.renderStatisticsPage(e.target.value);
      });
    }
  }

  // Render settings if on settings page (pengaturan.html)
  if (document.getElementById('settingsProfileForm') || document.getElementById('view-settings')) {
    initSettingsPage();
  }

  /* ==================== NAVIGATION ==================== */

  // Bottom navigation links: jika tab sudah aktif di halaman saat ini, cegah reload dan scroll halus ke atas
  document.querySelectorAll('.bottom-nav__item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (item.classList.contains('active')) {
        e.preventDefault();
        const mainMenu = document.getElementById('settingsMainMenu');
        if (mainMenu && !mainMenu.classList.contains('active')) {
          document.querySelectorAll('.m3-settings-view').forEach(v => v.classList.remove('active'));
          mainMenu.classList.add('active');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const mainEl = document.querySelector('.main-content');
        if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });

  // Sidebar nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');

      // If linking to a separate HTML file, allow natural browser navigation
      if (href && href !== '#' && !href.startsWith('javascript:')) {
        return;
      }

      e.preventDefault();
      const view = link.dataset.view;
      if (view) {
        UI.switchView(view);
        if (view === 'history') {
          refreshHistory();
        } else if (view === 'dashboard') {
          UI.refreshDashboard();
        }
      }
    });
  });

  /* ==================== HISTORY LOGIC & FILTERS ==================== */

  function refreshHistory() {
    // 1. Jika berada pada dashboard visual modern di riwayat.html
    if (document.getElementById('historyVisualContainer')) {
      const titleEl = document.getElementById('historyPeriodTitle');

      // Update status tab aktif
      document.querySelectorAll('.history-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.period === historyState.period);
      });

      // Tampilkan/sembunyikan wadah tampilan sesuai tab
      const weeklyView = document.getElementById('weeklyChartView');
      const monthlyView = document.getElementById('monthlyCalendarView');
      const yearlyView = document.getElementById('yearlyHeatmapView');

      if (weeklyView) weeklyView.classList.toggle('hidden', historyState.period !== 'weekly');
      if (monthlyView) monthlyView.classList.toggle('hidden', historyState.period !== 'monthly');
      if (yearlyView) yearlyView.classList.toggle('hidden', historyState.period !== 'yearly');

      if (historyState.period === 'weekly') {
        const data = Storage.getWeeklyHistory(historyState.weekOffset);
        if (titleEl) titleEl.textContent = data.periodLabel;
        UI.renderWeeklyView(data, historyState.selectedDate, onSelectHistoryDate);
        UI.renderHistoryMetrics('weekly', data);
      } else if (historyState.period === 'monthly') {
        const data = Storage.getMonthlyHistory(historyState.monthOffset);
        if (titleEl) titleEl.textContent = data.periodLabel;
        UI.renderMonthlyView(data, historyState.selectedDate, onSelectHistoryDate);
        UI.renderHistoryMetrics('monthly', data);
      } else if (historyState.period === 'yearly') {
        const data = Storage.getYearlyHistory(historyState.yearOffset);
        if (titleEl) titleEl.textContent = data.periodLabel;
        UI.renderYearlyView(data, historyState.selectedDate, onSelectHistoryDate);
        UI.renderHistoryMetrics('yearly', data);
      }

      // Render daftar catatan pada hari yang dipilih
      const search = document.getElementById('historySearch')?.value || '';
      const drinkType = document.getElementById('filterDrinkType')?.value || 'all';
      UI.renderHistoryEntriesList(historyState.selectedDate, search, drinkType);
    }

    // 2. Fallback rendering tabel legacy jika elemennya ada
    if (document.getElementById('historyTableBody')) {
      const search = document.getElementById('historySearch')?.value || '';
      const dateRange = document.getElementById('filterDateRange')?.value || '7days';
      const drinkType = document.getElementById('filterDrinkType')?.value || 'all';
      const filteredLogs = Storage.getFilteredLogs({ search, dateRange, drinkType });
      UI.renderHistoryTable(filteredLogs);
    }
  }

  function onSelectHistoryDate(dateKey) {
    const recentEntriesEl = document.getElementById('historyRecentEntries');
    const isSameDate = historyState.selectedDate === dateKey;
    historyState.selectedDate = dateKey;

    if (recentEntriesEl) {
      if (recentEntriesEl.classList.contains('mobile-collapsed')) {
        recentEntriesEl.classList.remove('mobile-collapsed');
      } else if (isSameDate && window.innerWidth <= 768) {
        recentEntriesEl.classList.add('mobile-collapsed');
      }
    }

    refreshHistory();
  }

  // Event listener tab periode (Weekly / Monthly / Yearly)
  document.querySelectorAll('.history-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      historyState.period = tab.dataset.period;
      refreshHistory();
    });
  });

  // Event listener tombol navigasi periode (< dan >)
  document.getElementById('historyNavPrev')?.addEventListener('click', () => {
    if (historyState.period === 'weekly') historyState.weekOffset--;
    else if (historyState.period === 'monthly') historyState.monthOffset--;
    else if (historyState.period === 'yearly') historyState.yearOffset--;
    refreshHistory();
  });

  document.getElementById('historyNavNext')?.addEventListener('click', () => {
    if (historyState.period === 'weekly') historyState.weekOffset++;
    else if (historyState.period === 'monthly') historyState.monthOffset++;
    else if (historyState.period === 'yearly') historyState.yearOffset++;
    refreshHistory();
  });

  // Tombol quick add log di kartu detail hari
  document.getElementById('btnQuickAddLog')?.addEventListener('click', () => {
    UI.openHistoryForm();
    const timeInput = document.getElementById('formTime');
    if (timeInput && historyState.selectedDate) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      timeInput.value = `${historyState.selectedDate}T${hh}:${mm}`;
    }
  });

  // Filter event listeners
  const historySearch = document.getElementById('historySearch');
  const filterDateRange = document.getElementById('filterDateRange');
  const filterDrinkType = document.getElementById('filterDrinkType');

  if (historySearch) {
    historySearch.addEventListener('input', () => refreshHistory());
  }
  if (filterDateRange) {
    filterDateRange.addEventListener('change', () => refreshHistory());
  }
  if (filterDrinkType) {
    filterDrinkType.addEventListener('change', () => refreshHistory());
  }

  // Top header global search
  const globalSearch = document.getElementById('globalSearch');
  if (globalSearch) {
    globalSearch.addEventListener('input', (e) => {
      const term = e.target.value;
      if (document.getElementById('historySearch')) {
        const historySearch = document.getElementById('historySearch');
        if (historySearch) historySearch.value = term;
        refreshHistory();
      }
    });

    globalSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const term = globalSearch.value.trim();
        if (term && !document.getElementById('historySearch')) {
          window.location.href = `riwayat.html?search=${encodeURIComponent(term)}`;
        }
      }
    });
  }

  /* ==================== HISTORY FORM & VALIDATION ==================== */

  const btnOpenAddForm = document.getElementById('btnOpenAddForm');
  const btnCloseForm = document.getElementById('btnCloseForm');
  const btnCancelForm = document.getElementById('btnCancelForm');
  const historyForm = document.getElementById('historyForm');

  if (btnOpenAddForm) {
    btnOpenAddForm.addEventListener('click', () => {
      UI.openHistoryForm();
    });
  }

  if (btnCloseForm) {
    btnCloseForm.addEventListener('click', () => {
      UI.closeHistoryForm();
    });
  }

  if (btnCancelForm) {
    btnCancelForm.addEventListener('click', () => {
      UI.closeHistoryForm();
    });
  }

  if (historyForm) {
    historyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      UI.clearFormErrors();

      const logId = document.getElementById('formLogId').value;
      const amountInput = document.getElementById('formAmount');
      const typeInput = document.getElementById('formType');
      const timeInput = document.getElementById('formTime');
      const noteInput = document.getElementById('formNote');

      const amount = parseInt(amountInput.value);
      const type = typeInput.value;
      const timeValue = timeInput.value;
      const note = noteInput.value.trim();

      let isValid = true;

      // 1. Validate Amount
      if (isNaN(amount) || amountInput.value.trim() === '') {
        UI.setFieldError('formAmount', 'Jumlah air wajib diisi.');
        isValid = false;
      } else if (amount < 50 || amount > 3000) {
        UI.setFieldError('formAmount', 'Jumlah harus antara 50 ml hingga 3.000 ml.');
        isValid = false;
      }

      // 2. Validate Type
      if (!type || !Storage.DRINK_TYPES[type]) {
        UI.setFieldError('formType', 'Pilih jenis minuman yang valid.');
        isValid = false;
      }

      // 3. Validate Time
      if (!timeValue) {
        UI.setFieldError('formTime', 'Waktu konsumsi wajib diisi.');
        isValid = false;
      } else {
        const selectedDate = new Date(timeValue);
        const now = new Date();
        // Allow a slight 1-minute margin for clock differences
        if (selectedDate.getTime() > now.getTime() + 60000) {
          UI.setFieldError('formTime', 'Waktu konsumsi tidak boleh di masa depan.');
          isValid = false;
        }
      }

      if (!isValid) return;

      // Save: Create or Update
      const drinkInfo = Storage.DRINK_TYPES[type] || Storage.DRINK_TYPES.water;

      if (logId) {
        // UPDATE
        const updated = Storage.updateLog(logId, {
          amount,
          type,
          note,
          timestamp: new Date(timeValue).toISOString()
        });

        if (updated) {
          UI.showToast(`Catatan ${drinkInfo.label} berhasil diperbarui! ✨`, 'success');
        } else {
          UI.showToast('Gagal memperbarui catatan.', 'danger');
        }
      } else {
        // CREATE
        Storage.addLog(amount, type, note, new Date(timeValue).toISOString());
        UI.showToast(`${amount} ml ${drinkInfo.label} berhasil dicatat! 💧`, 'success');
      }

      UI.closeHistoryForm();
      refreshHistory();
      UI.refreshDashboard();
    });
  }

  /* ==================== HISTORY TABLE & ENTRIES ACTIONS (Edit & Delete) ==================== */

  function handleHistoryEntryAction(e) {
    const deleteBtn = e.target.closest('.btn-delete');
    const editBtn = e.target.closest('.btn-edit');

    if (deleteBtn) {
      const logId = deleteBtn.dataset.id;
      const log = Storage.getLogById(logId);
      if (!log) return;

      const drinkType = Storage.DRINK_TYPES[log.type] || Storage.DRINK_TYPES.water;
      UI.showModal(
        'Hapus Catatan',
        `Apakah Anda yakin ingin menghapus catatan <strong>${drinkType.label} (${log.amount} ml)</strong>?`,
        'Hapus',
        () => {
          Storage.deleteLog(logId);
          refreshHistory();
          UI.refreshDashboard();
          UI.showToast('Catatan berhasil dihapus.', 'warning');
        }
      );
    }

    if (editBtn) {
      const logId = editBtn.dataset.id;
      const log = Storage.getLogById(logId);
      if (!log) return;

      UI.openHistoryForm(log);
    }
  }

  const historyEntriesList = document.getElementById('historyEntriesList');
  if (historyEntriesList) {
    historyEntriesList.addEventListener('click', handleHistoryEntryAction);
  }

  const historyTableBody = document.getElementById('historyTableBody');
  if (historyTableBody) {
    historyTableBody.addEventListener('click', handleHistoryEntryAction);
  }

  /* ==================== MOBILE SIDEBAR ==================== */

  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      UI.openMobileSidebar();
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      UI.closeMobileSidebar();
    });
  }

  /* ==================== BANNER CLOSE ==================== */

  const bannerClose = document.getElementById('bannerClose');
  if (bannerClose) {
    bannerClose.addEventListener('click', () => {
      const banner = bannerClose.closest('.banner');
      if (banner) banner.classList.add('hidden');
    });
  }

  /* ==================== BEVERAGE TABS & QUICK LOG BUTTONS ==================== */

  let activeBeverageType = 'water';

  const beverageTabsContainer = document.getElementById('beverageTabs');
  if (beverageTabsContainer) {
    // Render existing custom beverages from Storage if any
    if (typeof Storage !== 'undefined' && Storage.getCustomBeverages) {
      const customBevs = Storage.getCustomBeverages();
      Object.keys(customBevs).forEach(key => {
        const bev = customBevs[key];
        if (!beverageTabsContainer.querySelector(`[data-type="${key}"]`)) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'beverage-tab';
          btn.dataset.type = key;
          btn.innerHTML = `<i class="${bev.icon}"></i><span>${bev.label}</span>`;
          beverageTabsContainer.appendChild(btn);
        }
      });
    }

    beverageTabsContainer.addEventListener('click', (e) => {
      const tab = e.target.closest('.beverage-tab');
      if (!tab) return;
      beverageTabsContainer.querySelectorAll('.beverage-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeBeverageType = tab.dataset.type || 'water';
    });
  }

  // Enable horizontal mouse wheel scroll on container rows & tabs
  const scrollableHorizontalRows = document.querySelectorAll('.quick-log__buttons, .beverage-tabs-wrapper');
  scrollableHorizontalRows.forEach(row => {
    row.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        row.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  });

  // Reusable Smooth Drag-to-Scroll (Works seamlessly on desktop mouse & trackpad)
  function setupDragToScroll(container) {
    if (!container) return;
    let isDown = false;
    let startX = 0;
    let scrollLeftStart = 0;
    let hasMoved = false;

    container.addEventListener('mousedown', (e) => {
      // Don't drag when clicking directly on the 3-dots edit button
      if (e.target.closest('.quick-btn__edit-trigger')) return;

      isDown = true;
      hasMoved = false;
      startX = e.pageX - container.getBoundingClientRect().left;
      scrollLeftStart = container.scrollLeft;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      const currentX = e.pageX - container.getBoundingClientRect().left;
      const walk = currentX - startX;
      if (Math.abs(walk) > 4) {
        hasMoved = true;
        container.classList.add('is-dragging');
        e.preventDefault();
        container.scrollLeft = scrollLeftStart - walk;
      }
    });

    window.addEventListener('mouseup', () => {
      if (!isDown) return;
      isDown = false;
      setTimeout(() => {
        hasMoved = false;
        container.classList.remove('is-dragging');
      }, 50);
    });

    window.addEventListener('blur', () => {
      isDown = false;
      hasMoved = false;
      container.classList.remove('is-dragging');
    });

    // Capture phase: if the user dragged/scrolled, suppress the button click so no drink is logged accidentally!
    container.addEventListener('click', (e) => {
      if (hasMoved) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
  }

  const quickLogButtonsRow = document.querySelector('.quick-log__buttons');
  const beverageTabsWrapper = document.querySelector('.beverage-tabs-wrapper');
  setupDragToScroll(quickLogButtonsRow);
  setupDragToScroll(beverageTabsWrapper);

  const quickLogContainer = document.querySelector('.quick-log__buttons');
  if (quickLogContainer) {
    quickLogContainer.addEventListener('click', (e) => {
      // Check if user clicked edit trigger on a custom container
      const editTrigger = e.target.closest('.quick-btn__edit-trigger');
      if (editTrigger) {
        e.stopPropagation();
        const customBtn = editTrigger.closest('.quick-btn');
        if (customBtn && customBtn.dataset.id) {
          openEditContainer(customBtn.dataset.id);
        }
        return;
      }

      const btn = e.target.closest('.quick-btn');
      if (!btn || btn.id === 'btnAddContainer') return;

      const amount = parseInt(btn.dataset.amount);
      if (!amount || amount <= 0) return;

      const drinkType = activeBeverageType || btn.dataset.type || 'water';
      const typeInfo = Storage.DRINK_TYPES[drinkType] || Storage.DRINK_TYPES.water;
      const cupName = btn.querySelector('span')?.textContent || 'Gelas';

      let containerIcon = btn.dataset.icon;
      if (!containerIcon) {
        const iconEl = btn.querySelector('.custom-icon');
        if (iconEl) {
          containerIcon = Array.from(iconEl.classList).find(c => c.startsWith('icon-'));
        }
      }

      Storage.addLog(amount, drinkType, '', null, containerIcon);
      UI.refreshDashboard();
      UI.showToast(`${amount} ml ${typeInfo.label} (${cupName}) berhasil dicatat! 💧`, 'success');

      // Check if daily goal reached
      const percentage = Storage.getTodayPercentage();
      if (percentage >= 100) {
        setTimeout(() => {
          UI.showToast('🏆 Target harian tercapai! Kamu hebat!', 'success');
        }, 500);
      }

      // Button press animation
      btn.style.transform = 'scale(0.92)';
      setTimeout(() => {
        btn.style.transform = '';
      }, 150);
    });
  }

  /* ==================== ADD / EDIT CONTAINER MODAL ==================== */

  const containerModal = document.getElementById('containerModalOverlay');
  const formAddContainer = document.getElementById('formAddContainer');
  const containerNameInput = document.getElementById('containerNameInput');
  const containerVolumeInput = document.getElementById('containerVolumeInput');
  const containerPreviewBadge = document.getElementById('containerPreviewBadge');
  const containerModalTitle = document.getElementById('containerModalTitle');
  const btnSubmitContainer = document.getElementById('btnSubmitContainer');
  const btnDeleteContainer = document.getElementById('btnDeleteContainer');
  const btnAddContainer = document.getElementById('btnAddContainer');
  const iconPickerBtns = document.querySelectorAll('.icon-picker-btn');

  let selectedIconClass = 'icon-glass-60';
  let manualIconOverride = false;
  let editingContainerId = null;

  function setContainerIcon(iconClass) {
    selectedIconClass = iconClass;
    if (containerPreviewBadge) {
      containerPreviewBadge.innerHTML = `<i class="custom-icon ${iconClass}"></i>`;
    }
    iconPickerBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.icon === iconClass);
    });
  }

  // Open modal in ADD mode
  function openAddContainerModal() {
    editingContainerId = null;
    manualIconOverride = false;
    if (containerModalTitle) containerModalTitle.textContent = 'Tambah Wadah';
    if (btnSubmitContainer) btnSubmitContainer.textContent = 'Tambah Wadah';
    if (btnDeleteContainer) btnDeleteContainer.classList.add('d-none');
    if (formAddContainer) formAddContainer.reset();
    setContainerIcon('icon-glass-60');
    if (containerModal) containerModal.classList.add('active');
    setTimeout(() => {
      if (containerNameInput) containerNameInput.focus();
    }, 100);
  }

  // Open modal in EDIT mode
  function openEditContainer(containerId) {
    const list = Storage.getAllContainers ? Storage.getAllContainers() : [];
    const item = list.find(c => c.id === containerId);
    if (!item) return;

    editingContainerId = containerId;
    manualIconOverride = true;
    if (containerModalTitle) containerModalTitle.textContent = 'Edit Wadah';
    if (btnSubmitContainer) btnSubmitContainer.textContent = 'Simpan';
    if (btnDeleteContainer) btnDeleteContainer.classList.remove('d-none');

    if (containerNameInput) containerNameInput.value = item.name;
    if (containerVolumeInput) containerVolumeInput.value = item.amount;
    setContainerIcon(item.icon || 'icon-glass-60');

    if (containerModal) containerModal.classList.add('active');
    setTimeout(() => {
      if (containerVolumeInput) containerVolumeInput.focus();
    }, 100);
  }

  // Trigger Add modal when clicking + Add button
  if (btnAddContainer) {
    btnAddContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      openAddContainerModal();
    });
  }

  // Delete container button click handler
  if (btnDeleteContainer) {
    btnDeleteContainer.addEventListener('click', () => {
      if (!editingContainerId) return;
      const list = Storage.getAllContainers ? Storage.getAllContainers() : [];
      const item = list.find(c => c.id === editingContainerId);
      const containerName = item ? item.name : 'Wadah';

      Storage.deleteCustomContainer(editingContainerId);
      renderAllContainers();

      if (containerModal) containerModal.classList.remove('active');
      editingContainerId = null;

      UI.showToast(`Wadah "${containerName}" berhasil dihapus! 🗑️`, 'info');
    });
  }

  // Close modal when clicking outside (overlay backdrop)
  if (containerModal) {
    containerModal.addEventListener('click', (e) => {
      if (e.target === containerModal) {
        containerModal.classList.remove('active');
        editingContainerId = null;
      }
    });
  }

  // Cancel button inside container modal
  const btnCancelContainer = document.getElementById('btnCancelContainer');
  if (btnCancelContainer && containerModal) {
    btnCancelContainer.addEventListener('click', () => {
      containerModal.classList.remove('active');
      editingContainerId = null;
    });
  }

  // Icon picker click (manual override)
  iconPickerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      manualIconOverride = true;
      setContainerIcon(btn.dataset.icon);
    });
  });

  // Automatic icon calculation based on volume input
  if (containerVolumeInput) {
    containerVolumeInput.addEventListener('input', () => {
      if (manualIconOverride) return;
      const vol = parseInt(containerVolumeInput.value) || 0;
      let autoIcon = 'icon-glass-60';
      if (vol <= 120) autoIcon = 'icon-coffee';
      else if (vol <= 160) autoIcon = 'icon-cup-40';
      else if (vol <= 180) autoIcon = 'icon-cup-50';
      else if (vol <= 250) autoIcon = 'icon-glass-60';
      else if (vol <= 350) autoIcon = 'icon-glass-75';
      else if (vol <= 750) autoIcon = 'icon-bottle';
      else autoIcon = 'icon-bottle-lg';

      setContainerIcon(autoIcon);
    });
  }

  // Render all containers from Storage (Defaults + Custom)
  function renderAllContainers() {
    const containerGrid = document.querySelector('.quick-log__buttons');
    const addBtn = document.getElementById('btnAddContainer');
    if (!containerGrid || !addBtn) return;

    // Remove existing container buttons except the + Add button
    const oldBtns = containerGrid.querySelectorAll('.quick-btn:not(#btnAddContainer)');
    oldBtns.forEach(b => b.remove());

    const list = Storage.getAllContainers ? Storage.getAllContainers() : [];
    list.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'quick-btn';
      btn.dataset.id = item.id;
      btn.dataset.amount = item.amount;
      btn.dataset.icon = item.icon;
      btn.dataset.type = 'water';

      // Edit trigger badge (top right)
      const editTrigger = document.createElement('span');
      editTrigger.className = 'quick-btn__edit-trigger';
      editTrigger.title = 'Edit / Hapus Wadah';
      editTrigger.innerHTML = '<i class="ri-more-fill"></i>';

      const iconEl = document.createElement('i');
      iconEl.className = `custom-icon ${item.icon}`;

      const spanEl = document.createElement('span');
      spanEl.textContent = item.name;

      const smallEl = document.createElement('small');
      smallEl.textContent = item.amount >= 1000 ? `${item.amount / 1000} L` : `${item.amount} ml`;

      btn.appendChild(editTrigger);
      btn.appendChild(iconEl);
      btn.appendChild(spanEl);
      btn.appendChild(smallEl);

      containerGrid.insertBefore(btn, addBtn);
    });
  }

  // Initial render of all containers on load
  if (typeof Storage !== 'undefined' && Storage.getAllContainers) {
    renderAllContainers();
  }

  // Submit Add / Edit Container form
  if (formAddContainer) {
    formAddContainer.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = containerNameInput ? containerNameInput.value.trim() : '';
      const vol = containerVolumeInput ? parseInt(containerVolumeInput.value) : 0;

      if (!name) {
        UI.showToast('Masukkan nama wadah!', 'warning');
        if (containerNameInput) containerNameInput.focus();
        return;
      }
      if (!vol || vol <= 0) {
        UI.showToast('Masukkan volume wadah yang valid (ml)!', 'warning');
        if (containerVolumeInput) containerVolumeInput.focus();
        return;
      }

      if (editingContainerId) {
        // MODE EDIT: Update existing container (default or custom)
        Storage.updateCustomContainer(editingContainerId, {
          name: name,
          amount: vol,
          icon: selectedIconClass
        });
        renderAllContainers();

        containerModal.classList.remove('active');
        editingContainerId = null;
        UI.showToast(`Wadah "${name}" (${vol} ml) berhasil diperbarui! ✨`, 'success');
      } else {
        // MODE ADD: Create new container (appends to the right, shifting Add button sideways)
        Storage.addCustomContainer(name, vol, selectedIconClass);
        renderAllContainers();

        containerModal.classList.remove('active');
        UI.showToast(`Wadah "${name}" (${vol} ml) berhasil ditambahkan! 🎉`, 'success');

        // Smoothly scroll ONLY the quick-log row to reveal the new container and shifted + Add button
        const containerGrid = document.querySelector('.quick-log__buttons');
        if (containerGrid) {
          setTimeout(() => {
            containerGrid.scrollTo({ left: containerGrid.scrollWidth, behavior: 'smooth' });
            if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
          }, 80);
        }
      }
    });
  }

  /* ==================== DRINK LOG — DELETE & EDIT (Popup di Home Sesuai Gambar 1 & 2) ==================== */

  const editLogModalOverlay = document.getElementById('editLogModalOverlay');
  const deleteLogModalOverlay = document.getElementById('deleteLogModalOverlay');
  const formEditLog = document.getElementById('formEditLog');
  const editLogId = document.getElementById('editLogId');
  const editLogModalTitle = document.getElementById('editLogModalTitle');
  const editLogPreviewBadge = document.getElementById('editLogPreviewBadge');
  const editLogContainerSelect = document.getElementById('editLogContainerSelect');
  const editLogContainerIcon = document.getElementById('editLogContainerIcon');
  const editLogBeverageSelect = document.getElementById('editLogBeverageSelect');
  const editLogBeverageIcon = document.getElementById('editLogBeverageIcon');
  const editLogTimeInput = document.getElementById('editLogTimeInput');
  const editLogAmountInput = document.getElementById('editLogAmountInput');
  const btnCancelEditLog = document.getElementById('btnCancelEditLog');

  const deleteLogModalTitle = document.getElementById('deleteLogModalTitle');
  const deleteLogModalDesc = document.getElementById('deleteLogModalDesc');
  const btnCancelDeleteLog = document.getElementById('btnCancelDeleteLog');
  const btnConfirmDeleteLog = document.getElementById('btnConfirmDeleteLog');

  let pendingDeleteLogId = null;

  // Open Edit Water Entry Modal right on Home (Gambar 2)
  function openEditLogModal(log) {
    if (!editLogModalOverlay || !log) return;

    if (editLogId) editLogId.value = log.id;
    if (editLogModalTitle) editLogModalTitle.textContent = 'Edit Catatan Minum';

    // Populate Container Type dropdown
    const containers = Storage.getAllContainers ? Storage.getAllContainers() : [];
    if (editLogContainerSelect) {
      editLogContainerSelect.innerHTML = '';
      let matched = false;

      containers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.dataset.amount = c.amount;
        opt.dataset.icon = c.icon;
        opt.textContent = `${c.name} (${c.amount >= 1000 ? (c.amount / 1000) + ' L' : c.amount + ' ml'})`;
        if (c.amount === log.amount) {
          opt.selected = true;
          matched = true;
          if (editLogContainerIcon) {
            editLogContainerIcon.innerHTML = `<i class="custom-icon ${c.icon}"></i>`;
          }
          if (editLogPreviewBadge) {
            editLogPreviewBadge.innerHTML = `<i class="custom-icon ${c.icon}"></i>`;
          }
        }
        editLogContainerSelect.appendChild(opt);
      });

      if (!matched) {
        const customOpt = document.createElement('option');
        customOpt.value = 'custom';
        customOpt.dataset.amount = log.amount;
        customOpt.dataset.icon = 'icon-glass-60';
        customOpt.textContent = `Kustom (${log.amount} ml)`;
        customOpt.selected = true;
        editLogContainerSelect.appendChild(customOpt);
        if (editLogContainerIcon) {
          editLogContainerIcon.innerHTML = `<i class="custom-icon icon-glass-60"></i>`;
        }
        if (editLogPreviewBadge) {
          editLogPreviewBadge.innerHTML = `<i class="custom-icon icon-glass-60"></i>`;
        }
      }
    }

    // Set Beverage Type
    if (editLogBeverageSelect) {
      editLogBeverageSelect.value = log.type || 'water';
      const bevIcon = Storage.DRINK_TYPES[log.type]?.icon || 'ri-drop-fill';
      if (editLogBeverageIcon) {
        editLogBeverageIcon.innerHTML = `<i class="${bevIcon}"></i>`;
      }
    }

    // Set Time
    if (editLogTimeInput) {
      const d = new Date(log.timestamp);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      editLogTimeInput.value = `${hh}:${mm}`;
    }

    // Set Amount
    if (editLogAmountInput) {
      editLogAmountInput.value = log.amount;
    }

    editLogModalOverlay.classList.add('active');
  }

  // When container selection changes in Edit modal
  if (editLogContainerSelect) {
    editLogContainerSelect.addEventListener('change', () => {
      const selectedOpt = editLogContainerSelect.selectedOptions[0];
      if (!selectedOpt) return;
      const amt = selectedOpt.dataset.amount;
      const icon = selectedOpt.dataset.icon || 'icon-glass-60';

      if (amt && editLogAmountInput) {
        editLogAmountInput.value = amt;
      }
      if (editLogContainerIcon) {
        editLogContainerIcon.innerHTML = `<i class="custom-icon ${icon}"></i>`;
      }
      if (editLogPreviewBadge) {
        editLogPreviewBadge.innerHTML = `<i class="custom-icon ${icon}"></i>`;
      }
    });
  }

  // When beverage selection changes in Edit modal
  if (editLogBeverageSelect) {
    editLogBeverageSelect.addEventListener('change', () => {
      const bev = editLogBeverageSelect.value;
      const bevIcon = Storage.DRINK_TYPES[bev]?.icon || 'ri-drop-fill';
      if (editLogBeverageIcon) {
        editLogBeverageIcon.innerHTML = `<i class="${bevIcon}"></i>`;
      }
    });
  }

  // Save changes from Edit modal
  if (formEditLog) {
    formEditLog.addEventListener('submit', (e) => {
      e.preventDefault();
      const logId = editLogId ? editLogId.value : null;
      if (!logId) return;

      const amount = parseInt(editLogAmountInput?.value) || 0;
      const type = editLogBeverageSelect?.value || 'water';
      const timeVal = editLogTimeInput?.value;

      if (!amount || amount <= 0) {
        UI.showToast('Masukkan jumlah volume yang valid (ml)!', 'warning');
        return;
      }

      const existingLog = Storage.getLogById(logId);
      const dateObj = existingLog ? new Date(existingLog.timestamp) : new Date();
      if (timeVal) {
        const [hh, mm] = timeVal.split(':');
        dateObj.setHours(parseInt(hh), parseInt(mm), 0, 0);
      }

      const selectedOpt = editLogContainerSelect ? editLogContainerSelect.selectedOptions[0] : null;
      const selectedIcon = selectedOpt ? selectedOpt.dataset.icon : null;

      Storage.updateLog(logId, {
        amount: amount,
        type: type,
        timestamp: dateObj.toISOString(),
        containerIcon: selectedIcon
      });

      UI.refreshDashboard();
      if (typeof refreshHistory === 'function') refreshHistory();
      if (editLogModalOverlay) editLogModalOverlay.classList.remove('active');
      UI.showToast('Catatan berhasil diperbarui! ✨', 'success');
    });
  }

  // Cancel button on Edit modal
  if (btnCancelEditLog && editLogModalOverlay) {
    btnCancelEditLog.addEventListener('click', () => {
      editLogModalOverlay.classList.remove('active');
    });
  }

  // Open Delete Confirmation Modal (Sesuai Gambar 1)
  function openDeleteLogModal(log) {
    if (!deleteLogModalOverlay || !log) return;
    pendingDeleteLogId = log.id;

    const containers = Storage.getAllContainers ? Storage.getAllContainers() : [];
    const matched = containers.find(c => c.amount === log.amount);
    const drinkLabel = Storage.DRINK_TYPES[log.type]?.label || 'Air Putih';
    const containerName = matched ? matched.name : drinkLabel;
    const amountStr = log.amount >= 1000 ? `${log.amount / 1000} L` : `${log.amount} ml`;

    if (deleteLogModalTitle) deleteLogModalTitle.textContent = 'Hapus Catatan Minum';
    if (deleteLogModalDesc) {
      deleteLogModalDesc.textContent = `Apakah Anda yakin ingin menghapus catatan ${containerName} ${amountStr} ini?`;
    }

    deleteLogModalOverlay.classList.add('active');
  }

  // Confirm delete button handler
  if (btnConfirmDeleteLog) {
    btnConfirmDeleteLog.addEventListener('click', () => {
      if (!pendingDeleteLogId) return;
      Storage.deleteLog(pendingDeleteLogId);
      UI.refreshDashboard();
      if (typeof refreshHistory === 'function') refreshHistory();
      if (deleteLogModalOverlay) deleteLogModalOverlay.classList.remove('active');
      pendingDeleteLogId = null;
      UI.showToast('Catatan berhasil dihapus! 🗑️', 'info');
    });
  }

  // Cancel delete button handler
  if (btnCancelDeleteLog && deleteLogModalOverlay) {
    btnCancelDeleteLog.addEventListener('click', () => {
      deleteLogModalOverlay.classList.remove('active');
      pendingDeleteLogId = null;
    });
  }

  // Close modals on overlay backdrop click
  [editLogModalOverlay, deleteLogModalOverlay].forEach(overlay => {
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          pendingDeleteLogId = null;
        }
      });
    }
  });

  // Event delegation on drinkLogList & historyDrinkLogList
  const drinkLogContainers = [
    document.getElementById('drinkLogList'),
    document.getElementById('historyDrinkLogList')
  ].filter(Boolean);

  drinkLogContainers.forEach(container => {
    container.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.btn-delete');
      const editBtn = e.target.closest('.btn-edit');

      if (deleteBtn) {
        const logId = deleteBtn.dataset.id;
        const log = Storage.getLogById(logId);
        if (!log) return;

        if (deleteLogModalOverlay) {
          openDeleteLogModal(log);
        } else {
          const drinkType = Storage.DRINK_TYPES[log.type] || Storage.DRINK_TYPES.water;
          UI.showModal(
            'Hapus Catatan',
            `Apakah Anda yakin ingin menghapus catatan <strong>${drinkType.label} (${log.amount} ml)</strong>?`,
            'Hapus',
            () => {
              Storage.deleteLog(logId);
              UI.refreshDashboard();
              refreshHistory();
              UI.showToast('Catatan berhasil dihapus.', 'warning');
            }
          );
        }
      }

      if (editBtn) {
        const logId = editBtn.dataset.id;
        const log = Storage.getLogById(logId);
        if (!log) return;

        if (editLogModalOverlay) {
          openEditLogModal(log);
        } else if (document.getElementById('historyFormCard')) {
          UI.switchView('history');
          refreshHistory();
          UI.openHistoryForm(log);
        } else {
          window.location.href = `riwayat.html?edit=${encodeURIComponent(logId)}`;
        }
      }
    });
  });

  /* ==================== MODAL EVENTS ==================== */

  const modalClose = document.getElementById('modalClose');
  const modalCancel = document.getElementById('modalCancel');
  const modalConfirm = document.getElementById('modalConfirm');

  if (modalClose) {
    modalClose.addEventListener('click', () => UI.hideModal());
  }

  if (modalCancel) {
    modalCancel.addEventListener('click', () => UI.hideModal());
  }

  if (modalConfirm) {
    modalConfirm.addEventListener('click', () => {
      const callback = UI.getModalConfirmCallback();
      if (typeof callback === 'function') callback();
      UI.hideModal();
    });
  }

  // Close modal on overlay click
  const modalOverlay = document.getElementById('modalOverlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) UI.hideModal();
    });
  }

  /* ==================== FLOATING ACTION BUTTON (FAB SPEED DIAL) ==================== */
  const fabContainer = document.getElementById('fabContainer');
  const fabMainBtn = document.getElementById('fabMainBtn');
  const fabBackdrop = document.getElementById('fabBackdrop');
  const fabNewBeverage = document.getElementById('fabNewBeverage');
  const fabNewContainer = document.getElementById('fabNewContainer');
  const fabAddCustom = document.getElementById('fabAddCustom');

  function toggleFab(forceState) {
    if (!fabContainer) return;
    const shouldOpen = forceState !== undefined ? forceState : !fabContainer.classList.contains('active');
    fabContainer.classList.toggle('active', shouldOpen);
    if (fabBackdrop) fabBackdrop.classList.toggle('active', shouldOpen);
    if (fabMainBtn) fabMainBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }

  function closeFab() {
    toggleFab(false);
  }

  if (fabMainBtn) {
    fabMainBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFab();
    });
  }

  if (fabBackdrop) {
    fabBackdrop.addEventListener('click', closeFab);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fabContainer && fabContainer.classList.contains('active')) {
      closeFab();
    }
  });

  // FAB Item 1: New Beverage
  const newBeverageModalOverlay = document.getElementById('newBeverageModalOverlay');
  const formNewBeverage = document.getElementById('formNewBeverage');
  const newBeverageNameInput = document.getElementById('newBeverageNameInput');
  const newBeveragePreviewBadge = document.getElementById('newBeveragePreviewBadge');
  const btnCancelNewBeverage = document.getElementById('btnCancelNewBeverage');
  const beverageIconPicker = document.getElementById('beverageIconPicker');
  let selectedBeverageIcon = 'ri-cup-line';

  if (fabNewBeverage) {
    fabNewBeverage.addEventListener('click', () => {
      closeFab();
      if (formNewBeverage) formNewBeverage.reset();
      selectedBeverageIcon = 'ri-cup-line';
      if (newBeveragePreviewBadge) {
        newBeveragePreviewBadge.innerHTML = `<i class="${selectedBeverageIcon}" style="font-size:24px;"></i>`;
      }
      if (beverageIconPicker) {
        beverageIconPicker.querySelectorAll('.icon-picker-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.icon === selectedBeverageIcon);
        });
      }
      if (newBeverageModalOverlay) newBeverageModalOverlay.classList.add('active');
      setTimeout(() => { if (newBeverageNameInput) newBeverageNameInput.focus(); }, 100);
    });
  }

  if (beverageIconPicker) {
    beverageIconPicker.querySelectorAll('.icon-picker-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedBeverageIcon = btn.dataset.icon || 'ri-cup-line';
        beverageIconPicker.querySelectorAll('.icon-picker-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (newBeveragePreviewBadge) {
          newBeveragePreviewBadge.innerHTML = `<i class="${selectedBeverageIcon}" style="font-size:24px;"></i>`;
        }
      });
    });
  }

  if (btnCancelNewBeverage && newBeverageModalOverlay) {
    btnCancelNewBeverage.addEventListener('click', () => {
      newBeverageModalOverlay.classList.remove('active');
    });
  }

  if (formNewBeverage) {
    formNewBeverage.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = newBeverageNameInput ? newBeverageNameInput.value.trim() : '';
      if (!name) return;

      if (Storage.addCustomBeverage) {
        const newBev = Storage.addCustomBeverage(name, selectedBeverageIcon);
        if (beverageTabsContainer) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'beverage-tab active';
          btn.dataset.type = newBev.id;
          btn.innerHTML = `<i class="${newBev.icon}"></i><span>${newBev.label}</span>`;
          beverageTabsContainer.querySelectorAll('.beverage-tab').forEach(t => t.classList.remove('active'));
          beverageTabsContainer.appendChild(btn);
          activeBeverageType = newBev.id;
        }

        // Add to beverage dropdowns if available
        const bevSelects = document.querySelectorAll('#editLogBeverageSelect, #customIntakeBeverageSelect');
        bevSelects.forEach(sel => {
          const opt = document.createElement('option');
          opt.value = newBev.id;
          opt.textContent = newBev.label;
          sel.appendChild(opt);
        });
      }

      if (newBeverageModalOverlay) newBeverageModalOverlay.classList.remove('active');
      UI.showToast(`Kategori minuman "${name}" berhasil ditambahkan! 🍹`, 'success');
    });
  }

  // FAB Item 2: New Container
  if (fabNewContainer) {
    fabNewContainer.addEventListener('click', () => {
      closeFab();
      openAddContainerModal();
    });
  }

  // FAB Item 3: + add Custom (Custom Intake Log)
  const customIntakeModalOverlay = document.getElementById('customIntakeModalOverlay');
  const formCustomIntake = document.getElementById('formCustomIntake');
  const customIntakeAmount = document.getElementById('customIntakeAmount');
  const customIntakeBeverageSelect = document.getElementById('customIntakeBeverageSelect');
  const customIntakeBeverageIcon = document.getElementById('customIntakeBeverageIcon');
  const customIntakeTime = document.getElementById('customIntakeTime');
  const btnCancelCustomIntake = document.getElementById('btnCancelCustomIntake');

  if (fabAddCustom) {
    fabAddCustom.addEventListener('click', () => {
      closeFab();
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      if (customIntakeTime) customIntakeTime.value = `${hh}:${mm}`;
      if (customIntakeBeverageSelect) {
        customIntakeBeverageSelect.value = activeBeverageType || 'water';
        const bev = Storage.DRINK_TYPES[customIntakeBeverageSelect.value];
        if (customIntakeBeverageIcon && bev) {
          customIntakeBeverageIcon.innerHTML = `<i class="${bev.icon}"></i>`;
        }
      }
      if (customIntakeModalOverlay) customIntakeModalOverlay.classList.add('active');
      setTimeout(() => { if (customIntakeAmount) customIntakeAmount.focus(); }, 100);
    });
  }

  if (customIntakeBeverageSelect) {
    customIntakeBeverageSelect.addEventListener('change', () => {
      const val = customIntakeBeverageSelect.value;
      const bev = Storage.DRINK_TYPES[val] || Storage.DRINK_TYPES.water;
      if (customIntakeBeverageIcon && bev) {
        customIntakeBeverageIcon.innerHTML = `<i class="${bev.icon}"></i>`;
      }
    });
  }

  if (btnCancelCustomIntake && customIntakeModalOverlay) {
    btnCancelCustomIntake.addEventListener('click', () => {
      customIntakeModalOverlay.classList.remove('active');
    });
  }

  if (formCustomIntake) {
    formCustomIntake.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseInt(customIntakeAmount?.value) || 0;
      const type = customIntakeBeverageSelect?.value || 'water';
      const timeVal = customIntakeTime?.value;

      if (!amount || amount <= 0) {
        UI.showToast('Masukkan jumlah volume yang valid (ml)!', 'warning');
        return;
      }

      const dateObj = new Date();
      if (timeVal) {
        const [hh, mm] = timeVal.split(':');
        dateObj.setHours(parseInt(hh), parseInt(mm), 0, 0);
      }

      const typeInfo = Storage.DRINK_TYPES[type] || Storage.DRINK_TYPES.water;
      Storage.addLog(amount, type, '', dateObj.toISOString());
      UI.refreshDashboard();
      if (customIntakeModalOverlay) customIntakeModalOverlay.classList.remove('active');
      UI.showToast(`${amount} ml ${typeInfo.label} berhasil dicatat! ✨`, 'success');
    });
  }

  // Close new modals on backdrop click
  [newBeverageModalOverlay, customIntakeModalOverlay].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }
  });

  /* ==================== HISTORY MOBILE: SWIPE (EDIT/DELETE) & FAB (+ ADD PAST ENTRY) ==================== */
  const historyDrinkLogListEl = document.getElementById('historyDrinkLogList');
  if (historyDrinkLogListEl) {
    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeCurrentX = 0;
    let activeSwipeRow = null;
    let activeCardEl = null;
    let isSwipingHorizontal = false;
    let isPointerDown = false;

    function startSwipe(clientX, clientY, target) {
      const row = target.closest('.history-swipe-item');
      if (!row || window.innerWidth > 768) return;
      const card = row.querySelector('.drink-log__item');
      if (!card) return;

      swipeStartX = clientX;
      swipeStartY = clientY;
      swipeCurrentX = 0;
      activeSwipeRow = row;
      activeCardEl = card;
      isSwipingHorizontal = false;
      isPointerDown = true;
      activeCardEl.style.transition = 'none';
    }

    function moveSwipe(clientX, clientY, e) {
      if (!isPointerDown || !activeSwipeRow || !activeCardEl) return;
      const dx = clientX - swipeStartX;
      const dy = clientY - swipeStartY;

      if (!isSwipingHorizontal) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          isSwipingHorizontal = true;
        } else {
          // Vertical scroll — cancel horizontal swipe
          resetSwipe(false);
          return;
        }
      }

      if (e && e.cancelable) e.preventDefault();

      // Clamp horizontal drag between -110px and +110px
      swipeCurrentX = Math.max(-110, Math.min(110, dx));
      activeCardEl.style.transform = `translateX(${swipeCurrentX}px)`;
      activeSwipeRow.classList.toggle('swiping-left', swipeCurrentX < -10);
      activeSwipeRow.classList.toggle('swiping-right', swipeCurrentX > 10);
    }

    function resetSwipe(triggerAction = true) {
      if (!activeSwipeRow || !activeCardEl) return;
      const logId = activeSwipeRow.dataset.id;
      const finalDeltaX = swipeCurrentX;
      const cardToReset = activeCardEl;
      const rowToReset = activeSwipeRow;

      cardToReset.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
      cardToReset.style.transform = 'translateX(0)';
      setTimeout(() => {
        rowToReset.classList.remove('swiping-left', 'swiping-right');
      }, 200);

      activeSwipeRow = null;
      activeCardEl = null;
      swipeCurrentX = 0;
      isSwipingHorizontal = false;
      isPointerDown = false;

      if (triggerAction && logId && Math.abs(finalDeltaX) >= 55) {
        const log = Storage.getLogById(logId);
        if (!log) return;
        if (finalDeltaX <= -55) {
          // Swipe Left -> Delete Pop-up
          openDeleteLogModal(log);
        } else if (finalDeltaX >= 55) {
          // Swipe Right -> Edit Pop-up
          openEditLogModal(log);
        }
      }
    }

    // Touch events for mobile phone
    historyDrinkLogListEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startSwipe(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }, { passive: true });

    historyDrinkLogListEl.addEventListener('touchmove', (e) => {
      if (!isPointerDown || e.touches.length !== 1) return;
      moveSwipe(e.touches[0].clientX, e.touches[0].clientY, e);
    }, { passive: false });

    historyDrinkLogListEl.addEventListener('touchend', () => {
      resetSwipe(true);
    });

    historyDrinkLogListEl.addEventListener('touchcancel', () => {
      resetSwipe(false);
    });

    // Mouse fallback for responsive testing
    historyDrinkLogListEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      startSwipe(e.clientX, e.clientY, e.target);
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPointerDown) return;
      moveSwipe(e.clientX, e.clientY, e);
    });

    window.addEventListener('mouseup', () => {
      if (!isPointerDown) return;
      resetSwipe(true);
    });
  }

  // History FAB (+ Add Past Entry) & Modal (Add Custom Amount)
  const historyFabContainer = document.getElementById('historyFabContainer');
  const historyFabMainBtn = document.getElementById('historyFabMainBtn');
  const historyFabBackdrop = document.getElementById('historyFabBackdrop');
  const fabAddPastEntry = document.getElementById('fabAddPastEntry');
  const pastEntryModalOverlay = document.getElementById('pastEntryModalOverlay');
  const formPastEntry = document.getElementById('formPastEntry');
  const pastEntryBeverageSelect = document.getElementById('pastEntryBeverageSelect');
  const pastEntryBeverageIcon = document.getElementById('pastEntryBeverageIcon');
  const pastEntryPreviewBadge = document.getElementById('pastEntryPreviewBadge');
  const pastEntryAmountInput = document.getElementById('pastEntryAmountInput');
  const btnCancelPastEntry = document.getElementById('btnCancelPastEntry');

  function toggleHistoryFab(forceState) {
    if (!historyFabContainer) return;
    const shouldOpen = forceState !== undefined ? forceState : !historyFabContainer.classList.contains('active');
    historyFabContainer.classList.toggle('active', shouldOpen);
    if (historyFabBackdrop) historyFabBackdrop.classList.toggle('active', shouldOpen);
    if (historyFabMainBtn) historyFabMainBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }

  if (historyFabMainBtn) {
    historyFabMainBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHistoryFab();
    });
  }

  if (historyFabBackdrop) {
    historyFabBackdrop.addEventListener('click', () => toggleHistoryFab(false));
  }

  if (fabAddPastEntry) {
    fabAddPastEntry.addEventListener('click', () => {
      toggleHistoryFab(false);
      // Populate custom beverages if any (getCustomBeverages returns an Object { id: { label, icon } })
      if (pastEntryBeverageSelect && Storage.getCustomBeverages) {
        const customBevs = Storage.getCustomBeverages() || {};
        Object.entries(customBevs).forEach(([id, cb]) => {
          if (cb && cb.label && !pastEntryBeverageSelect.querySelector(`option[value="${id}"]`)) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = cb.label;
            pastEntryBeverageSelect.appendChild(opt);
          }
        });
        pastEntryBeverageSelect.value = 'water';
      }
      if (pastEntryBeverageIcon) {
        pastEntryBeverageIcon.innerHTML = '<i class="ri-drop-fill" aria-hidden="true"></i>';
      }
      if (pastEntryPreviewBadge) {
        pastEntryPreviewBadge.innerHTML = '<i class="ri-drop-fill" style="font-size: 24px;" aria-hidden="true"></i>';
      }
      if (pastEntryAmountInput) {
        pastEntryAmountInput.value = '250';
      }
      if (pastEntryModalOverlay) {
        pastEntryModalOverlay.classList.add('active');
        setTimeout(() => { if (pastEntryAmountInput) pastEntryAmountInput.focus(); }, 100);
      }
    });
  }

  if (pastEntryBeverageSelect) {
    pastEntryBeverageSelect.addEventListener('change', () => {
      const val = pastEntryBeverageSelect.value;
      const bev = Storage.DRINK_TYPES[val] || Storage.DRINK_TYPES.water;
      if (pastEntryBeverageIcon && bev) {
        pastEntryBeverageIcon.innerHTML = `<i class="${bev.icon}" aria-hidden="true"></i>`;
      }
      if (pastEntryPreviewBadge && bev) {
        pastEntryPreviewBadge.innerHTML = `<i class="${bev.icon}" style="font-size: 24px;" aria-hidden="true"></i>`;
      }
    });
  }

  if (btnCancelPastEntry && pastEntryModalOverlay) {
    btnCancelPastEntry.addEventListener('click', () => {
      pastEntryModalOverlay.classList.remove('active');
    });
  }

  if (pastEntryModalOverlay) {
    pastEntryModalOverlay.addEventListener('click', (e) => {
      if (e.target === pastEntryModalOverlay) {
        pastEntryModalOverlay.classList.remove('active');
      }
    });
  }

  if (formPastEntry) {
    formPastEntry.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseInt(pastEntryAmountInput?.value) || 0;
      const type = pastEntryBeverageSelect?.value || 'water';

      if (!amount || amount <= 0) {
        UI.showToast('Masukkan jumlah volume yang valid (ml)!', 'warning');
        return;
      }

      const targetDateStr = historyState.selectedDate || Storage.formatDateKey(new Date());
      const now = new Date();
      const [yy, mm, dd] = targetDateStr.split('-').map(Number);
      const entryDate = new Date(yy, mm - 1, dd, now.getHours(), now.getMinutes(), now.getSeconds());

      const typeInfo = Storage.DRINK_TYPES[type] || Storage.DRINK_TYPES.water;
      Storage.addLog(amount, type, '', entryDate.toISOString());

      const recentEntriesEl = document.getElementById('historyRecentEntries');
      if (recentEntriesEl) recentEntriesEl.classList.remove('mobile-collapsed');

      refreshHistory();
      UI.refreshDashboard();
      if (pastEntryModalOverlay) pastEntryModalOverlay.classList.remove('active');
      UI.showToast(`${amount} ml ${typeInfo.label} berhasil ditambahkan!`, 'success');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (historyFabContainer && historyFabContainer.classList.contains('active')) {
        toggleHistoryFab(false);
      }
      if (pastEntryModalOverlay && pastEntryModalOverlay.classList.contains('active')) {
        pastEntryModalOverlay.classList.remove('active');
      }
      if (editLogModalOverlay && editLogModalOverlay.classList.contains('active')) {
        editLogModalOverlay.classList.remove('active');
      }
      if (deleteLogModalOverlay && deleteLogModalOverlay.classList.contains('active')) {
        deleteLogModalOverlay.classList.remove('active');
      }
    }
  });

  /* ==================== SETTINGS PAGE CONTROLLER ==================== */
  function initSettingsPage() {
    UI.renderSettings();

    // 0. Sub-view Navigation (Main Settings Menu <-> Profile / Appearance / Data / About)
    const allSettingsViews = document.querySelectorAll('.m3-settings-view');
    const mainMenuView = document.getElementById('settingsMainMenu');

    function showSettingsSubview(targetId) {
      allSettingsViews.forEach(v => v.classList.remove('active'));
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.classList.add('active');
      } else if (mainMenuView) {
        mainMenuView.classList.add('active');
      }
      const mainEl = document.querySelector('.main-content');
      if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.querySelectorAll('[data-open-subview]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-open-subview');
        if (targetId) showSettingsSubview(targetId);
      });
    });

    document.querySelectorAll('[data-back-main]').forEach(btn => {
      btn.addEventListener('click', () => {
        showSettingsSubview('settingsMainMenu');
      });
    });

    // Accordion Expand / Collapse Cards
    document.querySelectorAll('[data-toggle-accordion]').forEach(headerBtn => {
      headerBtn.addEventListener('click', () => {
        const cardId = headerBtn.getAttribute('data-toggle-accordion');
        const cardEl = document.getElementById(cardId);
        if (cardEl) {
          cardEl.classList.toggle('is-open');
        }
      });
    });

    // Profile Photo Preview & Camera/Gallery Picker (Pop-up Desktop / Bottom Sheet Mobile)
    const btnViewProfilePhoto = document.getElementById('btnViewProfilePhoto');
    const btnUploadProfilePhoto = document.getElementById('btnUploadProfilePhoto');
    const inputProfilePhoto = document.getElementById('inputProfilePhoto');
    const inputProfileCamera = document.getElementById('inputProfileCamera');
    const profilePhotoModalOverlay = document.getElementById('profilePhotoModalOverlay');
    const btnClosePhotoModal = document.getElementById('btnClosePhotoModal');

    const photoSourceModalOverlay = document.getElementById('photoSourceModalOverlay');
    const photoSourceModalTitle = document.getElementById('photoSourceModalTitle');
    const btnClosePhotoSourceModal = document.getElementById('btnClosePhotoSourceModal');
    const photoSourceOptions = document.getElementById('photoSourceOptions');
    const btnPickFromCamera = document.getElementById('btnPickFromCamera');
    const btnPickFromGallery = document.getElementById('btnPickFromGallery');
    const cameraCaptureView = document.getElementById('cameraCaptureView');
    const cameraVideoStream = document.getElementById('cameraVideoStream');
    const btnCancelCameraCapture = document.getElementById('btnCancelCameraCapture');
    const btnCaptureSnapshot = document.getElementById('btnCaptureSnapshot');

    let activeCameraStream = null;

    function stopCameraStream() {
      if (activeCameraStream) {
        activeCameraStream.getTracks().forEach(track => track.stop());
        activeCameraStream = null;
      }
      if (cameraVideoStream) {
        cameraVideoStream.srcObject = null;
      }
    }

    function showPhotoSourceMenu() {
      stopCameraStream();
      if (photoSourceModalTitle) photoSourceModalTitle.textContent = 'Ubah Foto Profil';
      if (photoSourceOptions) photoSourceOptions.classList.remove('hidden');
      if (cameraCaptureView) cameraCaptureView.classList.add('hidden');
    }

    function openPhotoSourceModal() {
      if (!photoSourceModalOverlay) return;
      showPhotoSourceMenu();
      photoSourceModalOverlay.classList.add('active');
    }

    function closePhotoSourceModal() {
      stopCameraStream();
      if (photoSourceModalOverlay) photoSourceModalOverlay.classList.remove('active');
    }

    function openProfilePhotoModal() {
      if (!profilePhotoModalOverlay) return;
      UI.renderSettings();
      profilePhotoModalOverlay.classList.add('active');
    }

    function closeProfilePhotoModal() {
      if (profilePhotoModalOverlay) profilePhotoModalOverlay.classList.remove('active');
    }

    function saveCompressedProfileImage(imgSource, width, height, mirrorHorizontal = false) {
      try {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const minSide = Math.min(width, height);
        const sx = (width - minSide) / 2;
        const sy = (height - minSide) / 2;

        if (mirrorHorizontal) {
          ctx.translate(size, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(imgSource, sx, sy, minSide, minSide, 0, 0, size, size);

        const finalPhoto = canvas.toDataURL('image/jpeg', 0.86);
        Storage.saveSettings({ profilePhoto: finalPhoto });
        UI.updateUserInfo();
        UI.renderSettings();
        UI.showToast('Foto profil berhasil diperbarui! ✨', 'success');
      } catch (err) {
        console.error('Gagal memproses foto profil:', err);
        UI.showToast('Gagal menyimpan foto profil.', 'danger');
      }
    }

    function handleSelectedImageFile(file) {
      if (!file) return;
      if (!file.type || !file.type.startsWith('image/')) {
        UI.showToast('Pilih file gambar yang valid!', 'warning');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const rawDataUrl = event.target?.result;
        if (typeof rawDataUrl !== 'string') return;

        const img = new Image();
        img.onload = () => {
          saveCompressedProfileImage(img, img.width, img.height, false);
        };
        img.onerror = () => {
          UI.showToast('Gambar tidak dapat dibaca. Coba file lain.', 'warning');
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    }

    if (btnViewProfilePhoto) {
      btnViewProfilePhoto.addEventListener('click', openProfilePhotoModal);
    }

    if (btnClosePhotoModal) btnClosePhotoModal.addEventListener('click', closeProfilePhotoModal);
    if (profilePhotoModalOverlay) {
      profilePhotoModalOverlay.addEventListener('click', (e) => {
        if (e.target === profilePhotoModalOverlay) closeProfilePhotoModal();
      });
    }

    if (btnUploadProfilePhoto) {
      btnUploadProfilePhoto.addEventListener('click', (e) => {
        e.stopPropagation();
        openPhotoSourceModal();
      });
    }

    if (btnClosePhotoSourceModal) btnClosePhotoSourceModal.addEventListener('click', closePhotoSourceModal);
    if (photoSourceModalOverlay) {
      photoSourceModalOverlay.addEventListener('click', (e) => {
        if (e.target === photoSourceModalOverlay) closePhotoSourceModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (profilePhotoModalOverlay && profilePhotoModalOverlay.classList.contains('active')) {
          closeProfilePhotoModal();
        }
        if (photoSourceModalOverlay && photoSourceModalOverlay.classList.contains('active')) {
          closePhotoSourceModal();
        }
      }
    });

    // Opsi 1: Galeri (membuka galeri di HP / folder file di Desktop)
    if (btnPickFromGallery) {
      btnPickFromGallery.addEventListener('click', () => {
        closePhotoSourceModal();
        if (inputProfilePhoto) inputProfilePhoto.click();
      });
    }

    // Opsi 2: Kamera (kamera native di HP, webcam live di Desktop dengan fallback file)
    if (btnPickFromCamera) {
      btnPickFromCamera.addEventListener('click', async () => {
        const isMobileDevice = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
          || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        if (isMobileDevice && inputProfileCamera) {
          closePhotoSourceModal();
          inputProfileCamera.click();
          return;
        }

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && cameraVideoStream) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
              audio: false
            });
            activeCameraStream = stream;
            cameraVideoStream.srcObject = stream;
            if (photoSourceModalTitle) photoSourceModalTitle.textContent = 'Ambil Foto Kamera';
            if (photoSourceOptions) photoSourceOptions.classList.add('hidden');
            if (cameraCaptureView) cameraCaptureView.classList.remove('hidden');
          } catch (err) {
            console.warn('Kamera tidak tersedia atau izin ditolak:', err);
            UI.showToast('Kamera tidak dapat diakses. Pilih foto dari galeri.', 'warning');
            if (inputProfilePhoto) {
              closePhotoSourceModal();
              inputProfilePhoto.click();
            }
          }
        } else if (inputProfileCamera) {
          closePhotoSourceModal();
          inputProfileCamera.click();
        }
      });
    }

    if (btnCancelCameraCapture) {
      btnCancelCameraCapture.addEventListener('click', showPhotoSourceMenu);
    }

    if (btnCaptureSnapshot && cameraVideoStream) {
      btnCaptureSnapshot.addEventListener('click', () => {
        if (!cameraVideoStream.videoWidth || !cameraVideoStream.videoHeight) return;
        saveCompressedProfileImage(
          cameraVideoStream,
          cameraVideoStream.videoWidth,
          cameraVideoStream.videoHeight,
          true
        );
        closePhotoSourceModal();
      });
    }

    if (inputProfilePhoto) {
      inputProfilePhoto.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        handleSelectedImageFile(file);
        inputProfilePhoto.value = '';
      });
    }

    if (inputProfileCamera) {
      inputProfileCamera.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        handleSelectedImageFile(file);
        inputProfileCamera.value = '';
      });
    }

    // Inline Profile Name Editor
    const btnToggleEditName = document.getElementById('btnToggleEditName');
    const inlineNameEditor = document.getElementById('inlineNameEditor');
    const btnApplyName = document.getElementById('btnApplyName');
    const userNameInput = document.getElementById('inputUserName');

    /* ==================== EDIT PROFILE NAME MODAL ==================== */
    const editNameModalOverlay = document.getElementById('editNameModalOverlay');
    const btnCloseEditNameModal = document.getElementById('btnCloseEditNameModal');
    const btnCancelEditNameModal = document.getElementById('btnCancelEditNameModal');
    const editNameModalForm = document.getElementById('editNameModalForm');
    const inputModalUserName = document.getElementById('inputModalUserName');

    function openEditNameModal() {
      if (!editNameModalOverlay) return;
      const current = Storage.getSettings();
      if (inputModalUserName) {
        inputModalUserName.value = (current.userName || 'Pengguna').trim() || 'Pengguna';
      }
      editNameModalOverlay.classList.add('active');
      setTimeout(() => {
        if (inputModalUserName) {
          inputModalUserName.focus();
          inputModalUserName.select();
        }
      }, 120);
    }

    function closeEditNameModal() {
      if (editNameModalOverlay) editNameModalOverlay.classList.remove('active');
    }

    if (btnToggleEditName) {
      btnToggleEditName.addEventListener('click', (e) => {
        e.preventDefault();
        openEditNameModal();
      });
    }

    if (btnCloseEditNameModal) btnCloseEditNameModal.addEventListener('click', closeEditNameModal);
    if (btnCancelEditNameModal) btnCancelEditNameModal.addEventListener('click', closeEditNameModal);

    if (editNameModalOverlay) {
      editNameModalOverlay.addEventListener('click', (e) => {
        if (e.target === editNameModalOverlay) closeEditNameModal();
      });
    }

    if (editNameModalForm) {
      editNameModalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newName = inputModalUserName ? inputModalUserName.value.trim() : '';
        if (!newName) {
          UI.showToast('Nama pengguna tidak boleh kosong!', 'warning');
          return;
        }

        Storage.saveSettings({ userName: newName });
        UI.updateUserInfo();
        UI.renderSettings();
        closeEditNameModal();
        UI.showToast('Nama profil berhasil diperbarui! ✨', 'success');
      });
    }

    if (btnApplyName && userNameInput) {
      btnApplyName.addEventListener('click', () => {
        const newName = userNameInput.value.trim();
        if (!newName) {
          UI.showToast('Nama pengguna tidak boleh kosong!', 'warning');
          return;
        }
        Storage.saveSettings({ userName: newName });
        UI.updateUserInfo();
        UI.renderSettings();
        if (inlineNameEditor) inlineNameEditor.classList.add('hidden');
        UI.showToast('Nama pengguna berhasil diperbarui! ✨', 'success');
      });
    }

    // Instant Gender Selection
    document.querySelectorAll('input[name="gender"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          Storage.saveSettings({ gender: radio.value });
          UI.renderSettings();
          UI.showToast('Jenis kelamin berhasil disimpan! ✨', 'success');
        }
      });
    });

    // Instant Activity Level Selection
    document.querySelectorAll('input[name="activity_radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          const activitySelect = document.getElementById('selectActivity');
          if (activitySelect) activitySelect.value = radio.value;
          Storage.saveSettings({ activityLevel: radio.value });
          UI.renderSettings();
          UI.showToast('Tingkat aktivitas berhasil disimpan! ✨', 'success');
        }
      });
    });

    // Instant Daily Goal Presets
    document.querySelectorAll('[data-goal-preset]').forEach(presetBtn => {
      presetBtn.addEventListener('click', () => {
        const val = parseInt(presetBtn.getAttribute('data-goal-preset'));
        const goalInput = document.getElementById('inputDailyGoal');
        if (val && goalInput) {
          goalInput.value = val;
          Storage.saveSettings({ dailyGoal: val });
          UI.renderSettings();
          UI.showToast(`Target harian ${val.toLocaleString('id-ID')} ml berhasil disimpan! ✨`, 'success');
        }
      });
    });

    /* ==================== DAILY WATER GOAL MODAL ==================== */
    const goalModalOverlay = document.getElementById('goalModalOverlay');
    const btnOpenGoalModal = document.getElementById('btnOpenGoalModal');
    const btnCloseGoalModal = document.getElementById('btnCloseGoalModal');
    const btnCancelGoalModal = document.getElementById('btnCancelGoalModal');
    const goalModalForm = document.getElementById('goalModalForm');
    const inputDailyGoalModal = document.getElementById('inputDailyGoalModal');

    function openGoalModal() {
      if (!goalModalOverlay) return;
      const current = Storage.getSettings();
      const currentGoal = current.dailyGoal || 2000;
      if (inputDailyGoalModal) inputDailyGoalModal.value = currentGoal;

      document.querySelectorAll('[data-modal-goal-preset]').forEach(btn => {
        const pVal = parseInt(btn.getAttribute('data-modal-goal-preset'));
        btn.classList.toggle('active', pVal === currentGoal);
      });

      goalModalOverlay.classList.add('active');
      setTimeout(() => {
        if (inputDailyGoalModal) inputDailyGoalModal.focus();
      }, 120);
    }

    function closeGoalModal() {
      if (goalModalOverlay) goalModalOverlay.classList.remove('active');
    }

    if (btnOpenGoalModal) btnOpenGoalModal.addEventListener('click', openGoalModal);
    if (btnCloseGoalModal) btnCloseGoalModal.addEventListener('click', closeGoalModal);
    if (btnCancelGoalModal) btnCancelGoalModal.addEventListener('click', closeGoalModal);

    if (goalModalOverlay) {
      goalModalOverlay.addEventListener('click', (e) => {
        if (e.target === goalModalOverlay) closeGoalModal();
      });
    }

    document.querySelectorAll('[data-modal-goal-preset]').forEach(presetBtn => {
      presetBtn.addEventListener('click', () => {
        const val = parseInt(presetBtn.getAttribute('data-modal-goal-preset'));
        if (val && inputDailyGoalModal) {
          inputDailyGoalModal.value = val;
          document.querySelectorAll('[data-modal-goal-preset]').forEach(b => b.classList.remove('active'));
          presetBtn.classList.add('active');
        }
      });
    });

    if (goalModalForm) {
      goalModalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = parseInt(inputDailyGoalModal?.value);
        if (isNaN(val) || val < 500 || val > 6000) {
          UI.showToast('Target air harian harus antara 500 dan 6.000 ml!', 'warning');
          return;
        }

        Storage.saveSettings({ dailyGoal: val });
        UI.renderSettings();
        UI.updateUserInfo();
        if (UI.refreshDashboard) UI.refreshDashboard();
        closeGoalModal();
        UI.showToast(`Target harian ${val.toLocaleString('id-ID')} ml berhasil disimpan! ✨`, 'success');
      });
    }

    /* ==================== ACTIVITY LEVEL MODAL ==================== */
    const activityModalOverlay = document.getElementById('activityModalOverlay');
    const btnOpenActivityModal = document.getElementById('btnOpenActivityModal');
    const btnCloseActivityModal = document.getElementById('btnCloseActivityModal');
    const btnCancelActivityModal = document.getElementById('btnCancelActivityModal');
    const activityModalForm = document.getElementById('activityModalForm');

    function openActivityModal() {
      if (!activityModalOverlay) return;
      const current = Storage.getSettings();
      const currentActivity = current.activityLevel || 'moderate';
      document.querySelectorAll('input[name="modal_activity_radio"]').forEach(radio => {
        radio.checked = (radio.value === currentActivity);
      });
      activityModalOverlay.classList.add('active');
    }

    function closeActivityModal() {
      if (activityModalOverlay) activityModalOverlay.classList.remove('active');
    }

    if (btnOpenActivityModal) btnOpenActivityModal.addEventListener('click', openActivityModal);
    if (btnCloseActivityModal) btnCloseActivityModal.addEventListener('click', closeActivityModal);
    if (btnCancelActivityModal) btnCancelActivityModal.addEventListener('click', closeActivityModal);

    if (activityModalOverlay) {
      activityModalOverlay.addEventListener('click', (e) => {
        if (e.target === activityModalOverlay) closeActivityModal();
      });
    }

    if (activityModalForm) {
      activityModalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const selectedRadio = document.querySelector('input[name="modal_activity_radio"]:checked');
        const activityVal = selectedRadio ? selectedRadio.value : 'moderate';

        Storage.saveSettings({ activityLevel: activityVal });
        UI.renderSettings();
        closeActivityModal();
        UI.showToast('Tingkat aktivitas berhasil diperbarui! ✨', 'success');
      });
    }

    /* ==================== GENDER MODAL ==================== */
    const genderModalOverlay = document.getElementById('genderModalOverlay');
    const btnOpenGenderModal = document.getElementById('btnOpenGenderModal');
    const btnCloseGenderModal = document.getElementById('btnCloseGenderModal');
    const btnCancelGenderModal = document.getElementById('btnCancelGenderModal');
    const genderModalForm = document.getElementById('genderModalForm');

    function openGenderModal() {
      if (!genderModalOverlay) return;
      const current = Storage.getSettings();
      const currentGender = current.gender || 'prefer-not-to-say';
      document.querySelectorAll('input[name="modal_gender_radio"]').forEach(radio => {
        radio.checked = (radio.value === currentGender);
      });
      genderModalOverlay.classList.add('active');
    }

    function closeGenderModal() {
      if (genderModalOverlay) genderModalOverlay.classList.remove('active');
    }

    if (btnOpenGenderModal) btnOpenGenderModal.addEventListener('click', openGenderModal);
    if (btnCloseGenderModal) btnCloseGenderModal.addEventListener('click', closeGenderModal);
    if (btnCancelGenderModal) btnCancelGenderModal.addEventListener('click', closeGenderModal);

    if (genderModalOverlay) {
      genderModalOverlay.addEventListener('click', (e) => {
        if (e.target === genderModalOverlay) closeGenderModal();
      });
    }

    if (genderModalForm) {
      genderModalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const selectedRadio = document.querySelector('input[name="modal_gender_radio"]:checked');
        const genderVal = selectedRadio ? selectedRadio.value : 'prefer-not-to-say';

        Storage.saveSettings({ gender: genderVal });
        UI.renderSettings();
        closeGenderModal();
        UI.showToast('Jenis kelamin berhasil disimpan! ✨', 'success');
      });
    }

    // 1. Profile Form Submit (Personal: Gender, Name & Daily Goals: Goal, Activity)
    const profileForm = document.getElementById('settingsProfileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userName = userNameInput ? userNameInput.value.trim() : 'Pengguna';

        const genderRadio = document.querySelector('input[name="gender"]:checked');
        const gender = genderRadio ? genderRadio.value : 'prefer-not-to-say';

        const goalInput = document.getElementById('inputDailyGoal');
        const dailyGoal = parseInt(goalInput?.value) || 2000;

        const activitySelect = document.getElementById('selectActivity');
        const activityLevel = activitySelect ? activitySelect.value : 'moderate';

        if (!userName) {
          UI.showToast('Nama pengguna tidak boleh kosong!', 'warning');
          return;
        }

        if (dailyGoal < 500 || dailyGoal > 6000) {
          UI.showToast('Target air harian harus antara 500 dan 6000 ml!', 'warning');
          return;
        }

        Storage.saveSettings({
          userName,
          gender,
          dailyGoal,
          activityLevel
        });

        UI.updateUserInfo();
        UI.renderSettings();
        if (inlineNameEditor) inlineNameEditor.classList.add('hidden');
        UI.showToast('Profil dan target berhasil disimpan! ✨', 'success');
      });
    }

    // 2. Appearance: Theme Picker
    const themeCards = document.querySelectorAll('#themePicker .theme-card');
    themeCards.forEach(card => {
      card.addEventListener('click', () => {
        const selectedTheme = card.dataset.themeValue;
        if (!selectedTheme) return;

        Storage.saveSettings({ theme: selectedTheme });
        UI.applyTheme(selectedTheme);
        UI.updateThemePickerUI(selectedTheme);

        const themeLabels = {
          system: 'Sistem (Mengikuti Perangkat)',
          light: 'Terang (Mode Terang)',
          dark: 'Gelap (Mode Gelap)'
        };
        UI.showToast(`Tema ${themeLabels[selectedTheme] || selectedTheme} diterapkan!`, 'info');
      });
    });

    // 3. Data Management: Export CSV
    const btnExportCSV = document.getElementById('btnExportCSV');
    if (btnExportCSV) {
      btnExportCSV.addEventListener('click', () => {
        const logs = Storage.getAllLogs();
        if (logs.length === 0) {
          UI.showToast('Belum ada riwayat konsumsi untuk diekspor!', 'warning');
          return;
        }
        Storage.exportLogsToCSV();
        UI.showToast('Laporan CSV lengkap berhasil diunduh! 📄', 'success');
      });
    }

    // 4. Data Management: Delete entries before date
    const btnDeleteBeforeDate = document.getElementById('btnDeleteBeforeDate');
    const inputDeleteBeforeDate = document.getElementById('inputDeleteBeforeDate');
    if (btnDeleteBeforeDate && inputDeleteBeforeDate) {
      btnDeleteBeforeDate.addEventListener('click', () => {
        const cutoffDate = inputDeleteBeforeDate.value;
        if (!cutoffDate) {
          UI.showToast('Silakan pilih batas tanggal terlebih dahulu!', 'warning');
          return;
        }

        UI.showModal(
          'Hapus Riwayat Sebelum Tanggal',
          `Apakah Anda yakin ingin menghapus seluruh catatan minum sebelum tanggal <strong>${cutoffDate}</strong>?<br><span class="text-muted small">Catatan pada atau setelah tanggal tersebut akan tetap tersimpan.</span>`,
          'Hapus Entri',
          () => {
            const deletedCount = Storage.deleteLogsBeforeDate(cutoffDate);
            UI.renderSettings();
            if (deletedCount > 0) {
              UI.showToast(`Berhasil menghapus ${deletedCount} entri riwayat lama.`, 'success');
            } else {
              UI.showToast('Tidak ada entri sebelum tanggal tersebut.', 'info');
            }
          }
        );
      });
    }

    // 5. Data Management: Delete local data only
    const btnDeleteLocalOnly = document.getElementById('btnDeleteLocalOnly');
    if (btnDeleteLocalOnly) {
      btnDeleteLocalOnly.addEventListener('click', () => {
        UI.showModal(
          'Hapus Data Lokal',
          'Apakah Anda yakin ingin menghapus seluruh riwayat entri konsumsi air pada perangkat ini?<br><span class="text-muted small">Profil dan target air Anda tidak akan terhapus.</span>',
          'Hapus Riwayat Lokal',
          () => {
            Storage.deleteLocalLogsOnly();
            UI.renderSettings();
            UI.showToast('Seluruh riwayat catatan lokal berhasil dihapus!', 'success');
          }
        );
      });
    }

    // 6. Data Management: Delete everything
    const btnResetAll = document.getElementById('btnDeleteEverything');
    if (btnResetAll) {
      btnResetAll.addEventListener('click', () => {
        UI.showModal(
          'Reset Semua Data (Pabrik)',
          '<strong class="text-danger">Peringatan:</strong> Seluruh riwayat catatan minum, profil, target air, dan wadah kustom Anda akan dihapus secara permanen dari browser ini.',
          'Reset Total',
          () => {
            Storage.resetAllData();
            localStorage.setItem('hydrotrack_onboarding_needed', 'true');
            UI.showToast('Aplikasi berhasil direset. Mengalihkan ke pendaftaran...', 'info');
            setTimeout(() => {
              window.location.href = 'welcome.html';
            }, 600);
          }
        );
      });
    }
  }

  /* ==================== PREVENT PAGE HORIZONTAL SHIFT & MOBILE ZOOM ==================== */

  // Keep page horizontal scroll locked at 0 so only inner containers scroll
  window.addEventListener('scroll', () => {
    if (window.scrollX !== 0) {
      window.scrollTo(0, window.scrollY);
    }
  }, { passive: true });

  // Lock pinch-to-zoom & double-tap zoom on mobile so header & layout never shift
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });

  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

});

