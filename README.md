# 🔐 IIT KGP ERP Auto-Login

> Fast, secure, and client-side autofill browser extension for the [IIT Kharagpur ERP portal](https://erp.iitkgp.ac.in/). Designed for Google Chrome and Brave.

---

## ⚡ Overview

Logging into the IIT KGP ERP portal every day requires multiple steps:
1. Entering your Roll Number and Password.
2. Waiting for ERP to dynamically fetch one of your 3 pre-registered security questions.
3. Answering that specific security question.
4. Clicking "Get OTP", waiting for the email code, entering the 6-digit OTP, and submitting.

This open-source extension streamlines this routine down to **one quick 4-digit PIN**:
* **Autofills** your Roll Number and Password.
* **Detects the dynamic security question** loaded by ERP and automatically fills the corresponding answer using intelligent fuzzy matching.
* **Clicks "Get OTP"** automatically so the code is dispatched to your email immediately.
* **Positions your cursor in the OTP box**, so all you need to do is paste the 6-digit code and hit Enter to log in!

---

## 🛡️ Security & Privacy First

When sharing an extension with friends and peers, security is the top priority. This project is built with zero-trust principles:

| Guarantee | Details |
| :--- | :--- |
| **Encrypted at Rest** | Credentials are encrypted using **AES-256-GCM** with keys derived via **PBKDF2 (100,000 iterations of SHA-256)** from your 4-digit master PIN. |
| **100% Local Storage** | All encrypted data lives strictly inside your browser's `chrome.storage.local`. Nothing is ever sent over the network. |
| **Zero Telemetry** | No Google Analytics, no error trackers, and no external CDNs or remote dependencies. |
| **Strict Scoping** | Only runs on `https://erp.iitkgp.ac.in/*`. It cannot inspect or interact with any other website. |
| **Manual Submission** | You retain full control over final authentication submission by manually entering the email OTP. |

---

## 🚀 Installation Guide (Chrome & Brave)

Because this is an open-source tool, you and your friends can install it directly in under 60 seconds without needing to wait for Web Store approvals:

### Step 1: Download / Clone the Repository
Clone this repository or download the source folder as a `.zip` and extract it:
```bash
git clone https://github.com/<your-username>/iitkgp-erp-auto-login.git
```

### Step 2: Open Extensions in Your Browser
* **Google Chrome**: Navigate to `chrome://extensions` in your address bar.
* **Brave Browser**: Navigate to `brave://extensions` in your address bar.

### Step 3: Enable Developer Mode
Toggle the **Developer mode** switch in the top-right corner of the page.

### Step 4: Load the Extension
1. Click the **Load unpacked** button in the top-left corner.
2. Select the `erp-autologin` folder (the folder containing `manifest.json`).
3. The **IIT KGP ERP Auto-Login** extension will appear in your extensions list! Pin it to your toolbar for easy access.

---

## ⚙️ Initial Setup

1. Click on the extension icon in your browser toolbar.
2. You will see the **Setup Credentials** screen:
   * **4-Digit Master PIN**: Choose a memorable 4-digit PIN (used to encrypt/decrypt your credentials).
   * **Roll Number**: Enter your institute Roll Number (e.g., `21CS10001`).
   * **Password**: Enter your ERP login password.
   * **Security Questions & Answers**: Enter each of your 3 registered ERP security questions and their answers.
3. Click **Save & Encrypt**. Your credentials are now encrypted and stored locally.

---

## 🔄 Daily Workflow

1. Navigate to `https://erp.iitkgp.ac.in/`.
2. A subtle floating prompt will appear at the top-right:
   ```text
   🔐 ERP Auto-Login
   Enter your 4-digit PIN: [ •••• ]  [ Unlock & Fill ]
   ```
3. Type your 4-digit PIN and press **Enter**:
   * Roll Number and Password are filled.
   * Security Question is matched and answered automatically.
   * "Get OTP" is triggered automatically.
   * The cursor focuses directly into the OTP field.
4. Check your phone / Zimbra webmail for the OTP, type it in, and press **Enter** (or click "Log In").

> **Tip**: If you check *"Keep unlocked for this browser session"* in the popup, you won't even need to enter your PIN again until you restart your browser!

---

## 📂 Repository File Structure

```text
erp-autologin/
├── manifest.json       # Chrome Manifest V3 configuration & permissions
├── crypto.js           # Web Crypto API: PBKDF2 key derivation & AES-GCM encryption
├── popup/
│   ├── popup.html      # Modern UI for initial setup, unlocking & credential updates
│   ├── popup.css       # Clean stylesheet with responsive card layout
│   └── popup.js        # Controller handling PIN validation & encrypted storage
├── content/
│   ├── content.js      # In-page automation, fuzzy question matcher & OTP trigger
│   └── content.css     # In-page floating PIN prompt styling
├── icons/
│   ├── icon16.png      # 16x16 toolbar icon
│   ├── icon48.png      # 48x48 management icon
│   └── icon128.png     # 128x128 store/display icon
└── README.md           # Documentation and setup instructions
```

---

## ❓ Frequently Asked Questions (FAQ)

#### What if ERP asks a question with slightly different wording?
The extension uses tokenized keyword matching and similarity scoring rather than rigid exact matching. As long as your registered questions are entered in the setup, it accurately matches the loaded question.

#### What if I forget my 4-digit PIN?
Click the extension icon, choose **Reset All Stored Data**, and confirm. This erases the encrypted vault from your browser, allowing you to set a fresh PIN and re-enter your details.

#### Is my password visible to anyone who uses my laptop?
No. Your credentials are fully encrypted using AES-GCM. Opening the extension requires your 4-digit master PIN to decrypt and view or edit them.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — free to use, modify, and distribute with classmates.
