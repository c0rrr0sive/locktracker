=====================================================
BET TRACKER - EXTENSION TESTING GUIDE
=====================================================

Since you can't access real sportsbook sites, use these mock
pages to test the browser extension functionality.

-----------------------------------------------------
STEP 1: LOAD THE EXTENSION IN CHROME
-----------------------------------------------------

1. Open Chrome browser
2. Go to: chrome://extensions/
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select this folder: bet-tracker\extension
6. The Bet Tracker extension should appear in your toolbar
7. IMPORTANT: Click the extension's details and enable
   "Allow access to file URLs" - this lets it work on local files

-----------------------------------------------------
STEP 2: START THE WEB APP
-----------------------------------------------------

1. Open Command Prompt or Terminal
2. Navigate to the bet-tracker folder:
   cd "C:\Users\User\OneDrive\Desktop\Claude Project\bet-tracker"
3. Run the app:
   python app.py
4. Keep this window open (the app needs to be running)
5. You can open http://127.0.0.1:5000 in a browser to see the dashboard

-----------------------------------------------------
STEP 3: TEST WITH MOCK PAGES
-----------------------------------------------------

FANDUEL TEST:
1. Open fanduel-mock.html in Chrome:
   - File > Open or drag the file into Chrome
   - Or double-click the file
2. Click the Bet Tracker extension icon in Chrome toolbar
3. It should detect "FanDuel (Test)" and show "Test page ready"
4. Click "Sync Now"
5. It should find and sync 8 test bets

DRAFTKINGS TEST:
1. Open draftkings-mock.html in Chrome
2. Click the extension icon
3. It should detect "DraftKings (Test)"
4. Click "Sync Now"
5. It should find and sync 10 test bets

-----------------------------------------------------
STEP 4: VERIFY IN WEB APP
-----------------------------------------------------

1. Go to http://127.0.0.1:5000
2. You should see the imported bets
3. Stats should update automatically
4. Try marking some as Win/Loss

-----------------------------------------------------
TEST BETS INCLUDED
-----------------------------------------------------

FANDUEL MOCK (8 bets):
- NBA: Celtics -4.5 (Won, $50)
- NFL: Chiefs Moneyline (Lost, $25)
- NBA: Curry Over 28.5 Points (Won, $20)
- MLB: Yankees to Win (Lost, $30)
- NHL: Over 5.5 Goals (Won, $40)
- NBA: Bucks -6.5 (Pending, $35)
- UFC: Pereira to Win by KO (Won, $15)
- Parlay: 3-Leg (Lost, $10)

DRAFTKINGS MOCK (10 bets):
- NBA: Warriors -3.5 (Won, $55)
- NFL: Bills Moneyline (Lost, $40)
- NBA: Doncic Over 32.5 Points (Won, $24)
- NHL: Under 6.5 Goals (Won, $21)
- MLB: Cubs +1.5 (Lost, $29)
- NCAAB: Duke -2.5 (Won, $33)
- UFC: O'Malley to Win (Lost, $36)
- NBA: Knicks -8 (Pending, $50)
- Parlay: 4-Leg (Won, $10)
- Soccer: Man City vs Liverpool Draw (Won, $15)

-----------------------------------------------------
TROUBLESHOOTING
-----------------------------------------------------

Extension shows "Not a sportsbook":
- Make sure "Allow access to file URLs" is enabled
- Reload the extension in chrome://extensions/
- Refresh the mock page

"Could not connect to Bet Tracker app":
- Make sure python app.py is running
- Check http://127.0.0.1:5000 works in browser

Bets not syncing:
- Open Chrome DevTools (F12) > Console tab
- Look for "Bet Tracker:" messages to see what's happening
- Check for any red error messages

-----------------------------------------------------
NEXT STEPS AFTER TESTING
-----------------------------------------------------

Once testing works, the extension is ready to try on real
FanDuel/DraftKings pages when available. Content scripts
may need minor adjustments based on real page structure.

=====================================================
