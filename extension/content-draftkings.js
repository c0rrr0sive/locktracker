// LockTracker - DraftKings Content Script
// This script runs on DraftKings sportsbook pages and scrapes bet history

console.log('LockTracker: DraftKings content script loaded');

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
  console.log('LockTracker: Scraping DraftKings bets...');
  const bets = [];

  try {
    // DraftKings bet history structure - includes mock page selectors and real site patterns
    const betContainers = document.querySelectorAll('[class*="bet-card"], [class*="BetCard"], [class*="settled"], .history-item, .bet-slip-card, [class*="wager-item"], [class*="bet-history"]');

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

  // Look for matchup/event name
  const matchup = getText([
    '.game-name',
    '.EventName',
    '[class*="event"]',
    '[class*="matchup"]',
    '[class*="game-name"]',
    '[class*="EventName"]',
    'h3', 'h4'
  ]) || 'Unknown Matchup';

  // Look for bet selection
  const betDescription = getText([
    '.selection',
    '.Selection',
    '[class*="selection"]',
    '[class*="outcome"]',
    '[class*="pick"]',
    '[class*="Selection"]'
  ]) || getText(['p', 'span']);

  // Look for odds
  const oddsText = getText([
    '.price',
    '.american-odds',
    '[class*="odds"]',
    '[class*="price"]',
    '[class*="american"]'
  ]);
  const odds = parseOdds(oddsText);

  // Look for stake
  const stakeText = getText([
    '.risk',
    '.wager',
    '[class*="stake"]',
    '[class*="wager"]',
    '[class*="risk"]'
  ]);
  const amount = parseAmount(stakeText);

  // Look for result
  const resultText = getText([
    '.outcome-status',
    '[class*="result"]',
    '[class*="status"]',
    '[class*="outcome-status"]'
  ]);
  const result = parseResult(resultText, container);

  // Look for profit
  const profitText = getText([
    '.payout',
    '.winnings',
    '[class*="return"]',
    '[class*="profit"]',
    '[class*="payout"]',
    '[class*="winnings"]'
  ]);
  const profit = parseAmount(profitText);

  const sport = detectSport(matchup, container);
  const betType = detectBetType(betDescription, container);

  if (betDescription || matchup !== 'Unknown Matchup') {
    return {
      source: 'draftkings',
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
      source: 'draftkings',
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

  if (text.match(/lakers|celtics|warriors|nba|basketball/i)) return 'NBA';
  if (text.match(/chiefs|eagles|nfl|football|patriots/i)) return 'NFL';
  if (text.match(/yankees|dodgers|mlb|baseball/i)) return 'MLB';
  if (text.match(/rangers|bruins|nhl|hockey/i)) return 'NHL';
  if (text.match(/duke|kentucky|ncaa|college/i)) return 'NCAAB';
  if (text.match(/ufc|mma|fight night/i)) return 'UFC';
  if (text.match(/premier league|la liga|soccer|fc\b/i)) return 'Soccer';

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
function onPageReady() {
  console.log('LockTracker: Page ready, DraftKings detected');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onPageReady);
} else {
  onPageReady();
}
