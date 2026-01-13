// LockTracker - Background Service Worker

const APP_URL = 'https://web-production-efd3.up.railway.app';

// Track which tabs have already been auto-synced this session to avoid duplicates
const syncedTabs = new Set();

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'pageLoaded') {
    // Content script is telling us a sportsbook page loaded
    handlePageLoaded(sender.tab, message.site).then(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.action === 'storeAuth') {
    // Popup is storing auth token
    chrome.storage.local.set({
      access_token: message.access_token,
      user: message.user
    }).then(() => {
      console.log('LockTracker: Auth token stored');
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'clearAuth') {
    // User logged out
    chrome.storage.local.remove(['access_token', 'user']).then(() => {
      console.log('LockTracker: Auth token cleared');
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'getAuth') {
    // Get stored auth
    chrome.storage.local.get(['access_token', 'user']).then(sendResponse);
    return true;
  }

  return true;
});

// Handle when a sportsbook page loads
async function handlePageLoaded(tab, site) {
  console.log(`LockTracker: ${site} page loaded in tab ${tab.id}`);

  // Check if we already synced this tab recently (prevent duplicate syncs)
  const tabKey = `${tab.id}-${tab.url}`;
  if (syncedTabs.has(tabKey)) {
    console.log('LockTracker: Already synced this tab, skipping');
    return { autoSync: false, reason: 'already_synced' };
  }

  // Get stored auth
  const auth = await chrome.storage.local.get(['access_token', 'user']);

  if (!auth.access_token) {
    console.log('LockTracker: No auth token stored, skipping auto-sync');
    return { autoSync: false, reason: 'not_logged_in' };
  }

  // Check if user is Pro
  try {
    const usageResponse = await fetch(`${APP_URL}/api/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: auth.access_token })
    });

    const usage = await usageResponse.json();

    if (!usage.success) {
      console.log('LockTracker: Could not verify user status');
      return { autoSync: false, reason: 'auth_error' };
    }

    if (usage.tier !== 'paid') {
      console.log('LockTracker: User is on free tier, manual sync required');
      return { autoSync: false, reason: 'free_tier' };
    }

    // User is Pro! Trigger auto-sync
    console.log('LockTracker: Pro user detected, triggering auto-sync');
    return { autoSync: true, tier: 'paid' };

  } catch (error) {
    console.error('LockTracker: Error checking user status:', error);
    return { autoSync: false, reason: 'network_error' };
  }
}

// Perform the actual sync (called by content script after scraping)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'autoSyncBets') {
    performAutoSync(message.bets, sender.tab).then(sendResponse);
    return true;
  }
});

async function performAutoSync(bets, tab) {
  if (!bets || bets.length === 0) {
    console.log('LockTracker: No bets to sync');
    return { success: false, reason: 'no_bets' };
  }

  // Get stored auth
  const auth = await chrome.storage.local.get(['access_token']);

  if (!auth.access_token) {
    return { success: false, reason: 'not_logged_in' };
  }

  try {
    const response = await fetch(`${APP_URL}/api/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bets: bets,
        access_token: auth.access_token
      })
    });

    const result = await response.json();

    if (result.success && result.imported > 0) {
      // Mark this tab as synced
      const tabKey = `${tab.id}-${tab.url}`;
      syncedTabs.add(tabKey);

      // Show notification
      showNotification(
        'Bets Synced!',
        `${result.imported} bet${result.imported > 1 ? 's' : ''} synced to LockTracker`
      );

      return { success: true, imported: result.imported };
    } else if (result.success && result.imported === 0) {
      // All bets were duplicates
      const tabKey = `${tab.id}-${tab.url}`;
      syncedTabs.add(tabKey);
      return { success: true, imported: 0, reason: 'all_duplicates' };
    } else {
      return { success: false, error: result.error };
    }

  } catch (error) {
    console.error('LockTracker: Auto-sync error:', error);
    return { success: false, error: error.message };
  }
}

// Show a notification
function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
    silent: false
  });
}

// Clear synced tabs when tab is closed or navigated away
chrome.tabs.onRemoved.addListener((tabId) => {
  // Remove all entries for this tab
  for (const key of syncedTabs) {
    if (key.startsWith(`${tabId}-`)) {
      syncedTabs.delete(key);
    }
  }
});

// Clear synced tabs when URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    // Remove old entries for this tab when URL changes
    for (const key of syncedTabs) {
      if (key.startsWith(`${tabId}-`)) {
        syncedTabs.delete(key);
      }
    }
  }
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('LockTracker extension installed!');
    // Open the web app for user to log in
    chrome.tabs.create({ url: APP_URL });
  } else if (details.reason === 'update') {
    console.log('LockTracker extension updated to version', chrome.runtime.getManifest().version);
  }
});
