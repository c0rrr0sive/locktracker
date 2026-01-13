// LockTracker - FanDuel Content Script
// This script runs on FanDuel sportsbook pages and scrapes bet history

console.log('LockTracker: FanDuel content script loaded');

// Store scraped bets
let scrapedBets = [];

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'scrapeBets') {
    const bets = scrapeBets();
    sendResponse({ bets: bets });
  } else if (message.action === 'getBetCount') {
    const bets = scrapeBets();
    sendResponse({ count: bets.length });
  }
  return true;
});

// Main scraping function
function scrapeBets() {
  console.log('LockTracker: Scraping FanDuel bets...');
  const bets = [];

  try {
    // FanDuel bet history structure
    // Look for bet cards/containers - includes mock page selectors and real site patterns
    const betContainers = document.querySelectorAll('[data-test-id="bet-card"], .bet-card, .settled-bet, [class*="BetCard"], [class*="bet-item"], [class*="wager-card"], [class*="bet-history-card"]');

    console.log(`LockTracker: Found ${betContainers.length} potential bet containers`);

    betContainers.forEach((container, index) => {
      try {
        const bet = extractBetFromContainer(container);
        if (bet) {
          bets.push(bet);
          console.log(`LockTracker: Extracted bet ${index + 1}:`, bet);
        }
      } catch (e) {
        console.error(`LockTracker: Error extracting bet ${index + 1}:`, e);
      }
    });

    // Alternative: Look for bet history table rows
    if (bets.length === 0) {
      const tableRows = document.querySelectorAll('table tbody tr, [class*="history"] [class*="row"]');
      console.log(`LockTracker: Trying table rows, found ${tableRows.length}`);

      tableRows.forEach((row, index) => {
        try {
          const bet = extractBetFromRow(row);
          if (bet) {
            bets.push(bet);
          }
        } catch (e) {
          console.error(`LockTracker: Error extracting from row ${index + 1}:`, e);
        }
      });
    }

  } catch (error) {
    console.error('LockTracker: Scraping error:', error);
  }

  console.log(`LockTracker: Total bets scraped: ${bets.length}`);
  scrapedBets = bets;
  return bets;
}

// Extract bet data from a bet card container
function extractBetFromContainer(container) {
  const getText = (selectors) => {
    for (const selector of selectors) {
      const el = container.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return null;
  };

  // Try to find key information
  // These selectors will need to be adjusted based on actual FanDuel DOM structure

  // Look for matchup/event name
  const matchup = getText([
    '.event-name',
    '[class*="event-name"]',
    '[class*="matchup"]',
    '[class*="EventName"]',
    '[data-test-id="event-name"]',
    '.game-name',
    'h3', 'h4'
  ]) || 'Unknown Matchup';

  // Look for bet selection (the actual bet made)
  const betDescription = getText([
    '.selection-name',
    '[class*="selection"]',
    '[class*="bet-name"]',
    '[class*="Selection"]',
    '[data-test-id="selection"]',
    '.pick-name'
  ]) || getText(['p', 'span']);

  // Look for odds
  const oddsText = getText([
    '.odds-value',
    '[class*="odds"]',
    '[class*="price"]',
    '[class*="Odds"]',
    '[data-test-id="odds"]'
  ]);
  const odds = parseOdds(oddsText);

  // Look for stake/wager amount
  const stakeText = getText([
    '.stake-value',
    '[class*="stake"]',
    '[class*="wager"]',
    '[class*="Stake"]',
    '[data-test-id="stake"]'
  ]);
  const amount = parseAmount(stakeText);

  // Look for result (win/loss/pending)
  const resultText = getText([
    '.result-badge',
    '[class*="result"]',
    '[class*="status"]',
    '[class*="Result"]',
    '[data-test-id="result"]'
  ]);
  const result = parseResult(resultText, container);

  // Look for profit/return
  const profitText = getText([
    '.return-value',
    '[class*="return"]',
    '[class*="profit"]',
    '[class*="payout"]',
    '[class*="Return"]'
  ]);
  const profit = parseAmount(profitText);

  // Determine sport (try to infer from matchup or look for sport indicator)
  const sport = detectSport(matchup, container);

  // Determine bet type
  const betType = detectBetType(betDescription, container);

  // Only return if we have minimum required data
  if (betDescription || matchup !== 'Unknown Matchup') {
    return {
      source: 'fanduel',
      sport: sport,
      matchup: matchup,
      bet_type: betType,
      bet_description: betDescription || 'Unknown Bet',
      odds: odds || -110,
      amount: amount || 0,
      result: result,
      profit: profit,
      scraped_at: new Date().toISOString()
    };
  }

  return null;
}

// Extract bet from a table row
function extractBetFromRow(row) {
  const cells = row.querySelectorAll('td');
  if (cells.length < 3) return null;

  const texts = Array.from(cells).map(c => c.textContent.trim());

  // Try to identify what each column contains
  let matchup = '', betDescription = '', odds = -110, amount = 0, result = 'pending';

  texts.forEach(text => {
    if (text.match(/vs\.?|@|\bat\b/i)) {
      matchup = text;
    } else if (text.match(/[+-]\d{3,}/)) {
      odds = parseOdds(text);
    } else if (text.match(/\$[\d,.]+/)) {
      amount = parseAmount(text);
    } else if (text.match(/won|lost|win|loss|push|pending/i)) {
      result = parseResult(text);
    } else if (text.length > 3 && !matchup) {
      betDescription = text;
    }
  });

  if (betDescription || matchup) {
    return {
      source: 'fanduel',
      sport: detectSport(matchup),
      matchup: matchup || 'Unknown',
      bet_type: detectBetType(betDescription),
      bet_description: betDescription || matchup,
      odds: odds,
      amount: amount,
      result: result,
      scraped_at: new Date().toISOString()
    };
  }

  return null;
}

// Parse American odds from text
function parseOdds(text) {
  if (!text) return -110;
  const match = text.match(/([+-]?\d{3,})/);
  if (match) {
    return parseInt(match[1]);
  }
  return -110;
}

// Parse dollar amount from text
function parseAmount(text) {
  if (!text) return 0;
  const match = text.match(/\$?([\d,.]+)/);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''));
  }
  return 0;
}

