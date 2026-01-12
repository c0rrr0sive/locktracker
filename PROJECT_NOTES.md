# LockTracker - Project Notes

> Last updated: January 12, 2025 (Session 2 - Ready for Deployment)

---

## What is this?

A web app + browser extension that helps sports bettors track their bets and see their true performance stats (win rate, ROI, what's working, what's not).

---

## Business Model

**Free Tier:**
- Browser extension installed
- Manual "Sync Now" button to pull bets from sportsbooks
- 15 bets/month tracked
- Basic stats (profit, win rate, ROI)

**Paid Tier ($7-10/month):**
- Auto-sync in background (no clicking)
- Unlimited bets
- Advanced stats & breakdowns
- Export to spreadsheet

---

## Tech Stack

| Component | Technology | Status |
|-----------|------------|--------|
| Web App Backend | Python + Flask | DONE |
| Web App Frontend | HTML/CSS/JavaScript | DONE |
| Database | Supabase (PostgreSQL) | DONE |
| Browser Extension | Chrome Extension (Manifest V3) | DONE |
| User Accounts | Supabase Auth | DONE |
| Payments | Stripe | Not started |
| Hosting | Railway | In Progress |

---

## What's Been Built

### MVP Web App (DONE)
- [x] Log bets manually (sport, matchup, bet type, odds, amount)
- [x] Mark bets as Win/Loss/Push
- [x] Auto-calculate profit based on American odds
- [x] Stats dashboard (total profit, win rate, ROI, record)
- [x] Breakdown by sport
- [x] Breakdown by bet type
- [x] Pending bets section
- [x] Bet history section
- [x] Delete bets
- [x] Clean dark theme UI
- [x] API endpoint for importing bets from extension

**Location:** `bet-tracker/app.py`
**To run:** `python app.py` then open http://127.0.0.1:5000

### Browser Extension (DONE - with test pages)
- [x] manifest.json (Chrome Manifest V3)
- [x] Popup UI (shows current site, sync button, status)
- [x] Content script for FanDuel
- [x] Content script for DraftKings
- [x] Background service worker
- [x] Icons (placeholder purple squares)
- [x] Communication between popup and content scripts
- [x] Sends scraped bets to web app API
- [x] Mock test pages for local testing
- [x] Support for local file testing

**Location:** `bet-tracker/extension/`

**Files:**
```
extension/
├── manifest.json           # Extension config
├── popup.html              # Popup UI
├── popup.js                # Popup logic
├── background.js           # Background worker
├── content-fanduel.js      # Scrapes FanDuel
├── content-draftkings.js   # Scrapes DraftKings
├── content-prizepicks.js   # Scrapes PrizePicks
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── test-pages/
    ├── fanduel-mock.html      # Mock FanDuel page (8 test bets)
    ├── draftkings-mock.html   # Mock DraftKings page (10 test bets)
    ├── prizepicks-mock.html   # Mock PrizePicks page (6 test entries)
    └── TESTING_README.txt     # Testing instructions
```

**Supported Platforms:**
- FanDuel Sportsbook
- DraftKings Sportsbook
- PrizePicks (Daily Fantasy)

---

## What's Next (To Build)

### Immediate (Testing Phase)
- [x] Load extension in Chrome and test
- [x] Created mock test pages for FanDuel & DraftKings
- [ ] Test on actual FanDuel bet history page (when available)
- [ ] Test on actual DraftKings bet history page (when available)
- [ ] Adjust content scripts based on real DOM structure if needed

### User Accounts (DONE)
- [x] Sign up / Login with email
- [x] Connect extension to account
- [x] Each user has private data
- [ ] Free vs Paid tier tracking (15 bets/month limit)
- [ ] Password reset

### Payments
- [ ] Stripe integration
- [ ] Subscription management
- [ ] Upgrade/downgrade flow

### Hosting (In Progress)
- [ ] Create GitHub repository
- [ ] Push code to GitHub
- [ ] Deploy web app to Railway
- [x] Connect to cloud database (Supabase)

