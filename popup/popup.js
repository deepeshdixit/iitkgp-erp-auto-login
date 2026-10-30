/**
 * IIT KGP ERP Auto-Login - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const statusBadge = document.getElementById('status-badge');
  const alertBox = document.getElementById('alert-box');

  const viewUnlock = document.getElementById('view-unlock');
  const viewSetup = document.getElementById('view-setup');
  const setupTitle = document.getElementById('setup-title');

  const unlockPinInput = document.getElementById('unlock-pin');
  const btnUnlock = document.getElementById('btn-unlock');
  const btnShowReset = document.getElementById('btn-show-reset');

  const credsForm = document.getElementById('creds-form');
  const setupPinInput = document.getElementById('setup-pin');
  const setupPinConfirm = document.getElementById('setup-pin-confirm');
  const setupRollInput = document.getElementById('setup-roll');
  const setupPassInput = document.getElementById('setup-pass');
  const setupGmailInput = document.getElementById('setup-gmail');
  const btnTogglePass = document.getElementById('btn-toggle-pass');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const btnSave = document.getElementById('btn-save');

  const q1Input = document.getElementById('q1');
  const a1Input = document.getElementById('a1');
  const q2Input = document.getElementById('q2');
  const a2Input = document.getElementById('a2');
  const q3Input = document.getElementById('q3');
  const a3Input = document.getElementById('a3');

  const modalReset = document.getElementById('modal-reset');
  const btnConfirmReset = document.getElementById('btn-confirm-reset');
  const btnCancelReset = document.getElementById('btn-cancel-reset');

  let currentEncryptedData = null;
  let isEditMode = false;

  // Clear any existing session storage cache
  if (chrome.storage && chrome.storage.session) {
    try {
      await chrome.storage.session.clear();
    } catch (e) {
      // Ignored
    }
  }

  // Show Alert Utility
  function showAlert(message, type = 'error', duration = 3500) {
    alertBox.textContent = message;
    alertBox.className = `alert ${type}`;
    if (duration > 0) {
      setTimeout(() => {
        alertBox.className = 'alert hidden';
      }, duration);
    }
  }

  function clearAlert() {
    alertBox.className = 'alert hidden';
  }

  // Load Initial State
  async function init() {
    clearAlert();
    try {
      const localData = await chrome.storage.local.get(['erpEncryptedCreds']);
      currentEncryptedData = localData.erpEncryptedCreds;

      if (!currentEncryptedData) {
        showSetupView(false);
      } else {
        showUnlockView();
      }
    } catch (err) {
      console.warn('Init notice:', err);
      showAlert('Failed to read storage: ' + err.message, 'error');
    }
  }

  function showUnlockView() {
    isEditMode = false;
    viewUnlock.classList.remove('hidden');
    viewSetup.classList.add('hidden');
    statusBadge.textContent = 'Configured';
    statusBadge.className = 'badge configured';
    unlockPinInput.value = '';
    unlockPinInput.focus();
  }

  function showSetupView(editMode = false) {
    isEditMode = editMode;
    viewUnlock.classList.add('hidden');
    viewSetup.classList.remove('hidden');

    if (editMode) {
      setupTitle.textContent = 'Edit Credentials';
      btnSave.textContent = 'Update Credentials';
      btnCancelEdit.classList.remove('hidden');
      statusBadge.textContent = 'Editing';
      statusBadge.className = 'badge locked';
    } else {
      setupTitle.textContent = 'Setup Credentials';
      btnSave.textContent = 'Save & Encrypt';
      btnCancelEdit.classList.add('hidden');
      statusBadge.textContent = 'Setup Needed';
      statusBadge.className = 'badge unconfigured';
      credsForm.reset();
    }
  }

  // Toggle Password Visibility
  btnTogglePass.addEventListener('click', () => {
    if (setupPassInput.type === 'password') {
      setupPassInput.type = 'text';
      btnTogglePass.textContent = '🙈';
    } else {
      setupPassInput.type = 'password';
      btnTogglePass.textContent = '👁️';
    }
  });

  // Handle Unlock
  btnUnlock.addEventListener('click', async () => {
    const pin = unlockPinInput.value.trim();
    if (!/^\d{4}$/.test(pin)) {
      showAlert('Please enter a valid 4-digit PIN.', 'error');
      return;
    }

    try {
      btnUnlock.disabled = true;
      btnUnlock.textContent = 'Verifying...';

      const decrypted = await ERP_CRYPTO.decrypt(currentEncryptedData, pin);

      // Populate Edit Form
      setupPinInput.value = pin;
      setupPinConfirm.value = pin;
      setupRollInput.value = decrypted.rollNumber || '';
      setupPassInput.value = decrypted.password || '';
      setupGmailInput.value = decrypted.targetGmail || '';

      const qa = decrypted.securityQA || [];
      q1Input.value = qa[0] ? qa[0].question : '';
      a1Input.value = qa[0] ? qa[0].answer : '';
      q2Input.value = qa[1] ? qa[1].question : '';
      a2Input.value = qa[1] ? qa[1].answer : '';
      q3Input.value = qa[2] ? qa[2].question : '';
      a3Input.value = qa[2] ? qa[2].answer : '';

      showAlert('Unlocked successfully!', 'success', 2000);
      showSetupView(true);
    } catch (err) {
      showAlert('Incorrect PIN. Authentication failed.', 'error');
      unlockPinInput.value = '';
      unlockPinInput.focus();
    } finally {
      btnUnlock.disabled = false;
      btnUnlock.textContent = 'Unlock & Manage';
    }
  });

  // Auto-submit unlock on 4 digits
  unlockPinInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || unlockPinInput.value.length === 4) {
      btnUnlock.click();
    }
  });

  // Cancel Edit
  btnCancelEdit.addEventListener('click', () => {
    showUnlockView();
  });

  // Handle Save / Update Credentials Form
  credsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pin = setupPinInput.value.trim();
    const pinConfirm = setupPinConfirm.value.trim();
    const roll = setupRollInput.value.trim().toUpperCase();
    const password = setupPassInput.value;
    const gmail = setupGmailInput ? setupGmailInput.value.trim().toLowerCase() : '';

    const q1 = q1Input.value.trim();
    const a1 = a1Input.value.trim();
    const q2 = q2Input.value.trim();
    const a2 = a2Input.value.trim();
    const q3 = q3Input.value.trim();
    const a3 = a3Input.value.trim();

    if (!/^\d{4}$/.test(pin)) {
      showAlert('PIN must be exactly 4 numeric digits.', 'error');
      return;
    }

    if (pin !== pinConfirm) {
      showAlert('PIN confirmation does not match.', 'error');
      return;
    }

    if (!roll || !password) {
      showAlert('Please enter your Roll Number and Password.', 'error');
      return;
    }

    if (!q1 || !a1 || !q2 || !a2 || !q3 || !a3) {
      showAlert('Please fill in all 3 security questions and answers.', 'error');
      return;
    }

    const payload = {
      rollNumber: roll,
      password: password,
      targetGmail: gmail,
      securityQA: [
        { question: q1, answer: a1 },
        { question: q2, answer: a2 },
        { question: q3, answer: a3 }
      ]
    };

    try {
      btnSave.disabled = true;
      btnSave.textContent = 'Encrypting & Saving...';

      const encrypted = await ERP_CRYPTO.encrypt(payload, pin);
      await chrome.storage.local.set({ erpEncryptedCreds: encrypted });
      currentEncryptedData = encrypted;

      showAlert('Credentials successfully encrypted & saved!', 'success', 2500);
      unlockPinInput.value = '';
      setTimeout(() => {
        showUnlockView();
      }, 1000);
    } catch (err) {
      console.warn('Save notice:', err);
      showAlert('Failed to encrypt: ' + err.message, 'error');
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = isEditMode ? 'Update Credentials' : 'Save & Encrypt';
    }
  });

  // Reset Modal Handlers
  btnShowReset.addEventListener('click', () => {
    modalReset.classList.remove('hidden');
  });

  btnCancelReset.addEventListener('click', () => {
    modalReset.classList.add('hidden');
  });

  btnConfirmReset.addEventListener('click', async () => {
    try {
      await chrome.storage.local.remove(['erpEncryptedCreds']);
      if (chrome.storage.session) {
        await chrome.storage.session.clear();
      }
      currentEncryptedData = null;
      modalReset.classList.add('hidden');
      showAlert('All stored credentials were wiped.', 'success', 2500);
      showSetupView(false);
    } catch (err) {
      showAlert('Reset failed: ' + err.message, 'error');
    }
  });

  init();
});
