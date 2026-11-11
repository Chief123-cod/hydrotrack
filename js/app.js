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

  /* ==================== BEVERAGE TABS & QUICK LOG BUTTONS ==================== */

  let activeBeverageType = 'water';

  const beverageTabs = document.querySelectorAll('.beverage-tab');
  beverageTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      beverageTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeBeverageType = tab.dataset.type || 'water';
    });
  });

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

      Storage.addLog(amount, drinkType);
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
    if (containerModalTitle) containerModalTitle.textContent = 'Add Container';
    if (btnSubmitContainer) btnSubmitContainer.textContent = 'Add Container';
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
    if (containerModalTitle) containerModalTitle.textContent = 'Edit Container';
    if (btnSubmitContainer) btnSubmitContainer.textContent = 'Save';
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
      const containerName = item ? item.name : 'Container';

      Storage.deleteCustomContainer(editingContainerId);
      renderAllContainers();

      if (containerModal) containerModal.classList.remove('active');
      editingContainerId = null;

      UI.showToast(`Container "${containerName}" berhasil dihapus! 🗑️`, 'info');
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
        UI.showToast(`Container "${name}" (${vol} ml) berhasil diperbarui! ✨`, 'success');
      } else {
        // MODE ADD: Create new container (appends to the right, shifting Add button sideways)
        Storage.addCustomContainer(name, vol, selectedIconClass);
        renderAllContainers();

        containerModal.classList.remove('active');
        UI.showToast(`Container "${name}" (${vol} ml) berhasil ditambahkan! 🎉`, 'success');

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

  /* ==================== PREVENT PAGE HORIZONTAL SHIFT ==================== */

  // Keep page horizontal scroll locked at 0 so only inner containers scroll
  window.addEventListener('scroll', () => {
    if (window.scrollX !== 0) {
      window.scrollTo(0, window.scrollY);
    }
  }, { passive: true });

});

