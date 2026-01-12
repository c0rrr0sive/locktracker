// Bet Tracker - Popup Script

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

const APP_URL = 'http://127.0.0.1:5000';

// Store user auth info
let userAuth = null;

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
      return true;
    }
  } catch (e) {
    console.log('Could not check auth status:', e);
  }
  userAuth = null;
  return false;
}

// DOM elements
const currentSiteEl = document.getElementById('current-site');
const siteStatusEl = document.getElementById('site-status');
const syncBtn = document.getElementById('sync-btn');
const syncStatusEl = document.getElementById('sync-status');
const dashboardBtn = document.getElementById('dashboard-btn');
const betsFoundBox = document.getElementById('bets-found-box');
const betsCountEl = document.getElementById('bets-count');

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
        siteStatusEl.textContent = 'Test page ready ✓';
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
        siteStatusEl.textContent = 'On bet history page ✓';
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

// Sync bets
async function syncBets() {
  syncBtn.disabled = true;
  syncBtn.innerHTML = '<span class="loading"></span>Syncing...';
  syncStatusEl.textContent = '';
  syncStatusEl.className = 'sync-status';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Ask content script to scrape bets
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeBets' });

    if (response.error) {
      throw new Error(response.error);
    }

    if (response.bets && response.bets.length > 0) {
      // Send bets to the web app
      const result = await sendBetsToApp(response.bets);

      if (result.success) {
        syncStatusEl.textContent = `✓ Synced ${response.bets.length} bets!`;
        syncStatusEl.classList.add('success');
        betsFoundBox.classList.remove('hidden');
        betsCountEl.textContent = response.bets.length;
      } else {
        throw new Error(result.error || 'Failed to save bets');
      }
    } else {
      syncStatusEl.textContent = 'No bets found on this page';
      syncStatusEl.classList.add('error');
    }

  } catch (error) {
    console.error('Sync error:', error);
    syncStatusEl.textContent = `Error: ${error.message}`;
    syncStatusEl.classList.add('error');
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = 'Sync Now';
  }
}

// Send bets to the web app
async function sendBetsToApp(bets) {
  try {
    // Check if user is logged in first
    if (!userAuth || !userAuth.access_token) {
      const isLoggedIn = await checkUserAuth();
      if (!isLoggedIn) {
        return { success: false, error: 'Please log in to Bet Tracker first. Click "Open Dashboard" to sign in.' };
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
    return { success: false, error: 'Could not connect to Bet Tracker app. Is it running?' };
  }
}

// Open dashboard
function openDashboard() {
  chrome.tabs.create({ url: APP_URL });
}

// Event listeners
syncBtn.addEventListener('click', syncBets);
dashboardBtn.addEventListener('click', openDashboard);

// Initialize
async function init() {
  // Check if user is logged in
  await checkUserAuth();
  // Then check the current site
  checkCurrentSite();
}

init();
