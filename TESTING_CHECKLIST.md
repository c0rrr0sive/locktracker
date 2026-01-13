# LockTracker - External Testing Checklist

> Things that need to be tested with real sportsbook accounts.
> Updated as new features are added.

---

## Needs Testing (Priority)

### 1. Auto-Sync for Pro Users
- **Status:** Coded but untested
- **What to test:**
  - Log in to LockTracker web app
  - Make sure account is Pro (or temporarily set to Pro for testing)
  - Go to PrizePicks bet history page
  - Bets should sync automatically WITHOUT opening the extension
  - A desktop notification should appear: "Bets Synced! X bets synced to LockTracker"
- **Expected behavior:** No manual clicking needed, bets just sync when you visit the page
- **Files involved:** `background.js`, `content-prizepicks.js`

### 2. FanDuel Scraper
- **Status:** Built with guessed selectors, untested on real site
- **What to test:**
  - Go to FanDuel bet history page
  - Open extension, click Sync Now
  - Check if bets are detected and scraped correctly
- **Expected behavior:** Bets should appear in the selection view with correct details
- **Files involved:** `content-fanduel.js`
- **Notes:** May need selector updates based on real DOM structure

### 3. DraftKings Scraper
- **Status:** Built with guessed selectors, untested on real site
- **What to test:**
  - Go to DraftKings bet history page
  - Open extension, click Sync Now
  - Check if bets are detected and scraped correctly
- **Expected behavior:** Bets should appear in the selection view with correct details
- **Files involved:** `content-draftkings.js`
- **Notes:** May need selector updates based on real DOM structure

---

## Already Tested & Working

### PrizePicks Scraper (Manual Sync)
- **Tested:** January 2025 with beta tester in Texas
- **Status:** Working
- **Selector used:** `[class*="border-soFresh-130"]`

### Stripe Payments
- **Tested:** January 2025 with test card, then live
- **Status:** Working
- **Flow:** Pricing page → Stripe Checkout → Webhook updates subscription → User is Pro

### Free Tier Limits
- **Tested:** January 2025
- **Status:** Working
- **Behavior:** 15 bets/month, bet selection UI, grays out bets over limit

---

## Future Features (Will Need Testing)

*Add items here as new features are built*

---

## Testing Instructions for Beta Tester

### Setup (One-time)
1. Clone the repo: `git clone https://github.com/c0rrr0sive/locktracker.git`
2. Load extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" → select `locktracker/extension` folder
3. Create account at https://web-production-efd3.up.railway.app/signup
4. Log in to the web app (keeps you authenticated for extension)

### Before Each Test Session
1. Pull latest code: `cd locktracker && git pull`
2. Reload extension in Chrome (click refresh icon on extension card)

### How to Report Issues
- Screenshot the page
- Open browser console (F12 → Console tab) and screenshot any errors
- Note exactly what you clicked/did before the issue
- Send to [your contact method]

---

## Console Commands for Debugging

If scraper isn't finding bets, have tester run these in browser console (F12):

```javascript
// Check what the content script sees
document.querySelectorAll('[class*="bet"]').length

// For PrizePicks specifically
document.querySelectorAll('[class*="border-soFresh"]').length

// Get page text to analyze structure
document.body.innerText.substring(0, 2000)
```

---

*Last updated: January 2025*
