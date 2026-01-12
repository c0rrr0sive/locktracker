// LockTracker - PrizePicks Content Script
// This script runs on PrizePicks and scrapes entry history

console.log('LockTracker: PrizePicks content script loaded');

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
  console.log('LockTracker: Scraping PrizePicks entries...');
  const bets = [];

  try {
    // PrizePicks entry containers - look for entry cards in "My Entries" section
    const entryContainers = document.querySelectorAll(
      '[class*="entry-card"], [class*="EntryCard"], [class*="entry-item"], ' +
      '[class*="settled-entry"], [class*="history-entry"], [class*="slip-card"], ' +
      '.entry-card, .entry-item, [data-testid*="entry"]'
    );

    console.log(`LockTracker: Found ${entryContainers.length} potential entry containers`);

    entryContainers.forEach((container, index) => {
      try {
        const bet = extractEntryFromContainer(container);
        if (bet) {
          bets.push(bet);
          console.log(`LockTracker: Extracted entry ${index + 1}:`, bet);
        }
      } catch (e) {
        console.error(`LockTracker: Error extracting entry ${index + 1}:`, e);
      }
    });

    // Alternative: Look for list items or card-like structures
    if (bets.length === 0) {
      const altContainers = document.querySelectorAll(
        '[class*="pick"], [class*="Pick"], [class*="wager"], ' +
        '[class*="board"] li, [class*="list"] > div'
      );
      console.log(`LockTracker: Trying alternative selectors, found ${altContainers.length}`);

      altContainers.forEach((container, index) => {
        try {
          const bet = extractEntryFromContainer(container);
          if (bet) {
            bets.push(bet);
          }
        } catch (e) {
          console.error(`LockTracker: Error with alt container ${index + 1}:`, e);
        }
      });
    }

  } catch (error) {
    console.error('LockTracker: Scraping error:', error);
  }

  console.log(`LockTracker: Total entries scraped: ${bets.length}`);
  scrapedBets = bets;
  return bets;
}

