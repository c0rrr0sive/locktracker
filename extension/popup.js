// LockTracker - Popup Script

const SUPPORTED_SITES = {
  'sportsbook.fanduel.com': 'FanDuel',
  'sportsbook.draftkings.com': 'DraftKings',
  'app.prizepicks.com': 'PrizePicks',
  'www.prizepicks.com': 'PrizePicks'
};

// For local testing - detect mock pages
function detectMockSite(url) {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('fanduel-mock') || urlLower.includes('fanduel_mock')) {
    return 'FanDuel (Test)';
  }
  if (urlLower.includes('draftkings-mock') || urlLower.includes('draftkings_mock')) {
    return 'DraftKings (Test)';
  }
  if (urlLower.includes('prizepicks-mock') || urlLower.includes('prizepicks_mock')) {
    return 'PrizePicks (Test)';
  }
  return null;
}

const APP_URL = 'https://web-production-efd3.up.railway.app';

// Store user auth info
let userAuth = null;
// Store scraped bets for selection
let scrapedBets = [];
// Store selected bet indices
let selectedBets = new Set();
// Store user's remaining monthly bets
let remainingBets = 15;
let userTier = 'free';

// Check if user is logged in to the web app
async function checkUserAuth() {
  try {
    const response = await fetch(`${APP_URL}/api/auth/status`, {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.logged_in) {
      userAuth = {
        user: data.user,
        access_token: data.access_token
      };
      // Store auth in chrome.storage for background script (auto-sync)
      chrome.runtime.sendMessage({
        action: 'storeAuth',
        access_token: data.access_token,
        user: data.user
      });
      return true;
    }
  } catch (e) {
    console.log('Could not check auth status:', e);
  }

  // Try to get auth from chrome.storage as fallback
  try {
    const stored = await chrome.runtime.sendMessage({ action: 'getAuth' });
    if (stored && stored.access_token) {
      userAuth = {
        user: stored.user,
        access_token: stored.access_token
      };
      return true;
    }
  } catch (e) {
    console.log('Could not get stored auth:', e);
  }

  userAuth = null;
  return false;
}

// Get user's usage info
async function getUserUsage() {
  if (!userAuth || !userAuth.access_token) {
    return null;
  }

  try {
    const response = await fetch(`${APP_URL}/api/usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: userAuth.access_token
      })
    });
    const data = await response.json();
    if (data.success) {
      remainingBets = data.remaining;
      userTier = data.tier;
      return data;
    }
  } catch (e) {
    console.log('Could not get usage info:', e);
  }
  return null;
}

// DOM elements - Initial View
const initialView = document.getElementById('initial-view');
const currentSiteEl = document.getElementById('current-site');
const siteStatusEl = document.getElementById('site-status');
const syncBtn = document.getElementById('sync-btn');
const syncStatusEl = document.getElementById('sync-status');
const dashboardBtn = document.getElementById('dashboard-btn');
const betsFoundBox = document.getElementById('bets-found-box');
const betsCountEl = document.getElementById('bets-count');

// DOM elements - Selection View
const selectionView = document.getElementById('selection-view');
const selectionCountEl = document.getElementById('selection-count');
const remainingBannerEl = document.getElementById('remaining-banner');
const limitBannerEl = document.getElementById('limit-banner');
const betListEl = document.getElementById('bet-list');
const backBtn = document.getElementById('back-btn');
const confirmSyncBtn = document.getElementById('confirm-sync-btn');

// Inject content script for local file testing
async function injectContentScript(tabId, scriptFile) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: [scriptFile]
    });
    console.log('Injected content script:', scriptFile);
    return true;
  } catch (e) {
    console.error('Failed to inject script:', e);
    return false;
  }
}

// Check what site we're on
async function checkCurrentSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    const hostname = url.hostname;

    // Check for mock/test pages first (local file testing)
    const mockSite = detectMockSite(tab.url);

    if (mockSite) {
      // We're on a mock test page
      currentSiteEl.textContent = mockSite;
      currentSiteEl.classList.add('detected');
      siteStatusEl.textContent = 'Injecting script...';
      siteStatusEl.classList.add('detected');

      // Determine which script to inject based on the mock site
      let scriptFile = 'content-fanduel.js';
      if (mockSite.includes('DraftKings')) {
        scriptFile = 'content-draftkings.js';
      } else if (mockSite.includes('PrizePicks')) {
        scriptFile = 'content-prizepicks.js';
      }

      // Inject the content script manually for local files
      const injected = await injectContentScript(tab.id, scriptFile);

      if (injected) {
        siteStatusEl.textContent = 'Test page ready';
        syncBtn.disabled = false;

        // Give script a moment to load, then try to get bet count
        setTimeout(async () => {
          try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getBetCount' });
            if (response && response.count > 0) {
              betsFoundBox.classList.remove('hidden');
              betsCountEl.textContent = response.count;
            }
          } catch (e) {
            console.log('Could not get bet count:', e);
          }
        }, 100);
      } else {
        siteStatusEl.textContent = 'Enable "Allow access to file URLs"';
        siteStatusEl.classList.remove('detected');
        siteStatusEl.classList.add('not-detected');
        syncBtn.disabled = true;
      }

    } else if (SUPPORTED_SITES[hostname]) {
      const siteName = SUPPORTED_SITES[hostname];
      currentSiteEl.textContent = siteName;
      currentSiteEl.classList.add('detected');
      siteStatusEl.textContent = 'Ready to sync';
      siteStatusEl.classList.add('detected');
      syncBtn.disabled = false;

      // Check if we're on the bet history page
      if (url.pathname.includes('my-bets') || url.pathname.includes('bet-history') || url.pathname.includes('history')) {
        siteStatusEl.textContent = 'On bet history page';
      } else {
        siteStatusEl.textContent = 'Go to bet history page';
        siteStatusEl.classList.remove('detected');
        siteStatusEl.classList.add('not-detected');
      }

      // Try to get bet count from content script
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getBetCount' });
        if (response && response.count > 0) {
          betsFoundBox.classList.remove('hidden');
          betsCountEl.textContent = response.count;
        }
      } catch (e) {
        // Content script might not be loaded yet
        console.log('Could not get bet count:', e);
      }

    } else {
      currentSiteEl.textContent = 'Not a sportsbook';
      currentSiteEl.classList.add('not-detected');
      siteStatusEl.textContent = 'Go to FanDuel or DraftKings';
      siteStatusEl.classList.add('not-detected');
      syncBtn.disabled = true;
    }
  } catch (error) {
    console.error('Error checking site:', error);
    currentSiteEl.textContent = 'Error';
    siteStatusEl.textContent = 'Could not detect site';
  }
}

// Show the bet selection view
async function showSelectionView(bets) {
  scrapedBets = bets;
  selectedBets.clear();

  // Get user's remaining bets
  const usage = await getUserUsage();

  if (usage) {
    remainingBets = usage.remaining;
    userTier = usage.tier;

    if (userTier === 'free') {
      if (usage.at_limit) {
        remainingBannerEl.textContent = 'Monthly limit reached (0 remaining)';
        remainingBannerEl.style.background = 'rgba(239, 68, 68, 0.1)';
        remainingBannerEl.style.borderColor = '#ef4444';
        remainingBannerEl.style.color = '#ef4444';
        limitBannerEl.classList.remove('hidden');
      } else {
        remainingBannerEl.textContent = `${usage.remaining} of ${usage.monthly_limit} bets remaining this month`;
        remainingBannerEl.style.background = 'rgba(99, 102, 241, 0.1)';
        remainingBannerEl.style.borderColor = '#6366f1';
        remainingBannerEl.style.color = '#a5a6ff';
        limitBannerEl.classList.add('hidden');
      }
    } else {
      remainingBannerEl.textContent = 'Pro account - Unlimited syncs';
      remainingBannerEl.style.background = 'rgba(34, 197, 94, 0.1)';
      remainingBannerEl.style.borderColor = '#22c55e';
      remainingBannerEl.style.color = '#22c55e';
      limitBannerEl.classList.add('hidden');
    }
  } else {
    remainingBannerEl.textContent = 'Could not fetch usage info';
  }

  // Render bet list
  renderBetList();

  // Auto-select bets up to the limit (newest first, they're already sorted)
  const maxToSelect = userTier === 'free' ? Math.min(remainingBets, bets.length) : bets.length;
  for (let i = 0; i < maxToSelect; i++) {
    selectedBets.add(i);
  }
  updateCheckboxes();
  updateSelectionCount();

  // Switch views
  initialView.classList.add('hidden');
  selectionView.classList.remove('hidden');
}

// Render the bet list with checkboxes
function renderBetList() {
  betListEl.innerHTML = '';

  scrapedBets.forEach((bet, index) => {
    const betItem = document.createElement('div');
    betItem.className = 'bet-item';
    betItem.dataset.index = index;

    // Check if this bet is over the limit for free users
    const isOverLimit = userTier === 'free' && index >= remainingBets;
    if (isOverLimit) {
      betItem.classList.add('disabled');
    }

    // Result badge
    let resultClass = 'pending';
    let resultText = 'Pending';
    if (bet.result === 'win') {
      resultClass = 'win';
      resultText = 'Win';
    } else if (bet.result === 'loss') {
      resultClass = 'loss';
      resultText = 'Loss';
    }

    betItem.innerHTML = `
      <input type="checkbox" ${isOverLimit ? 'disabled' : ''}>
      <div class="bet-item-info">
        <div class="bet-item-desc">${bet.bet_description || bet.matchup || 'Unknown bet'}</div>
        <div class="bet-item-details">$${bet.amount?.toFixed(2) || '0.00'} ${bet.source ? '| ' + bet.source : ''}</div>
      </div>
      <span class="bet-item-result ${resultClass}">${resultText}</span>
    `;

    // Click handler for the whole item
    betItem.addEventListener('click', (e) => {
      if (isOverLimit) return;
      const checkbox = betItem.querySelector('input[type="checkbox"]');
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      if (checkbox.checked) {
        selectedBets.add(index);
      } else {
        selectedBets.delete(index);
      }
      updateSelectionCount();
    });

    betListEl.appendChild(betItem);
  });
}

// Update checkboxes based on selectedBets
function updateCheckboxes() {
  const checkboxes = betListEl.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((checkbox, index) => {
    checkbox.checked = selectedBets.has(index);
  });
}

// Update the selection count display
function updateSelectionCount() {
  const count = selectedBets.size;
  selectionCountEl.textContent = `${count} selected`;

  if (userTier === 'free') {
    if (count > remainingBets) {
      selectionCountEl.classList.add('limit');
      selectionCountEl.classList.remove('warning');
    } else if (count === remainingBets && remainingBets > 0) {
      selectionCountEl.classList.add('warning');
      selectionCountEl.classList.remove('limit');
    } else {
      selectionCountEl.classList.remove('warning', 'limit');
    }
  }

  // Enable/disable confirm button
  confirmSyncBtn.disabled = count === 0;
}

// Go back to initial view
function goBack() {
  selectionView.classList.add('hidden');
  initialView.classList.remove('hidden');
  scrapedBets = [];
  selectedBets.clear();
}

// Scrape bets and show selection (when Sync Now is clicked)
async function scrapeBetsForSelection() {
  syncBtn.disabled = true;
  syncBtn.innerHTML = '<span class="loading"></span>Loading...';
  syncStatusEl.textContent = '';
  syncStatusEl.className = 'sync-status';

  try {
    // Check if user is logged in first
    if (!userAuth || !userAuth.access_token) {
      const isLoggedIn = await checkUserAuth();
      if (!isLoggedIn) {
        syncStatusEl.textContent = 'Please log in first. Click "Open Dashboard"';
        syncStatusEl.classList.add('error');
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync Now';
        return;
      }
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Ask content script to scrape bets
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeBets' });

    if (response.error) {
      throw new Error(response.error);
    }

    if (response.bets && response.bets.length > 0) {
      // Show selection view instead of immediately syncing
      await showSelectionView(response.bets);
    } else {
      syncStatusEl.textContent = 'No bets found on this page';
      syncStatusEl.classList.add('error');
    }

  } catch (error) {
    console.error('Scrape error:', error);
    syncStatusEl.textContent = `Error: ${error.message}`;
    syncStatusEl.classList.add('error');
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = 'Sync Now';
  }
}

// Sync only the selected bets
async function syncSelectedBets() {
  if (selectedBets.size === 0) return;

  confirmSyncBtn.disabled = true;
  confirmSyncBtn.innerHTML = '<span class="loading"></span>Syncing...';

  try {
    // Get only the selected bets
    const betsToSync = Array.from(selectedBets).map(index => scrapedBets[index]);

    // Send bets to the web app
    const result = await sendBetsToApp(betsToSync);

    if (result.success) {
      // Go back to initial view and show success
      goBack();
      syncStatusEl.textContent = `Synced ${result.imported} bets!`;
      syncStatusEl.classList.add('success');

      if (result.warning) {
        syncStatusEl.textContent += ' ' + result.warning;
        syncStatusEl.classList.remove('success');
        syncStatusEl.classList.add('warning');
      }
    } else {
      throw new Error(result.error || 'Failed to save bets');
    }

  } catch (error) {
    console.error('Sync error:', error);
    // Show error in selection view
    remainingBannerEl.textContent = `Error: ${error.message}`;
    remainingBannerEl.style.background = 'rgba(239, 68, 68, 0.1)';
    remainingBannerEl.style.borderColor = '#ef4444';
    remainingBannerEl.style.color = '#ef4444';
  } finally {
    confirmSyncBtn.disabled = false;
    confirmSyncBtn.textContent = 'Sync Selected';
  }
}

// Send bets to the web app
async function sendBetsToApp(bets) {
  try {
    // Check if user is logged in first
    if (!userAuth || !userAuth.access_token) {
      const isLoggedIn = await checkUserAuth();
      if (!isLoggedIn) {
        return { success: false, error: 'Please log in to LockTracker first. Click "Open Dashboard" to sign in.' };
      }
    }

    const response = await fetch(`${APP_URL}/api/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bets: bets,
        access_token: userAuth.access_token
      })
    });

    return await response.json();
  } catch (error) {
    console.error('Failed to send bets to app:', error);
    return { success: false, error: 'Could not connect to LockTracker. Is it running?' };
  }
}

// Open dashboard
function openDashboard() {
  chrome.tabs.create({ url: APP_URL });
}

// Event listeners
syncBtn.addEventListener('click', scrapeBetsForSelection);
dashboardBtn.addEventListener('click', openDashboard);
backBtn.addEventListener('click', goBack);
confirmSyncBtn.addEventListener('click', syncSelectedBets);

// Initialize
async function init() {
  // Check if user is logged in
  await checkUserAuth();
  // Then check the current site
  checkCurrentSite();
}

init();
