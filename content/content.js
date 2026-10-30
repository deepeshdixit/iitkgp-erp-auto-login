/**
 * IIT KGP ERP Auto-Login - Content Script
 * Executes on erp.iitkgp.ac.in to prompt for the 4-digit PIN,
 * decrypt credentials, dynamically match the security question, request OTP, and focus OTP input.
 * Built with strict concurrency locking to ensure autofill & OTP request only run once.
 */

(function () {
  if (window.__KGP_ERP_AUTOLOGIN_INJECTED__) return;
  window.__KGP_ERP_AUTOLOGIN_INJECTED__ = true;

  console.log('[KGP-ERP-AutoLogin] Content script active on:', window.location.href);

  // Global execution locks to prevent duplicate triggers
  let isUnlocking = false;
  let hasCompletedFill = false;

  /**
   * Dispatches input, change, and blur events
   */
  function triggerEvents(element) {
    if (!element) return;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /**
   * Scans visible text elements on the login page to detect which of the user's
   * 3 registered security questions is currently displayed.
   */
  function detectQuestionOnPage(qaList) {
    if (!qaList || qaList.length === 0) return null;

    const formOrCard = document.querySelector('form') || document.body;
    const elements = Array.from(formOrCard.querySelectorAll('label, p, span, div, h1, h2, h3, h4, h5, h6, th, td'));

    let bestItem = null;
    let bestScore = 0;
    let bestMatchedText = '';

    for (const el of elements) {
      if (el.children && el.children.length > 2) continue;

      const txt = (el.innerText || el.textContent || '').trim();
      if (!txt || txt.length < 4 || txt.length > 150) continue;

      const lower = txt.toLowerCase().trim();

      // Skip common non-question UI labels
      if (
        lower === 'user id' ||
        lower === 'password' ||
        lower === 'erp system' ||
        lower.includes('one time password') ||
        lower === 'enter otp' ||
        lower === 'get otp' ||
        lower === 'log in' ||
        lower.includes('forgot password') ||
        lower.includes('students & info') ||
        lower.includes('quick access') ||
        lower === 'security question'
      ) {
        continue;
      }

      for (const item of qaList) {
        const qLower = item.question.toLowerCase().trim();

        // 1. Direct substring match (e.g., "name of favorite place")
        if (lower.includes(qLower) || qLower.includes(lower)) {
          return { item, score: 1.0, matchedText: txt };
        }

        // 2. Tokenized word overlap
        const tWords = new Set(lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1));
        const qWords = new Set(qLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1));

        let common = 0;
        for (const w of qWords) {
          if (tWords.has(w)) common++;
        }

        const score = common / Math.max(tWords.size, qWords.size);
        if (score > bestScore) {
          bestScore = score;
          bestItem = item;
          bestMatchedText = txt;
        }
      }
    }

    if (bestScore >= 0.5) {
      return { item: bestItem, score: bestScore, matchedText: bestMatchedText };
    }

    return null;
  }

  /**
   * Element Finders
   */
  function findUserIdInput() {
    return document.getElementById('user_id') ||
      document.querySelector('input[name="user_id"]') ||
      document.getElementById('rollno') ||
      document.querySelector('input[name="rollno"]') ||
      document.querySelector('input[name="roll_no"]') ||
      document.querySelector('input[id*="user" i]') ||
      document.querySelector('input[name*="user" i]') ||
      document.querySelector('input[placeholder*="roll" i]') ||
      document.querySelector('input[placeholder*="user" i]') ||
      document.querySelector('input[type="text"]');
  }

  function findPasswordInput() {
    return document.getElementById('password') ||
      document.querySelector('input[name="password"]') ||
      document.querySelector('input[type="password"]');
  }

  function findAnswerInput() {
    const direct = document.getElementById('answer') ||
      document.querySelector('input[name="answer"]') ||
      document.getElementById('sec_ans') ||
      document.querySelector('input[name="sec_ans"]') ||
      document.querySelector('input[id*="ans" i]') ||
      document.querySelector('input[name*="ans" i]');
    if (direct) return direct;

    const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="checkbox"])'));
    const passIdx = allInputs.findIndex(i => i.type === 'password' || (i.id && i.id.includes('pass')) || (i.name && i.name.includes('pass')));
    if (passIdx !== -1 && allInputs[passIdx + 1]) {
      return allInputs[passIdx + 1];
    }

    return null;
  }

  function findGetOtpButton() {
    const directBtn = document.getElementById('getotp') ||
      document.getElementById('get_otp') ||
      document.querySelector('[id*="otp_btn" i]');
    if (directBtn) return directBtn;

    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
    return buttons.find(b => {
      const txt = (b.innerText || b.value || '').trim();
      return /get\s*otp|send\s*otp|generate\s*otp/i.test(txt);
    });
  }

  function findOtpInput() {
    return document.getElementById('email_otp') ||
      document.getElementById('otp') ||
      document.querySelector('input[name*="otp" i]') ||
      document.querySelector('input[placeholder*="otp" i]') ||
      document.querySelector('input[id*="otp" i]');
  }

  /**
   * Polls until login inputs exist
   */
  function waitForLoginInputs(maxWaitMs = 6000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const u = findUserIdInput();
        const p = findPasswordInput();
        if (u || p) return resolve({ userInput: u, passInput: p });
        if (Date.now() - start >= maxWaitMs) {
          return resolve({ userInput: findUserIdInput(), passInput: findPasswordInput() });
        }
        setTimeout(check, 200);
      };
      check();
    });
  }

  /**
   * Waits until ERP's AJAX loads one of the user's registered questions into the DOM.
   */
  function waitForQuestionMatch(qaList, timeoutMs = 6000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const check = () => {
        const match = detectQuestionOnPage(qaList);
        if (match) {
          return resolve(match);
        }
        if (Date.now() - startTime >= timeoutMs) {
          return resolve(null);
        }
        setTimeout(check, 200);
      };
      check();
    });
  }

  /**
   * Performs the credential autofill and requests OTP exactly ONCE
   */
  async function performAutoFill(creds, updateStatus) {
    const { userInput, passInput } = await waitForLoginInputs(3000);

    if (!userInput || !passInput) {
      if (updateStatus) updateStatus('Login fields not found.', 'error');
      return;
    }

    if (updateStatus) updateStatus('Filling Roll No & Password...', 'info');

    // 1. Fill Roll Number
    userInput.value = creds.rollNumber;
    triggerEvents(userInput);

    // 2. Fill Password
    passInput.value = creds.password;
    triggerEvents(passInput);

    // Trigger blur/change/Tab so ERP initiates AJAX request for the question
    userInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    userInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', bubbles: true }));

    // 3. Wait for ERP to load the dynamic question
    if (updateStatus) updateStatus('Waiting for security question...', 'info');

    const matched = await waitForQuestionMatch(creds.securityQA, 6000);
    const answerInput = findAnswerInput();

    if (matched && matched.item && answerInput) {
      answerInput.value = matched.item.answer;
      triggerEvents(answerInput);
      console.log('[KGP-ERP-AutoLogin] Matched question:', matched.matchedText, '-> Answer filled:', matched.item.answer);
      if (updateStatus) updateStatus(`Matched: "${matched.item.question}"`, 'info');
    } else if (!matched) {
      console.warn('[KGP-ERP-AutoLogin] Could not match question on page against stored Q&As.');
      if (updateStatus) updateStatus('Question not identified. Enter answer manually.', 'error');
    }

    // 4. Trigger "Get OTP" exactly once
    await new Promise(r => setTimeout(r, 450));
    const otpBtn = findGetOtpButton();
    if (otpBtn) {
      otpBtn.click();
      if (updateStatus) updateStatus('OTP requested! Check email.', 'success');
    } else {
      if (updateStatus) updateStatus('Filled! Click "Get OTP".', 'info');
    }

    // 5. Focus the OTP input field for manual entry
    await new Promise(r => setTimeout(r, 400));
    const otpInput = findOtpInput();
    if (otpInput) {
      otpInput.focus();
    }
  }

  /**
   * Renders the in-page PIN prompt widget.
   */
  function renderPromptWidget(encryptedCreds) {
    // Only render once per page load
    if (document.getElementById('kgp-erp-autologin-widget') || hasCompletedFill) return;

    const widget = document.createElement('div');
    widget.id = 'kgp-erp-autologin-widget';

    if (!encryptedCreds) {
      widget.innerHTML = `
        <div class="kgp-widget-header">
          <div class="kgp-widget-title">
            <span>🔐</span>
            <span>ERP Auto-Login</span>
          </div>
          <button class="kgp-widget-close" id="kgp-widget-close" title="Dismiss">×</button>
        </div>
        <div class="kgp-widget-body">
          <p class="kgp-widget-text">Extension installed! Configure your credentials once to enable 1-click autofill.</p>
          <button id="kgp-btn-open-setup" class="kgp-btn-fill">Open Setup</button>
        </div>
      `;
    } else {
      widget.innerHTML = `
        <div class="kgp-widget-header">
          <div class="kgp-widget-title">
            <span>🔐</span>
            <span>ERP Auto-Login</span>
          </div>
          <button class="kgp-widget-close" id="kgp-widget-close" title="Dismiss">×</button>
        </div>
        <div class="kgp-widget-body">
          <p class="kgp-widget-text">Enter your 4-digit PIN to autofill and request OTP:</p>
          <div class="kgp-pin-row">
            <input type="password" id="kgp-widget-pin" class="kgp-pin-input" maxlength="4" placeholder="••••" inputmode="numeric" autofocus autocomplete="off">
            <button id="kgp-widget-btn" class="kgp-btn-fill">Unlock & Fill</button>
          </div>
          <div id="kgp-widget-status" class="kgp-status-box info hidden"></div>
        </div>
      `;
    }

    (document.body || document.documentElement).appendChild(widget);

    const closeBtn = document.getElementById('kgp-widget-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        widget.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        widget.style.opacity = '0';
        widget.style.transform = 'translateY(-10px)';
        setTimeout(() => widget.remove(), 250);
      });
    }

    const openSetupBtn = document.getElementById('kgp-btn-open-setup');
    if (openSetupBtn) {
      openSetupBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openOptions' });
      });
    }

    const pinInput = document.getElementById('kgp-widget-pin');
    const fillBtn = document.getElementById('kgp-widget-btn');
    const statusBox = document.getElementById('kgp-widget-status');

    if (!pinInput || !fillBtn) return;

    function updateStatus(msg, type = 'info') {
      if (!statusBox) return;
      statusBox.textContent = msg;
      statusBox.className = `kgp-status-box ${type}`;
      statusBox.classList.remove('hidden');
    }

    async function handleUnlock() {
      // Guard against duplicate invocations
      if (isUnlocking || hasCompletedFill) return;

      const pin = pinInput.value.trim();
      if (!/^\d{4}$/.test(pin)) {
        updateStatus('Enter a 4-digit PIN', 'error');
        return;
      }

      // Lock execution immediately
      isUnlocking = true;
      pinInput.disabled = true;
      fillBtn.disabled = true;
      fillBtn.textContent = 'Decrypting...';
      updateStatus('Decrypting credentials...', 'info');

      try {
        const decrypted = await ERP_CRYPTO.decrypt(encryptedCreds, pin);

        updateStatus('Unlocked! Filling form...', 'info');
        await performAutoFill(decrypted, updateStatus);

        hasCompletedFill = true;
        fillBtn.textContent = 'Filled!';
        updateStatus('Done! Enter OTP to log in.', 'success');

        // Dismiss and remove widget immediately after filling so it cannot capture further keys
        setTimeout(() => {
          widget.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          widget.style.opacity = '0';
          widget.style.transform = 'translateY(-14px)';
          setTimeout(() => {
            widget.remove();
          }, 300);
        }, 800);

      } catch (err) {
        console.error('[KGP-ERP-AutoLogin] Decryption error:', err);
        updateStatus('Incorrect PIN', 'error');
        pinInput.disabled = false;
        fillBtn.disabled = false;
        pinInput.value = '';
        pinInput.focus();
        fillBtn.textContent = 'Unlock & Fill';
        isUnlocking = false;
      }
    }

    fillBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleUnlock();
    });

    pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleUnlock();
      }
    });

    // Auto-trigger when 4 digits are typed, with debounce to prevent duplicate events
    pinInput.addEventListener('input', () => {
      if (pinInput.value.length === 4 && !isUnlocking && !hasCompletedFill) {
        handleUnlock();
      }
    });

    pinInput.focus();
  }

  /**
   * Main Initialization:
   * Only renders in the frame containing the actual login inputs
   */
  async function init() {
    const url = window.location.href.toLowerCase();
    const isLoginUrl = url.includes('login') || url.includes('ssoadministration') || url.includes('studentperformance');

    const { userInput, passInput } = await waitForLoginInputs(isLoginUrl ? 3000 : 800);

    // Only render the widget in the specific frame that holds the login inputs
    if (!userInput && !passInput) {
      return;
    }

    try {
      const localData = await chrome.storage.local.get(['erpEncryptedCreds']);
      const encryptedCreds = localData.erpEncryptedCreds;

      renderPromptWidget(encryptedCreds);
    } catch (err) {
      console.error('[KGP-ERP-AutoLogin] Init error:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
