/**
 * IIT KGP ERP Auto-Login - Background Service Worker
 * Handles options page requests, storage access permissions,
 * and automated OTP detection via Gmail's authenticated Atom feed.
 */

let activePollingInterval = null;
let pollingAttempts = 0;
const MAX_POLLING_ATTEMPTS = 15; // 15 * 2s = 30 seconds max
const POLLING_INTERVAL_MS = 2000;

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.storage && chrome.storage.session && chrome.storage.session.setAccessLevel) {
    chrome.storage.session.setAccessLevel({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
    }).catch(err => {
      console.warn('Session storage accessLevel notice:', err);
    });
  }
});

/**
 * Extracts the associated email address from the root feed title
 * e.g., "<title>Gmail - Inbox for user@example.com</title>"
 */
function getFeedAccountEmail(xmlText) {
  if (!xmlText) return null;
  const match = xmlText.match(/<title>Gmail - Inbox for ([^<]+)<\/title>/i);
  return match ? match[1].trim().toLowerCase() : null;
}

/**
 * Parses Gmail Atom XML feed without requiring DOMParser (for service worker compatibility)
 */
function parseGmailAtomFeed(xmlText, minTimestampMs) {
  if (!xmlText) return null;

  const entryMatches = xmlText.match(/<entry>([\s\S]*?)<\/entry>/g) || [];

  for (const entry of entryMatches) {
    const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || '';
    const issued = (entry.match(/<issued>([\s\S]*?)<\/issued>/) || [])[1] || '';
    const authorEmail = (entry.match(/<email>([\s\S]*?)<\/email>/) || [])[1] || '';
    const authorName = (entry.match(/<name>([\s\S]*?)<\/name>/) || [])[1] || '';

    const fullContent = (title + ' ' + summary + ' ' + authorName + ' ' + authorEmail).toLowerCase();
    const isErp = fullContent.includes('erp') || fullContent.includes('iitkgp') || fullContent.includes('kharagpur');

    const issuedMs = issued ? new Date(issued).getTime() : Date.now();
    const isRecent = issuedMs >= minTimestampMs;

    if (isErp && isRecent) {
      // Look for a 6-digit OTP pattern
      const otpMatch = (title + ' ' + summary).match(/\b\d{6}\b/);
      if (otpMatch) {
        return otpMatch[0];
      }
    }
  }

  return null;
}

/**
 * Checks Gmail feeds across potential account indices (default, /u/0, /u/1, /u/2, /u/3)
 * Optionally filters strictly to a user-specified targetGmail address.
 */
async function pollGmailForOtp(minTimestampMs, targetGmail) {
  const feedUrls = [
    'https://mail.google.com/mail/feed/atom',
    'https://mail.google.com/mail/u/0/feed/atom',
    'https://mail.google.com/mail/u/1/feed/atom',
    'https://mail.google.com/mail/u/2/feed/atom',
    'https://mail.google.com/mail/u/3/feed/atom'
  ];

  const target = (targetGmail || '').trim().toLowerCase();

  for (const url of feedUrls) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) continue;

      const xmlText = await res.text();

      // If user specified a target Gmail, ensure this inbox matches
      if (target) {
        const feedEmail = getFeedAccountEmail(xmlText);
        if (feedEmail && !feedEmail.includes(target) && !target.includes(feedEmail)) {
          continue; // Skip inboxes belonging to other Google accounts
        }
      }

      const otp = parseGmailAtomFeed(xmlText, minTimestampMs);
      if (otp) {
        return otp;
      }
    } catch (e) {
      // Ignore network errors on multi-account lookups
    }
  }

  return null;
}

/**
 * Message Dispatcher
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openOptions') {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'START_GMAIL_OTP_POLLING') {
    const tabId = sender.tab ? sender.tab.id : null;
    const minTimestampMs = message.startTime || (Date.now() - 30000);
    const targetGmail = message.targetGmail || '';

    if (activePollingInterval) {
      clearInterval(activePollingInterval);
      activePollingInterval = null;
    }

    pollingAttempts = 0;
    console.log('[KGP-ERP-AutoLogin] Started polling Gmail Atom feed for OTP...', { targetGmail });

    activePollingInterval = setInterval(async () => {
      pollingAttempts++;

      const otp = await pollGmailForOtp(minTimestampMs, targetGmail);

      if (otp) {
        console.log('[KGP-ERP-AutoLogin] Successfully detected OTP from Gmail:', otp);
        clearInterval(activePollingInterval);
        activePollingInterval = null;

        if (tabId) {
          chrome.tabs.sendMessage(tabId, { action: 'OTP_DETECTED', otp: otp });
        }
        return;
      }

      if (pollingAttempts >= MAX_POLLING_ATTEMPTS) {
        console.log('[KGP-ERP-AutoLogin] Gmail OTP polling timed out (30s).');
        clearInterval(activePollingInterval);
        activePollingInterval = null;

        if (tabId) {
          chrome.tabs.sendMessage(tabId, { action: 'OTP_TIMEOUT' });
        }
      }
    }, POLLING_INTERVAL_MS);

    sendResponse({ started: true });
    return true;
  }

  if (message.action === 'STOP_GMAIL_OTP_POLLING') {
    if (activePollingInterval) {
      clearInterval(activePollingInterval);
      activePollingInterval = null;
    }
    sendResponse({ stopped: true });
    return true;
  }
});