### Advanced Stats (Paid Features)
- [ ] Graphs over time
- [ ] Best/worst bet types
- [ ] Hot/cold streaks
- [ ] ROI by sportsbook
- [ ] Export to CSV/Excel

---

## How to Test the Extension

### Using Mock Test Pages (Recommended for now)

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `bet-tracker/extension` folder
5. Click on the extension's "Details" button
6. **Enable "Allow access to file URLs"** (important for local testing!)
7. Make sure the web app is running (`python app.py`)
8. Open `extension/test-pages/fanduel-mock.html` in Chrome
9. Click extension icon → "Sync Now"
10. Check http://127.0.0.1:5000 to see imported bets

### Using Real Sportsbook Pages (when available)

1. Same steps 1-5 above
2. Go to FanDuel or DraftKings bet history page
3. Click extension icon → "Sync Now"

See `extension/test-pages/TESTING_README.txt` for detailed instructions.

---

## How to Run the Web App

1. Open terminal
2. `cd "C:\Users\User\OneDrive\Desktop\Claude Project\bet-tracker"`
3. `python app.py`
4. Open browser to http://127.0.0.1:5000

---

## Session Log

### Session 1 - January 11, 2025

**Part 1 - Learning & Planning:**
1. Started with Harden tweet tracker as a learning project
2. Learned about APIs, web scraping, automation
3. Brainstormed monetizable ideas
4. Landed on bet tracker concept

**Part 2 - MVP Web App:**
1. Planned MVP features
2. Built Flask backend with SQLite database
3. Built HTML/CSS frontend with dark theme
4. Added all core tracking features

**Part 3 - Business Model:**
1. Discussed CSV import vs browser extension
2. Decided on tiered model:
   - Free: Manual "Sync Now" button
   - Paid: Auto-sync in background
3. Planned 15 bets/month free limit

**Part 4 - Browser Extension:**
1. Built Chrome extension (Manifest V3)
2. Created popup UI
3. Created content scripts for FanDuel and DraftKings
4. Added API endpoint to web app for importing bets
5. Ready for testing on real sportsbook pages

**Current status:** Extension built, needs testing on actual FanDuel/DraftKings pages. Content scripts may need adjustment based on real DOM structure.

### Session 2 - January 12, 2025

**Mock Test Pages Created:**
1. User can't access real sportsbooks (betting not legal in their area)
2. Researched FanDuel/DraftKings page structure
3. Created mock test pages that simulate bet history pages:
   - `fanduel-mock.html` - 8 sample bets (NBA, NFL, MLB, NHL, UFC, Parlay)
   - `draftkings-mock.html` - 10 sample bets (various sports)
4. Updated content scripts with better selectors
5. Updated manifest.json to allow local file testing
6. Updated popup.js to detect mock pages
7. Created TESTING_README.txt with step-by-step testing instructions

**Current status:** Extension ready for local testing with mock pages. User can now test the full sync flow without needing access to real sportsbooks.

**User Accounts Added:**
1. Set up Supabase project and database
2. Created `bets` table with Row Level Security (users only see their own bets)
3. Installed Supabase Python library
4. Added login/signup pages with authentication
5. Migrated from local SQLite to cloud Supabase database
6. Added PrizePicks support (content script + mock page)
7. Updated extension to send user auth token when syncing
8. Added CORS support for extension API calls

**Current status:** Full user account system working. Users can sign up, log in, and their bets are private and stored in the cloud.

---

## Important Notes

- Content scripts use generic selectors that may need adjustment after testing on real sportsbook pages
- FanDuel and DraftKings frequently update their sites, so scraping logic may need maintenance
- Extension is set up for manual sync (free tier) - auto-sync code is commented out for paid tier

---

## Questions Still to Answer

- [x] Product name? **LockTracker**
- [ ] Domain name?
- [ ] Exact pricing ($7 vs $10/month)?
- [ ] Annual discount?
- [ ] Which sportsbooks to prioritize after FD/DK/PrizePicks?

---
