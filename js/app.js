/* ============================================
   APP.JS — Main Initialization & Event Listeners
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ==================== INITIALIZATION ==================== */

  // Display date & user info
  UI.updateDateDisplay();
  UI.updateUserInfo();

  // Render dashboard if on dashboard page
  if (document.getElementById('metricTodayIntake')) {
    UI.refreshDashboard();
  }

  // Render history if on history page
  if (document.getElementById('historyTableBody')) {
    refreshHistory();

    // Check URL parameters for direct edit or search
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    const searchParam = urlParams.get('search');

    if (searchParam && historySearch) {
      historySearch.value = searchParam;
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

  /* ==================== NAVIGATION ==================== */

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
    const search = document.getElementById('historySearch')?.value || '';
    const dateRange = document.getElementById('filterDateRange')?.value || '7days';
    const drinkType = document.getElementById('filterDrinkType')?.value || 'all';

    const filteredLogs = Storage.getFilteredLogs({ search, dateRange, drinkType });
    UI.renderHistoryTable(filteredLogs);
  }

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

  /* ==================== HISTORY TABLE ACTIONS (Edit & Delete) ==================== */

  const historyTableBody = document.getElementById('historyTableBody');
  if (historyTableBody) {
    historyTableBody.addEventListener('click', (e) => {
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
    });
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

  /* ==================== QUICK LOG BUTTONS ==================== */

  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const amount = parseInt(btn.dataset.amount);
      if (!amount || amount <= 0) return;

      Storage.addLog(amount, 'water');
      UI.refreshDashboard();
      UI.showToast(`${amount} ml air berhasil dicatat! 💧`, 'success');

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
  });

  /* ==================== DRINK LOG — DELETE & EDIT (Event Delegation) ==================== */

  const drinkLogList = document.getElementById('drinkLogList');
  if (drinkLogList) {
    drinkLogList.addEventListener('click', (e) => {
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
            UI.refreshDashboard();
            refreshHistory();
            UI.showToast('Catatan berhasil dihapus.', 'warning');
          }
        );
      }

      if (editBtn) {
        const logId = editBtn.dataset.id;
        const log = Storage.getLogById(logId);
        if (!log) return;

        if (document.getElementById('historyFormCard')) {
          UI.switchView('history');
          refreshHistory();
          UI.openHistoryForm(log);
        } else {
          window.location.href = `riwayat.html?edit=${encodeURIComponent(logId)}`;
        }
      }
    });
  }

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

  /* ==================== KEYBOARD SHORTCUTS ==================== */

  document.addEventListener('keydown', (e) => {
    // ESC to close modal
    if (e.key === 'Escape') {
      UI.hideModal();
      UI.closeMobileSidebar();
    }
  });

});

