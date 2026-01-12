// LockTracker - Background Service Worker

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'betsScraped') {
    // Could be used for auto-sync in paid version
    console.log('Bets scraped:', message.bets);
  }

  return true;
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('LockTracker extension installed!');
    // Could open onboarding page here
  } else if (details.reason === 'update') {
    console.log('LockTracker extension updated to version', chrome.runtime.getManifest().version);
  }
});

// For paid users: auto-sync could be triggered here on a schedule
// chrome.alarms.create('autoSync', { periodInMinutes: 30 });
// chrome.alarms.onAlarm.addListener((alarm) => {
//   if (alarm.name === 'autoSync') {
//     // Trigger auto-sync for paid users
//   }
// });
