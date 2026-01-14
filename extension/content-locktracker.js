// LockTracker - Web App Content Script
// This script runs on the LockTracker web app to capture auth tokens for auto-sync

console.log('LockTracker: Web app content script loaded');

// Check auth status and send to extension background
async function captureAuth() {
  try {
    // Fetch auth status from the same origin (cookies will be sent automatically)
    const response = await fetch('/api/auth/status', {
      credentials: 'include'
    });

    const data = await response.json();

    if (data.logged_in && data.access_token) {
      console.log('LockTracker: User is logged in, sending token to extension');

      // Send auth info to background script for storage
      chrome.runtime.sendMessage({
        action: 'storeAuth',
        access_token: data.access_token,
        user: data.user
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('LockTracker: Could not send auth to background:', chrome.runtime.lastError);
        } else {
          console.log('LockTracker: Auth token stored for auto-sync');
        }
      });
    } else {
      console.log('LockTracker: User not logged in');

      // Clear any stored auth if user is logged out
      chrome.runtime.sendMessage({
        action: 'clearAuth'
      });
    }
  } catch (error) {
    console.log('LockTracker: Error checking auth status:', error);
  }
}

// Run immediately when script loads
captureAuth();

// Also run when page becomes visible (in case user was on another tab)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    captureAuth();
  }
});

// Listen for login/logout events by watching for navigation
// This catches when user logs in and gets redirected to dashboard
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    // URL changed, re-check auth
    setTimeout(captureAuth, 500);
  }
}).observe(document, { subtree: true, childList: true });
