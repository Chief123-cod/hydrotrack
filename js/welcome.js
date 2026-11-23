/* ============================================
   WELCOME.JS — Onboarding & Profile Setup Logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  const DRAFT_STORAGE_KEY = 'hydrotrack_welcome_draft';

  // State object to hold user onboarding choices
  const onboardingData = {
    gender: 'male',
    ageGroup: '31-50',
    activityLevel: 'moderate',
    wakeTime: '07:00',
    sleepTime: '23:00',
    userName: '',
    profilePhoto: '',
    calculatedGoalMl: 3000,
    calculatedGoalLiters: '3 L',
    reminderIntervalMin: 96
  };

  let currentStep = 1;
  const TOTAL_FORM_STEPS = 6; // Steps 2 through 7

  function saveDraftState() {
    try {
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        step: currentStep,
        data: onboardingData
      }));
    } catch (e) {
      // Ignore storage quota or private mode errors gracefully
    }
  }

  function loadDraftState() {
    try {
      const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function clearDraftState() {
    try {
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (e) {}
  }

  // DOM Elements
  const topbar = document.getElementById('welcomeTopbar');
  const btnBack = document.getElementById('btnStepBack');
  const waveTrack = document.getElementById('waveProgressTrack');
  const waveSvg = document.getElementById('waveProgressSvg');
  const waveBgPath = document.getElementById('waveBgPath');
  const waveFillPath = document.getElementById('waveFillPath');

  /* ==================== PROGRESS BAR ENGINE (Lurus -> Gelombang Sedang) ==================== */
  const waveAnimState = {
    currentRatio: 1 / TOTAL_FORM_STEPS,
    targetRatio: 1 / TOTAL_FORM_STEPS,
    currentAmp: 0, // Step awal (Step 2) selalu lurus (amplitude = 0)
    targetAmp: 0,
    rafId: null
  };

  function drawWaveProgress(ratio, amp) {
    if (!waveTrack || !waveSvg || !waveBgPath || !waveFillPath) return;
    const width = waveTrack.clientWidth || 300;
    const height = 18;
    const cy = height / 2;
    const pad = 3;
    const xStart = pad;
    const xMax = Math.max(pad + 10, width - pad);
    const usableWidth = xMax - xStart;
    const xEnd = xStart + usableWidth * Math.max(0.02, Math.min(1, ratio));

    waveSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // 1. Garis aktif (lurus jika amp hampir 0, bergelombang sedang jika amp > 0)
    if (amp < 0.05) {
      waveFillPath.setAttribute('d', `M ${xStart.toFixed(2)},${cy} L ${xEnd.toFixed(2)},${cy}`);
    } else {
      const wavelength = 30; // Panjang gelombang sedang & rapi
      const stepPx = 2;
      let d = '';
      for (let x = xStart; x <= xEnd; x += stepPx) {
        const y = cy + Math.sin(((x - xStart) / wavelength) * Math.PI * 2) * amp;
        d += (x === xStart ? `M ${x.toFixed(2)},${y.toFixed(2)}` : ` L ${x.toFixed(2)},${y.toFixed(2)}`);
      }
      // Pastikan ujung kanan tepat berhenti di xEnd agar rounded cap rapi
      const endY = cy + Math.sin(((xEnd - xStart) / wavelength) * Math.PI * 2) * amp;
      d += ` L ${xEnd.toFixed(2)},${endY.toFixed(2)}`;
      waveFillPath.setAttribute('d', d);
    }

    // 2. Garis sisa di sebelah kanan (selalu lurus rapi dengan jarak gap 10px)
    const gap = 10;
    const bgStart = xEnd + gap;
    if (bgStart < xMax - 2) {
      waveBgPath.setAttribute('d', `M ${bgStart.toFixed(2)},${cy} L ${xMax.toFixed(2)},${cy}`);
    } else {
      waveBgPath.setAttribute('d', '');
    }
  }

  function animateWaveProgress(targetRatio, targetAmp, instant = false) {
    waveAnimState.targetRatio = targetRatio;
    waveAnimState.targetAmp = targetAmp;

    if (waveAnimState.rafId) {
      cancelAnimationFrame(waveAnimState.rafId);
      waveAnimState.rafId = null;
    }

    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (instant || prefersReduced) {
      waveAnimState.currentRatio = targetRatio;
      waveAnimState.currentAmp = targetAmp;
      drawWaveProgress(targetRatio, targetAmp);
      return;
    }

    const startRatio = waveAnimState.currentRatio;
    const startAmp = waveAnimState.currentAmp;
    const duration = 360;
    const startTime = performance.now();

    function frame(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // Cubic ease-out
      const ease = 1 - Math.pow(1 - t, 3);

      waveAnimState.currentRatio = startRatio + (targetRatio - startRatio) * ease;
      waveAnimState.currentAmp = startAmp + (targetAmp - startAmp) * ease;
      drawWaveProgress(waveAnimState.currentRatio, waveAnimState.currentAmp);

      if (t < 1) {
        waveAnimState.rafId = requestAnimationFrame(frame);
      } else {
        waveAnimState.rafId = null;
      }
    }

    waveAnimState.rafId = requestAnimationFrame(frame);
  }

  // Redraw neatly on window resize
  window.addEventListener('resize', () => {
    if (currentStep >= 2 && currentStep <= 7) {
      drawWaveProgress(waveAnimState.currentRatio, waveAnimState.currentAmp);
    }
  });

  // Input & Visual Elements
  const inputWake = document.getElementById('inputWakeTime');
  const inputSleep = document.getElementById('inputSleepTime');
  const awakeLabel = document.getElementById('awakeDurationLabel');
  const awakeBarFill = document.getElementById('awakeBarFill');

  const inputName = document.getElementById('inputUserName');
  const inputNameBox = inputName ? inputName.closest('.welcome-input-box') : null;
  const nameErrorMsg = document.getElementById('nameErrorMsg');
  const charCounter = document.getElementById('charCountLabel');
  const avatarCircle = document.getElementById('avatarCircle');
  const avatarImagePreview = document.getElementById('avatarImagePreview');
  const avatarLetter = document.getElementById('avatarLetter');
  const btnChangeAvatar = document.getElementById('btnChangeAvatar');
  const inputAvatarPhoto = document.getElementById('inputAvatarPhoto');

  // Step 7 Review Elements
  const summaryGoalVal = document.getElementById('summaryDailyGoalVal');
  const summaryIntervalVal = document.getElementById('summaryIntervalVal');
  const summaryActivityVal = document.getElementById('summaryActivityVal');
  const tagGender = document.getElementById('tagGender');
  const tagAge = document.getElementById('tagAge');

  // Step 8 Final Elements
  const finalGoalDisplay = document.getElementById('finalDailyGoalDisplay');
  const finalPillInterval = document.getElementById('finalPillInterval');
  const finalPillActivity = document.getElementById('finalPillActivity');

  /* ==================== STEP NAVIGATION ==================== */

  function goToStep(step, options = {}) {
    if (step < 1 || step > 8) return;
    const { instant = false, save = true } = options;

    // Hide all steps
    document.querySelectorAll('.welcome-step').forEach(el => {
      el.classList.remove('active');
    });

    // Show target step
    const target = document.getElementById(`step${step}`);
    if (target) {
      target.classList.add('active');
    }

    currentStep = step;

    // Topbar & Wave Progress Visibility
    if (step >= 2 && step <= 7) {
      const wasHidden = topbar.style.display === 'none';
      topbar.style.display = 'flex';
      topbar.setAttribute('aria-hidden', 'false');

      // Calculate progress percentage for steps 2 to 7 (1 of 6 up to 6 of 6)
      const formStepIndex = step - 1; // 1 to 6
      const ratio = formStepIndex / TOTAL_FORM_STEPS;
      // Langkah pertama form (Step 2) garis lurus (amp = 0), setelah klik Next (Step 3+) bergelombang sedang (amp = 2.5)
      const targetAmp = formStepIndex === 1 ? 0 : 2.5;

      waveTrack.setAttribute('aria-valuenow', formStepIndex);
      requestAnimationFrame(() => {
        animateWaveProgress(ratio, targetAmp, instant || wasHidden);
      });
    } else {
      topbar.style.display = 'none';
      topbar.setAttribute('aria-hidden', 'true');
    }

    // When reaching Step 7 (Review Goal), recalculate metrics
    if (step === 7) {
      calculateGoals();
      updateReviewUI();
    }

    // When reaching Step 8 (Final Success), recalculate & update final card UI
    if (step === 8) {
      calculateGoals();
      updateFinalUI();
    }

    if (save) {
      saveDraftState();
    }

    // Scroll to top of container smoothly (skip smooth animation on instant restore)
    if (!instant) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /* ==================== OPTION CARD SELECTION ==================== */

  function syncOptionCardSelection(stepId, fieldName) {
    const stepEl = document.getElementById(stepId);
    if (!stepEl) return;
    const cards = stepEl.querySelectorAll('.welcome-option-card');
    cards.forEach(card => {
      const isSelected = card.getAttribute('data-value') === onboardingData[fieldName];
      card.classList.toggle('selected', isSelected);
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = isSelected;
    });
  }

  function setupOptionCardSelectors(stepId, fieldName) {
    const stepEl = document.getElementById(stepId);
    if (!stepEl) return;

    const cards = stepEl.querySelectorAll('.welcome-option-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        const val = card.getAttribute('data-value');
        onboardingData[fieldName] = val;

        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        saveDraftState();
      });
    });
  }

  setupOptionCardSelectors('step2', 'gender');
  setupOptionCardSelectors('step3', 'ageGroup');
  setupOptionCardSelectors('step4', 'activityLevel');

  /* ==================== WAKE & SLEEP DURATION ==================== */

  function updateAwakeDuration() {
    const wakeVal = inputWake.value || '07:00';
    const sleepVal = inputSleep.value || '23:00';

    onboardingData.wakeTime = wakeVal;
    onboardingData.sleepTime = sleepVal;

    const [wH, wM] = wakeVal.split(':').map(Number);
    const [sH, sM] = sleepVal.split(':').map(Number);

    let wakeMinutes = wH * 60 + wM;
    let sleepMinutes = sH * 60 + sM;

    let awakeDiffMinutes = sleepMinutes - wakeMinutes;
    if (awakeDiffMinutes <= 0) {
      // Past midnight
      awakeDiffMinutes = (1440 - wakeMinutes) + sleepMinutes;
    }

    const hours = Math.floor(awakeDiffMinutes / 60);
    const mins = awakeDiffMinutes % 60;

    awakeLabel.textContent = `Aktif selama ${hours} jam ${mins} menit`;

    // Percentage of 24h
    const awakePct = Math.min(100, Math.max(10, (awakeDiffMinutes / 1440) * 100));
    awakeBarFill.style.width = `${awakePct.toFixed(1)}%`;

    // Calculate reminder interval (awake minutes divided by 10 hydration checkpoints)
    const interval = Math.round(awakeDiffMinutes / 10);
    onboardingData.reminderIntervalMin = Math.max(45, Math.min(180, interval));
  }

  if (inputWake && inputSleep) {
    inputWake.addEventListener('change', () => {
      updateAwakeDuration();
      saveDraftState();
    });
    inputSleep.addEventListener('change', () => {
      updateAwakeDuration();
      saveDraftState();
    });
    updateAwakeDuration();
  }

  /* ==================== NAME INPUT & AVATAR PHOTO ==================== */

  function updateAvatarDisplay() {
    if (onboardingData.profilePhoto && avatarImagePreview) {
      avatarImagePreview.src = onboardingData.profilePhoto;
      avatarImagePreview.classList.remove('hidden');
      if (avatarLetter) avatarLetter.classList.add('hidden');
      if (btnChangeAvatar) {
        btnChangeAvatar.innerHTML = '<i class="ri-camera-line"></i> Ganti Foto';
      }
      return;
    }

    if (avatarImagePreview) {
      avatarImagePreview.classList.add('hidden');
    }
    if (avatarLetter) {
      avatarLetter.classList.remove('hidden');
      const val = inputName ? inputName.value.trim() : '';
      if (val) {
        avatarLetter.textContent = val.charAt(0).toUpperCase();
      } else {
        avatarLetter.innerHTML = '<i class="ri-user-3-line" aria-hidden="true"></i>';
      }
    }
  }

  function processAvatarFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result;
      if (typeof rawDataUrl !== 'string') return;

      const img = new Image();
      img.onload = () => {
        try {
          const size = 256;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            onboardingData.profilePhoto = rawDataUrl;
            updateAvatarDisplay();
            saveDraftState();
            return;
          }

          // Center-crop square so avatar never stretches
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

          onboardingData.profilePhoto = canvas.toDataURL('image/jpeg', 0.85);
          updateAvatarDisplay();
          saveDraftState();
        } catch (err) {
          console.error('Failed to compress profile photo:', err);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  }

  function openAvatarPicker() {
    if (inputAvatarPhoto) {
      inputAvatarPhoto.click();
    }
  }

  if (btnChangeAvatar) {
    btnChangeAvatar.addEventListener('click', openAvatarPicker);
  }

  if (avatarCircle) {
    avatarCircle.addEventListener('click', openAvatarPicker);
    avatarCircle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAvatarPicker();
      }
    });
  }

  if (inputAvatarPhoto) {
    inputAvatarPhoto.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        processAvatarFile(file);
      }
      // Reset so picking the same photo again triggers change
      inputAvatarPhoto.value = '';
    });
  }

  if (inputName) {
    // Ensure input always starts empty on fresh onboarding
    inputName.value = '';
    if (charCounter) {
      charCounter.textContent = '0/15 karakter';
    }
    updateAvatarDisplay();

    inputName.addEventListener('input', () => {
      const val = inputName.value.trim();
      onboardingData.userName = val;

      // Update character counter
      if (charCounter) {
        charCounter.textContent = `${inputName.value.length}/15 karakter`;
      }

      // Clear validation error while typing
      if (val) {
        inputNameBox?.classList.remove('is-error');
        nameErrorMsg?.classList.remove('visible');
      }

      // Sync avatar initial if no photo uploaded
      updateAvatarDisplay();
      saveDraftState();
    });

    inputName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnNextStep6')?.click();
      }
    });
  }

  /* ==================== GOAL CALCULATION ENGINE ==================== */

  function calculateGoals() {
    // Baseline by gender
    let baseGoal = 2500;
    if (onboardingData.gender === 'female') {
      baseGoal = 2000;
    } else if (onboardingData.gender === 'prefer-not-to-say') {
      baseGoal = 2200;
    }

    // Age adjustment
    switch (onboardingData.ageGroup) {
      case '18-30':
        baseGoal += 200;
        break;
      case '31-50':
        baseGoal += 200;
        break;
      case '51-60':
        baseGoal += 100;
        break;
      case '60+':
        baseGoal += 0;
        break;
    }

    // Activity adjustment
    switch (onboardingData.activityLevel) {
      case 'sedentary':
        baseGoal += 0;
        break;
      case 'light':
        baseGoal += 150;
        break;
      case 'moderate':
        baseGoal += 300;
        break;
      case 'active':
        baseGoal += 500;
        break;
    }

    // Round to nearest 250 ml
    const roundedGoal = Math.round(baseGoal / 250) * 250;
    onboardingData.calculatedGoalMl = roundedGoal;

    // Formatted liters
    const liters = roundedGoal / 1000;
    onboardingData.calculatedGoalLiters = Number.isInteger(liters) ? `${liters} L` : `${liters.toFixed(1)} L`;
  }

  function updateReviewUI() {
    summaryGoalVal.textContent = onboardingData.calculatedGoalLiters;
    summaryIntervalVal.textContent = `${onboardingData.reminderIntervalMin} menit`;

    // Activity Level Display
    const activityNames = {
      sedentary: 'Kurang Aktif',
      light: 'Aktivitas Ringan',
      moderate: 'Aktivitas Sedang',
      active: 'Aktif'
    };
    summaryActivityVal.textContent = activityNames[onboardingData.activityLevel] || 'Aktivitas Sedang';

    // Tags
    const genderNames = {
      male: 'Laki-laki',
      female: 'Perempuan',
      'prefer-not-to-say': 'Memilih tidak menyebutkan'
    };
    tagGender.textContent = genderNames[onboardingData.gender] || 'Laki-laki';

    const ageNames = {
      '18-30': '18–30 tahun',
      '31-50': '31–50 tahun',
      '51-60': '51–60 tahun',
      '60+': '60+ tahun'
    };
    tagAge.textContent = ageNames[onboardingData.ageGroup] || '31–50 tahun';
  }

  function updateFinalUI() {
    finalDailyGoalDisplay.textContent = onboardingData.calculatedGoalLiters;
    finalPillInterval.textContent = `${onboardingData.reminderIntervalMin} mnt`;

    const activityNames = {
      sedentary: 'Kurang Aktif',
      light: 'Aktivitas Ringan',
      moderate: 'Aktivitas Sedang',
      active: 'Aktif'
    };
    finalPillActivity.textContent = activityNames[onboardingData.activityLevel] || 'Aktivitas Sedang';
  }

  /* ==================== BUTTON EVENT LISTENERS ==================== */

  // Step 1: Get Started
  document.getElementById('btnGetStarted')?.addEventListener('click', () => {
    goToStep(2);
  });

  // Step 2: Gender Next
  document.getElementById('btnNextStep2')?.addEventListener('click', () => {
    goToStep(3);
  });

  // Step 3: Age Next
  document.getElementById('btnNextStep3')?.addEventListener('click', () => {
    goToStep(4);
  });

  // Step 4: Activity Next
  document.getElementById('btnNextStep4')?.addEventListener('click', () => {
    goToStep(5);
  });

  // Step 5: Wake/Sleep Next
  document.getElementById('btnNextStep5')?.addEventListener('click', () => {
    goToStep(6);
  });

  // Step 6: Profile Name Next
  document.getElementById('btnNextStep6')?.addEventListener('click', () => {
    const nameVal = inputName.value.trim();
    if (!nameVal) {
      inputNameBox?.classList.add('is-error');
      nameErrorMsg?.classList.add('visible');
      inputName.focus();
      return;
    }
    inputNameBox?.classList.remove('is-error');
    nameErrorMsg?.classList.remove('visible');
    onboardingData.userName = nameVal;
    goToStep(7);
  });

  // Step 7: Finish Review
  document.getElementById('btnFinishSetup')?.addEventListener('click', () => {
    goToStep(8);
  });

  // Back Button
  btnBack?.addEventListener('click', () => {
    if (currentStep > 1) {
      goToStep(currentStep - 1);
    }
  });

  // Step 8: Start Hydrating (Saves to LocalStorage and redirects to index.html)
  document.getElementById('btnStartHydrating')?.addEventListener('click', () => {
    try {
      // Save full profile and hydration settings to localStorage
      const settingsPayload = {
        userName: onboardingData.userName || 'Pengguna',
        profilePhoto: onboardingData.profilePhoto || '',
        dailyGoal: onboardingData.calculatedGoalMl || 2000,
        gender: onboardingData.gender || 'male',
        ageGroup: onboardingData.ageGroup || '31-50',
        activityLevel: onboardingData.activityLevel || 'moderate',
        wakeTime: onboardingData.wakeTime || '07:00',
        sleepTime: onboardingData.sleepTime || '23:00',
        reminderInterval: onboardingData.reminderIntervalMin || 90,
        theme: 'dark', // Keep dark theme as set in onboarding
        enableSound: true,
        hasCompletedOnboarding: true
      };

      if (typeof Storage !== 'undefined' && Storage.saveSettings) {
        Storage.saveSettings(settingsPayload);
      } else {
        localStorage.setItem('hydrotrack_settings', JSON.stringify(settingsPayload));
      }

      // Clear any flags & temporary onboarding draft
      localStorage.removeItem('hydrotrack_onboarding_needed');
      clearDraftState();

      // Initialize empty logs if none exist
      if (!localStorage.getItem('hydrotrack_logs')) {
        localStorage.setItem('hydrotrack_logs', JSON.stringify([]));
      }

      // Smooth redirection to main dashboard
      window.location.href = 'index.html';
    } catch (e) {
      console.error('Error saving onboarding data:', e);
      window.location.href = 'index.html';
    }
  });

  /* ==================== RESTORE LAST STEP ON REFRESH ==================== */
  const savedDraft = loadDraftState();
  if (savedDraft) {
    if (savedDraft.data && typeof savedDraft.data === 'object') {
      Object.assign(onboardingData, savedDraft.data);
    }

    // Restore option cards (Steps 2 - 4)
    syncOptionCardSelection('step2', 'gender');
    syncOptionCardSelection('step3', 'ageGroup');
    syncOptionCardSelection('step4', 'activityLevel');

    // Restore wake & sleep inputs (Step 5)
    if (inputWake && onboardingData.wakeTime) inputWake.value = onboardingData.wakeTime;
    if (inputSleep && onboardingData.sleepTime) inputSleep.value = onboardingData.sleepTime;
    if (inputWake && inputSleep) updateAwakeDuration();

    // Restore name & profile photo (Step 6)
    if (inputName) {
      const restoredName = typeof onboardingData.userName === 'string' ? onboardingData.userName : '';
      inputName.value = restoredName;
      if (charCounter) {
        charCounter.textContent = `${restoredName.length}/15 karakter`;
      }
      updateAvatarDisplay();
    }

    // Stay on the exact step the user was on before refreshing
    const restoredStep = parseInt(savedDraft.step, 10);
    if (restoredStep >= 1 && restoredStep <= 8) {
      goToStep(restoredStep, { instant: true, save: false });
    }
  }
  // Lepas atribut pre-paint agar transisi tombol Lanjut & panah kembali berjalan normal
  document.documentElement.removeAttribute('data-welcome-step');

});
