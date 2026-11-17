/* ============================================
   WELCOME.JS — Onboarding & Profile Setup Logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // State object to hold user onboarding choices
  const onboardingData = {
    gender: 'male',
    ageGroup: '31-50',
    activityLevel: 'moderate',
    wakeTime: '07:00',
    sleepTime: '23:00',
    userName: 'Tat',
    calculatedGoalMl: 3000,
    calculatedGoalLiters: '3 L',
    reminderIntervalMin: 96
  };

  let currentStep = 1;
  const TOTAL_FORM_STEPS = 6; // Steps 2 through 7

  // DOM Elements
  const topbar = document.getElementById('welcomeTopbar');
  const btnBack = document.getElementById('btnStepBack');
  const waveFill = document.getElementById('waveFillWrapper');
  const waveTrack = document.getElementById('waveProgressTrack');

  // Input & Visual Elements
  const inputWake = document.getElementById('inputWakeTime');
  const inputSleep = document.getElementById('inputSleepTime');
  const awakeLabel = document.getElementById('awakeDurationLabel');
  const awakeBarFill = document.getElementById('awakeBarFill');

  const inputName = document.getElementById('inputUserName');
  const charCounter = document.getElementById('charCountLabel');
  const avatarLetter = document.getElementById('avatarLetter');

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

  function goToStep(step) {
    if (step < 1 || step > 8) return;

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
      topbar.style.display = 'flex';
      topbar.setAttribute('aria-hidden', 'false');

      // Calculate progress percentage for steps 2 to 7 (1 of 6 up to 6 of 6)
      const formStepIndex = step - 1; // 1 to 6
      const pct = (formStepIndex / TOTAL_FORM_STEPS) * 100;
      waveFill.style.width = `${pct}%`;
      waveTrack.setAttribute('aria-valuenow', formStepIndex);
    } else {
      topbar.style.display = 'none';
      topbar.setAttribute('aria-hidden', 'true');
    }

    // When reaching Step 7 (Review Goal), recalculate metrics
    if (step === 7) {
      calculateGoals();
      updateReviewUI();
    }

    // When reaching Step 8 (Final Success), update final card UI
    if (step === 8) {
      updateFinalUI();
    }

    // Scroll to top of container smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ==================== OPTION CARD SELECTION ==================== */

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

    awakeLabel.textContent = `Awake for ${hours}h ${mins}m`;

    // Percentage of 24h
    const awakePct = Math.min(100, Math.max(10, (awakeDiffMinutes / 1440) * 100));
    awakeBarFill.style.width = `${awakePct.toFixed(1)}%`;

    // Calculate reminder interval (awake minutes divided by 10 hydration checkpoints)
    const interval = Math.round(awakeDiffMinutes / 10);
    onboardingData.reminderIntervalMin = Math.max(45, Math.min(180, interval));
  }

  if (inputWake && inputSleep) {
    inputWake.addEventListener('change', updateAwakeDuration);
    inputSleep.addEventListener('change', updateAwakeDuration);
    updateAwakeDuration();
  }

  /* ==================== NAME INPUT & AVATAR INITIAL ==================== */

  if (inputName) {
    inputName.addEventListener('input', () => {
      const val = inputName.value.trim();
      onboardingData.userName = val || 'User';

      // Update character counter
      if (charCounter) {
        charCounter.textContent = `${inputName.value.length}/15 characters`;
      }

      // Update avatar letter
      if (avatarLetter) {
        avatarLetter.textContent = val ? val.charAt(0).toUpperCase() : 'U';
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
    summaryIntervalVal.textContent = `${onboardingData.reminderIntervalMin} minutes`;

    // Activity Level Display
    const activityNames = {
      sedentary: 'Sedentary',
      light: 'Light Activity',
      moderate: 'Moderate Activity',
      active: 'Active'
    };
    summaryActivityVal.textContent = activityNames[onboardingData.activityLevel] || 'Moderate Activity';

    // Tags
    const genderNames = {
      male: 'Male',
      female: 'Female',
      'prefer-not-to-say': 'Prefer not to say'
    };
    tagGender.textContent = genderNames[onboardingData.gender] || 'Male';

    const ageNames = {
      '18-30': '18–30 years',
      '31-50': '31–50 years',
      '51-60': '51–60 years',
      '60+': '60+ years'
    };
    tagAge.textContent = ageNames[onboardingData.ageGroup] || '31–50 years';
  }

  function updateFinalUI() {
    finalDailyGoalDisplay.textContent = onboardingData.calculatedGoalLiters;
    finalPillInterval.textContent = `${onboardingData.reminderIntervalMin} min`;

    const activityNames = {
      sedentary: 'Sedentary',
      light: 'Light Activity',
      moderate: 'Moderate Activity',
      active: 'Active'
    };
    finalPillActivity.textContent = activityNames[onboardingData.activityLevel] || 'Moderate Activity';
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
      inputName.focus();
      return;
    }
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
        userName: onboardingData.userName || 'Faith',
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

      // Clear any flags
      localStorage.removeItem('hydrotrack_onboarding_needed');

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

});
