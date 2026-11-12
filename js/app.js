/* ============================================
   APP.JS — Main Initialization & Event Listeners
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ==================== INITIALIZATION ==================== */

  // Display date & user info
  UI.updateDateDisplay();
  UI.updateUserInfo();

  // Render dashboard if on dashboard page (index.html)
  if (document.getElementById('drinkLogList') || document.getElementById('progressBarFill')) {
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

  // Bottom navigation links: jika tab sudah aktif di halaman saat ini, cegah reload dan scroll halus ke atas
  document.querySelectorAll('.bottom-nav__item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (item.classList.contains('active')) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (editLogModalTitle) editLogModalTitle.textContent = 'Edit Water Entry';

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
        customOpt.textContent = `Custom (${log.amount} ml)`;
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
    const drinkLabel = Storage.DRINK_TYPES[log.type]?.label || 'Water';
    const containerName = matched ? matched.name : drinkLabel;
    const amountStr = log.amount >= 1000 ? `${log.amount / 1000} L` : `${log.amount} ml`;

    if (deleteLogModalTitle) deleteLogModalTitle.textContent = 'Edit Water Entry';
    if (deleteLogModalDesc) {
      deleteLogModalDesc.textContent = `Are you sure you want to delete this ${containerName} ${amountStr} entry?`;
    }

    deleteLogModalOverlay.classList.add('active');
  }

  // Confirm delete button handler
  if (btnConfirmDeleteLog) {
    btnConfirmDeleteLog.addEventListener('click', () => {
      if (!pendingDeleteLogId) return;
      Storage.deleteLog(pendingDeleteLogId);
      UI.refreshDashboard();
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

  // Event delegation on drinkLogList
  const drinkLogList = document.getElementById('drinkLogList');
  if (drinkLogList) {
    drinkLogList.addEventListener('click', (e) => {
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
          // Open popup directly on Home without navigating away!
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

  /* ==================== PREVENT PAGE HORIZONTAL SHIFT ==================== */

  // Keep page horizontal scroll locked at 0 so only inner containers scroll
  window.addEventListener('scroll', () => {
    if (window.scrollX !== 0) {
      window.scrollTo(0, window.scrollY);
    }
  }, { passive: true });

});

