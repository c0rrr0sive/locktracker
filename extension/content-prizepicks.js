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
    // PrizePicks entry cards - found via testing on real site
    // Cards have class containing "border-soFresh-130"
    const entryContainers = document.querySelectorAll('[class*="border-soFresh-130"]');

    console.log(`LockTracker: Found ${entryContainers.length} PrizePicks entry cards`);

    entryContainers.forEach((container, index) => {
      try {
        const bet = extractEntryFromCard(container);
        if (bet) {
          bets.push(bet);
          console.log(`LockTracker: Extracted entry ${index + 1}:`, bet);
        }
      } catch (e) {
        console.error(`LockTracker: Error extracting entry ${index + 1}:`, e);
      }
    });

    // Fallback: try alternative selectors if main one didn't work
    if (bets.length === 0) {
      console.log('LockTracker: Trying fallback selectors...');
      const fallbackContainers = document.querySelectorAll('[class*="soFresh"], [class*="lineup"], [class*="entry"]');

      fallbackContainers.forEach((container, index) => {
        try {
          const bet = extractEntryFromCard(container);
          if (bet) {
            bets.push(bet);
          }
        } catch (e) {
          console.error(`LockTracker: Fallback error ${index + 1}:`, e);
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

// Extract entry data from a PrizePicks card
// Format: "4-Pick $120.00\n\n$40.00 Power Play\n\nPlayer Names\n\nWin"
function extractEntryFromCard(container) {
  const text = container.innerText || container.textContent || '';

  if (!text.trim()) return null;

  console.log('LockTracker: Parsing card text:', text.substring(0, 100));

  // Parse the text format:
  // Line 1: "4-Pick $120.00" (legs and payout)
  // Line 2: "$40.00 Power Play" or "$10.00 Flex Play" (amount and type)
  // Line 3: Player names
  // Line 4: "Win" or "Loss"

  // Extract number of picks/legs
  const legsMatch = text.match(/(\d+)-Pick/i);
  const legs = legsMatch ? parseInt(legsMatch[1]) : 1;

  // Extract payout (first dollar amount after X-Pick)
  const payoutMatch = text.match(/\d+-Pick\s+\$([\d,.]+)/i);
  const payout = payoutMatch ? parseFloat(payoutMatch[1].replace(/,/g, '')) : 0;

  // Extract entry amount (dollar amount before "Play")
  const amountMatch = text.match(/\$([\d,.]+)\s+(Power|Flex|Standard)?\s*Play/i);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

  // Extract play type
  const playTypeMatch = text.match(/(Power|Flex|Standard)\s*Play/i);
  const playType = playTypeMatch ? playTypeMatch[1] + ' Play' : 'Entry';

  // Extract result
  const result = parseResult(text);

  // Extract player names (look for comma-separated names or line with names)
  const lines = text.split('\n').filter(line => line.trim());
  let playerNames = '';

  for (const line of lines) {
    // Skip lines that are clearly not player names
    if (line.match(/^\d+-Pick/i)) continue;
    if (line.match(/\$[\d,.]+/)) continue;
    if (line.match(/^(Win|Loss|Won|Lost|Pending|Live)$/i)) continue;

    // This is likely the player names line
    if (line.trim().length > 3 && !line.match(/Play$/i)) {
      playerNames = line.trim();
      break;
    }
  }

  // Build bet description
  let betDescription = '';
  if (playerNames) {
    betDescription = `${playerNames} (${legs}-Pick ${playType})`;
  } else {
    betDescription = `${legs}-Pick ${playType}`;
  }

  // Only return if we have meaningful data
  if (legs > 0 && (amount > 0 || payout > 0)) {
    // Calculate profit
    let profit = 0;
    if (result === 'win') {
      profit = payout - amount;
    } else if (result === 'loss') {
      profit = -amount;
    }

    return {
      source: 'prizepicks',
      sport: detectSport(text),
      matchup: 'PrizePicks Entry',
      bet_type: `${legs}-Pick ${playType}`,
      bet_description: betDescription,
      odds: calculatePrizePicksOdds(legs, playType),
      amount: amount,
      result: result,
      profit: profit,
      scraped_at: new Date().toISOString()
    };
  }

  return null;
}

// Parse result from text
function parseResult(text) {
  const lower = (text || '').toLowerCase();

  if (lower.includes('win') || lower.includes('won') || lower.includes('hit') || lower.includes('cashed')) {
    return 'win';
  }
  if (lower.includes('loss') || lower.includes('lost') || lower.includes('miss')) {
    return 'loss';
  }
  if (lower.includes('push') || lower.includes('refund') || lower.includes('void')) {
    return 'push';
  }
  if (lower.includes('live') || lower.includes('active') || lower.includes('pending') || lower.includes('in progress')) {
    return 'pending';
  }

  return 'pending';
}

// Calculate approximate odds based on PrizePicks payout structure
function calculatePrizePicksOdds(legs, playType = 'Power') {
  // Power Play payouts (all must hit)
  const powerPayouts = {
    2: 300,   // 3x
    3: 500,   // 5x
    4: 900,   // 10x
    5: 1900,  // 20x
    6: 3900   // 40x
  };

  // Flex Play payouts (can miss some)
  const flexPayouts = {
    3: 125,   // 2.25x (all hit)
    4: 150,   // 2.5x (all hit)
    5: 200,   // 3x (all hit)
    6: 250    // 3.5x (all hit)
  };

  if (playType && playType.toLowerCase().includes('flex')) {
    return flexPayouts[legs] || 150;
  }

  return powerPayouts[legs] || 300;
}

// Detect sport from text content
function detectSport(text) {
  const lower = (text || '').toLowerCase();

  // UFC/MMA fighters and terms
  if (lower.match(/ufc|mma|fight|knockout|submission|aspinall|volkov|dern|adesanya|pereira|o'malley|chimaev/i)) return 'UFC';

  // NBA players and terms
  if (lower.match(/lebron|curry|durant|giannis|luka|jokic|tatum|points|rebounds|assists|nba|lakers|celtics|warriors/i)) return 'NBA';

  // NFL players and terms
  if (lower.match(/mahomes|allen|hurts|rushing|passing|receiving|touchdowns|nfl|yards|chiefs|eagles/i)) return 'NFL';

  // MLB players and terms
  if (lower.match(/ohtani|judge|soto|strikeouts|hits|home runs|mlb|pitcher|batter|yankees|dodgers/i)) return 'MLB';

  // NHL players and terms
  if (lower.match(/mcdavid|ovechkin|goals|saves|nhl|hockey|rangers|bruins/i)) return 'NHL';

  // Soccer players and terms
  if (lower.match(/messi|ronaldo|haaland|mbappe|shots|soccer|premier|goal|manchester|liverpool/i)) return 'Soccer';

  // Esports
  if (lower.match(/esports|league of legends|csgo|valorant|kills|gaming/i)) return 'Esports';

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