// Parse result from text or container classes
function parseResult(text, container = null) {
  if (text) {
    const lower = text.toLowerCase();
    if (lower.includes('won') || lower.includes('win')) return 'win';
    if (lower.includes('lost') || lower.includes('loss')) return 'loss';
    if (lower.includes('push') || lower.includes('void')) return 'push';
  }

  // Check container classes
  if (container) {
    const classes = container.className.toLowerCase();
    if (classes.includes('won') || classes.includes('win')) return 'win';
    if (classes.includes('lost') || classes.includes('loss')) return 'loss';
    if (classes.includes('push')) return 'push';
  }

  return 'pending';
}

// Detect sport from matchup text
function detectSport(matchup, container = null) {
  const text = (matchup || '').toLowerCase();

  // Check for sport indicators
  if (text.match(/lakers|celtics|warriors|nba|basketball/i)) return 'NBA';
  if (text.match(/chiefs|eagles|nfl|football|patriots/i)) return 'NFL';
  if (text.match(/yankees|dodgers|mlb|baseball/i)) return 'MLB';
  if (text.match(/rangers|bruins|nhl|hockey/i)) return 'NHL';
  if (text.match(/duke|kentucky|ncaa|college/i)) return 'NCAAB';
  if (text.match(/ufc|mma|fight night/i)) return 'UFC';
  if (text.match(/premier league|la liga|soccer|fc\b/i)) return 'Soccer';

  // Check container for sport indicator
  if (container) {
    const containerText = container.textContent.toLowerCase();
    if (containerText.includes('nba') || containerText.includes('basketball')) return 'NBA';
    if (containerText.includes('nfl') || containerText.includes('football')) return 'NFL';
    if (containerText.includes('mlb') || containerText.includes('baseball')) return 'MLB';
  }

  return 'Other';
}

// Detect bet type from description
function detectBetType(description, container = null) {
  const text = (description || '').toLowerCase();

  if (text.match(/spread|[+-]\d+\.?\d*/)) return 'Spread';
  if (text.match(/money\s?line|ml\b|to win/i)) return 'Moneyline';
  if (text.match(/over|under|o\/u|total/i)) return 'Total';
  if (text.match(/points|rebounds|assists|yards|touchdowns|strikeouts/i)) return 'Player Prop';
  if (text.match(/parlay/i)) return 'Parlay';
  if (text.match(/teaser/i)) return 'Teaser';
  if (text.match(/first|last|anytime|scorer/i)) return 'Game Prop';

  return 'Other';
}

// Run when DOM is ready
async function onPageReady() {
  console.log('LockTracker: Page ready, FanDuel detected');

  // Wait a bit for the page to fully render
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Notify background script that we're on a sportsbook page
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'pageLoaded',
      site: 'FanDuel'
    });

    if (response && response.autoSync) {
      console.log('LockTracker: Pro user - starting auto-sync');
      // Scrape bets and send to background for syncing
      const bets = scrapeBets();
      if (bets.length > 0) {
        const syncResult = await chrome.runtime.sendMessage({
          action: 'autoSyncBets',
          bets: bets
        });
        console.log('LockTracker: Auto-sync result:', syncResult);
      } else {
        console.log('LockTracker: No bets found to auto-sync');
      }
    } else {
      console.log('LockTracker: Auto-sync not triggered:', response?.reason || 'unknown');
    }
  } catch (e) {
    console.log('LockTracker: Could not communicate with background:', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onPageReady);
} else {
  onPageReady();
}