// Extract entry data from a container
function extractEntryFromContainer(container) {
  const getText = (selectors) => {
    for (const selector of selectors) {
      const el = container.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return null;
  };

  // Look for player name(s) - PrizePicks is all player props
  const playerName = getText([
    '.player-name',
    '[class*="player"]',
    '[class*="Player"]',
    '[class*="name"]',
    'h3', 'h4'
  ]);

  // Look for the stat type (Points, Rebounds, etc.)
  const statType = getText([
    '.stat-type',
    '[class*="stat"]',
    '[class*="Stat"]',
    '[class*="category"]',
    '[class*="prop"]'
  ]);

  // Look for the line (Over/Under value)
  const lineText = getText([
    '.line',
    '[class*="line"]',
    '[class*="Line"]',
    '[class*="projection"]',
    '[class*="value"]'
  ]);

  // Look for Over/Under pick
  const pickDirection = getText([
    '.pick-direction',
    '[class*="over"]',
    '[class*="under"]',
    '[class*="direction"]',
    '[class*="pick-type"]'
  ]) || detectOverUnder(container);

  // Look for entry amount
  const amountText = getText([
    '.entry-amount',
    '[class*="amount"]',
    '[class*="entry"]',
    '[class*="wager"]',
    '[class*="stake"]'
  ]);
  const amount = parseAmount(amountText);

  // Look for payout/winnings
  const payoutText = getText([
    '.payout',
    '[class*="payout"]',
    '[class*="Payout"]',
    '[class*="winnings"]',
    '[class*="return"]',
    '[class*="prize"]'
  ]);
  const payout = parseAmount(payoutText);

  // Look for result
  const resultText = getText([
    '.result',
    '.status',
    '[class*="result"]',
    '[class*="status"]',
    '[class*="outcome"]'
  ]);
  const result = parseResult(resultText, container);

  // Look for number of legs/picks
  const legsText = getText([
    '.legs',
    '[class*="leg"]',
    '[class*="pick-count"]',
    '[class*="combo"]'
  ]);
  const legs = parseLegs(legsText);

  // Build bet description
  let betDescription = '';
  if (playerName && statType) {
    const direction = pickDirection || 'Over';
    betDescription = `${playerName} ${direction} ${lineText || ''} ${statType}`.trim();
  } else if (playerName) {
    betDescription = playerName;
  } else {
    betDescription = getText(['p', 'span', 'div']) || 'PrizePicks Entry';
  }

  // Detect sport from player/content
  const sport = detectSport(container.textContent);

  // Determine bet type based on legs
  const betType = legs > 1 ? `${legs}-Pick Entry` : 'Player Prop';

  if (betDescription && betDescription !== 'PrizePicks Entry') {
    return {
      source: 'prizepicks',
      sport: sport,
      matchup: 'PrizePicks Entry',
      bet_type: betType,
      bet_description: betDescription,
      odds: calculatePrizePicksOdds(legs),
      amount: amount || 0,
      result: result,
      profit: result === 'win' ? (payout - amount) : (result === 'loss' ? -amount : 0),
      scraped_at: new Date().toISOString()
    };
  }

  return null;
}

// Detect Over/Under from container
function detectOverUnder(container) {
  const text = container.textContent.toLowerCase();
  if (text.includes('over') || text.includes('more')) return 'Over';
  if (text.includes('under') || text.includes('less')) return 'Under';
  return null;
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

// Parse number of legs
function parseLegs(text) {
  if (!text) return 1;
  const match = text.match(/(\d+)/);
  if (match) {
    return parseInt(match[1]);
  }
  return 1;
}

// Parse result from text or container classes
function parseResult(text, container = null) {
  if (text) {
    const lower = text.toLowerCase();
    if (lower.includes('won') || lower.includes('win') || lower.includes('hit') || lower.includes('cashed')) return 'win';
    if (lower.includes('lost') || lower.includes('loss') || lower.includes('miss')) return 'loss';
    if (lower.includes('push') || lower.includes('refund') || lower.includes('void')) return 'push';
    if (lower.includes('live') || lower.includes('active') || lower.includes('pending')) return 'pending';
  }

  if (container) {
    const classes = container.className.toLowerCase();
    const text = container.textContent.toLowerCase();
    if (classes.includes('won') || classes.includes('win') || classes.includes('hit') || text.includes('cashed')) return 'win';
    if (classes.includes('lost') || classes.includes('loss') || classes.includes('miss')) return 'loss';
    if (classes.includes('push') || classes.includes('refund')) return 'push';
  }

  return 'pending';
}

// Calculate approximate odds based on PrizePicks payout structure
function calculatePrizePicksOdds(legs) {
  // PrizePicks payout multipliers (approximate American odds)
  const payouts = {
    2: 300,   // 3x payout = +300
    3: 500,   // 5x payout = +500  (or 2.25x flex)
    4: 1000,  // 10x payout = +1000
    5: 2000,  // 20x payout = +2000
    6: 4000   // 40x payout = +4000
  };
  return payouts[legs] || 300;
}

// Detect sport from text content
function detectSport(text) {
  const lower = (text || '').toLowerCase();

  // NBA players
  if (lower.match(/lebron|curry|durant|giannis|luka|jokic|tatum|points|rebounds|assists|nba/)) return 'NBA';
  // NFL players
  if (lower.match(/mahomes|allen|hurts|rushing|passing|receiving|touchdowns|nfl|yards/)) return 'NFL';
  // MLB players
  if (lower.match(/ohtani|judge|soto|strikeouts|hits|home runs|mlb|pitcher|batter/)) return 'MLB';
  // NHL players
  if (lower.match(/mcdavid|ovechkin|goals|saves|nhl|hockey/)) return 'NHL';
  // Soccer
  if (lower.match(/messi|ronaldo|haaland|mbappe|shots|soccer|premier|goal/)) return 'Soccer';
  // UFC
  if (lower.match(/ufc|mma|fight|knockout|submission/)) return 'UFC';
  // Esports (PrizePicks has this)
  if (lower.match(/esports|league of legends|csgo|valorant|kills|gaming/)) return 'Esports';

  return 'Other';
}

// Run when DOM is ready
function onPageReady() {
  console.log('LockTracker: Page ready, PrizePicks detected');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onPageReady);
} else {
  onPageReady();
}
