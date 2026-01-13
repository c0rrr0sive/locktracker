"""
LockTracker - With User Accounts
A web app to track your sports bets with user authentication via Supabase.
"""

from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from flask_cors import CORS
from supabase import create_client
from datetime import datetime
from functools import wraps
import os

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'bet-tracker-dev-key-change-in-production')

# Enable CORS for API routes (so extension can communicate)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

# Supabase configuration (MUST be set via environment variables)
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

if not all([SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY]):
    raise ValueError("Missing Supabase environment variables. Set SUPABASE_URL, SUPABASE_KEY, and SUPABASE_SERVICE_KEY.")

# Public client for auth
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
# Service client for server-side operations (bypasses RLS)
supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Free tier limit
FREE_TIER_MONTHLY_LIMIT = 15

# ==============================================
# AUTHENTICATION HELPERS
# ==============================================

def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def get_current_user():
    """Get the current logged-in user from session"""
    return session.get('user')

# ==============================================
# AUTHENTICATION ROUTES
# ==============================================

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    """Sign up page"""
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']

        try:
            response = supabase.auth.sign_up({
                'email': email,
                'password': password
            })

            if response.user:
                # Auto-login after signup
                session['user'] = {
                    'id': response.user.id,
                    'email': response.user.email
                }
                session['access_token'] = response.session.access_token
                return redirect(url_for('index'))
            else:
                return render_template('signup.html', error='Signup failed. Please try again.')

        except Exception as e:
            error_msg = str(e)
            if 'already registered' in error_msg.lower():
                error_msg = 'This email is already registered. Try logging in.'
            return render_template('signup.html', error=error_msg)

    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Login page"""
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']

        try:
            response = supabase.auth.sign_in_with_password({
                'email': email,
                'password': password
            })

            if response.user:
                session['user'] = {
                    'id': response.user.id,
                    'email': response.user.email
                }
                session['access_token'] = response.session.access_token
                return redirect(url_for('index'))
            else:
                return render_template('login.html', error='Invalid email or password.')

        except Exception as e:
            return render_template('login.html', error='Invalid email or password.')

    return render_template('login.html')

@app.route('/logout')
def logout():
    """Logout"""
    try:
        supabase.auth.sign_out()
    except:
        pass
    session.clear()
    return redirect(url_for('login'))

# ==============================================
# HELPER FUNCTIONS
# ==============================================

def calculate_profit(odds, amount, result):
    """Calculate profit based on American odds"""
    if result == 'win':
        if odds > 0:
            return amount * (odds / 100)
        else:
            return amount * (100 / abs(odds))
    elif result == 'loss':
        return -amount
    else:  # pending or push
        return 0

def get_user_bets(user_id):
    """Get all bets for a user"""
    try:
        response = supabase_admin.table('bets').select('*').eq('user_id', user_id).order('created_at', desc=True).execute()
        return response.data
    except Exception as e:
        print(f"Error fetching bets: {e}")
        return []

def get_monthly_bet_count(user_id):
    """Count how many bets user has added this month"""
    try:
        # Get first day of current month
        today = datetime.now()
        first_of_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        response = supabase_admin.table('bets').select('id', count='exact').eq('user_id', user_id).gte('created_at', first_of_month.isoformat()).execute()
        return response.count or 0
    except Exception as e:
        print(f"Error counting monthly bets: {e}")
        return 0

def get_user_tier(user_id):
    """Check if user is on free or paid tier (for now, everyone is free)"""
    # TODO: Implement Stripe subscription checking
    return 'free'

def can_add_bets(user_id, count=1):
    """Check if user can add more bets based on their tier"""
    tier = get_user_tier(user_id)
    if tier == 'paid':
        return True, FREE_TIER_MONTHLY_LIMIT, 0  # Unlimited for paid users

    monthly_count = get_monthly_bet_count(user_id)
    remaining = FREE_TIER_MONTHLY_LIMIT - monthly_count
    can_add = remaining >= count
    return can_add, FREE_TIER_MONTHLY_LIMIT, monthly_count

def get_stats(user_id):
    """Calculate overall betting stats for a user"""
    bets = get_user_bets(user_id)
    settled_bets = [b for b in bets if b['result'] != 'pending']

    if not settled_bets:
        return {
            'total_bets': 0,
            'wins': 0,
            'losses': 0,
            'pushes': 0,
            'win_rate': 0,
            'total_wagered': 0,
            'total_profit': 0,
            'roi': 0
        }

    wins = sum(1 for b in settled_bets if b['result'] == 'win')
    losses = sum(1 for b in settled_bets if b['result'] == 'loss')
    pushes = sum(1 for b in settled_bets if b['result'] == 'push')
    total_wagered = sum(b['amount'] for b in settled_bets)
    total_profit = sum(b['profit'] for b in settled_bets)

    win_rate = (wins / (wins + losses) * 100) if (wins + losses) > 0 else 0
    roi = (total_profit / total_wagered * 100) if total_wagered > 0 else 0

    return {
        'total_bets': len(settled_bets),
        'wins': wins,
        'losses': losses,
        'pushes': pushes,
        'win_rate': round(win_rate, 1),
        'total_wagered': round(total_wagered, 2),
        'total_profit': round(total_profit, 2),
        'roi': round(roi, 1)
    }

def get_stats_by_category(user_id):
    """Get profit breakdown by sport and bet type"""
    bets = get_user_bets(user_id)
    settled_bets = [b for b in bets if b['result'] != 'pending']

    # By sport
    sports = {}
    for bet in settled_bets:
        sport = bet['sport']
        if sport not in sports:
            sports[sport] = {'profit': 0, 'count': 0, 'wins': 0}
        sports[sport]['profit'] += bet['profit']
        sports[sport]['count'] += 1
        if bet['result'] == 'win':
            sports[sport]['wins'] += 1

    # By bet type
    bet_types = {}
    for bet in settled_bets:
        bt = bet['bet_type']
        if bt not in bet_types:
            bet_types[bt] = {'profit': 0, 'count': 0, 'wins': 0}
        bet_types[bt]['profit'] += bet['profit']
        bet_types[bt]['count'] += 1
        if bet['result'] == 'win':
            bet_types[bt]['wins'] += 1

    return {
        'by_sport': sports,
        'by_bet_type': bet_types
    }

# ==============================================
# MAIN ROUTES
# ==============================================

@app.route('/')
@login_required
def index():
    """Main page - show dashboard and recent bets"""
    user = get_current_user()
    bets = get_user_bets(user['id'])
    pending_bets = [b for b in bets if b['result'] == 'pending']

    stats = get_stats(user['id'])
    category_stats = get_stats_by_category(user['id'])

    # Get usage info for free tier
    can_add, limit, monthly_count = can_add_bets(user['id'])
    tier = get_user_tier(user['id'])

    usage = {
        'monthly_count': monthly_count,
        'monthly_limit': limit,
        'remaining': limit - monthly_count,
        'tier': tier,
        'at_limit': not can_add
    }

    # Check for limit error from redirect
    error = request.args.get('error')

    return render_template('index.html',
                         bets=bets,
                         pending_bets=pending_bets,
                         stats=stats,
                         category_stats=category_stats,
                         user=user,
                         usage=usage,
                         error=error)

@app.route('/add', methods=['POST'])
@login_required
def add_bet():
    """Add a new bet"""
    user = get_current_user()

    # Check if user can add more bets
    can_add, limit, current_count = can_add_bets(user['id'])
    if not can_add:
        # Redirect back with error (could use flash messages for better UX)
        return redirect(url_for('index', error='limit_reached'))

    date = request.form.get('date', datetime.now().strftime('%Y-%m-%d'))
    sport = request.form['sport']
    matchup = request.form['matchup']
    bet_type = request.form['bet_type']
    bet_description = request.form['bet_description']
    odds = int(request.form['odds'])
    amount = float(request.form['amount'])
    sportsbook = request.form.get('sportsbook', '')

    try:
        supabase_admin.table('bets').insert({
            'user_id': user['id'],
            'date': date,
            'sport': sport,
            'matchup': matchup,
            'bet_type': bet_type,
            'bet_description': bet_description,
            'odds': odds,
            'amount': amount,
            'sportsbook': sportsbook,
            'result': 'pending',
            'profit': 0
        }).execute()
    except Exception as e:
        print(f"Error adding bet: {e}")

    return redirect(url_for('index'))

@app.route('/update/<int:bet_id>', methods=['POST'])
@login_required
def update_bet(bet_id):
    """Update a bet's result"""
    user = get_current_user()
    result = request.form['result']

    try:
        # Get the bet first
        response = supabase_admin.table('bets').select('*').eq('id', bet_id).eq('user_id', user['id']).execute()

        if response.data:
            bet = response.data[0]
            profit = calculate_profit(bet['odds'], bet['amount'], result)

            supabase_admin.table('bets').update({
                'result': result,
                'profit': profit
            }).eq('id', bet_id).eq('user_id', user['id']).execute()
    except Exception as e:
        print(f"Error updating bet: {e}")

    return redirect(url_for('index'))

@app.route('/delete/<int:bet_id>', methods=['POST'])
@login_required
def delete_bet(bet_id):
    """Delete a bet"""
    user = get_current_user()

    try:
        supabase_admin.table('bets').delete().eq('id', bet_id).eq('user_id', user['id']).execute()
    except Exception as e:
        print(f"Error deleting bet: {e}")

    return redirect(url_for('index'))

# ==============================================
# API ENDPOINTS (for browser extension)
# ==============================================

@app.route('/api/import', methods=['POST'])
def import_bets():
    """Import bets from the browser extension"""
    try:
        data = request.get_json()
        bets = data.get('bets', [])
        user_token = data.get('access_token')  # Extension sends user's token

        # Verify user from token
        if user_token:
            try:
                user_response = supabase.auth.get_user(user_token)
                user_id = user_response.user.id
            except:
                return jsonify({'success': False, 'error': 'Invalid or expired token. Please log in again.'})
        else:
            return jsonify({'success': False, 'error': 'No authentication token. Please log in to the web app first.'})

        if not bets:
            return jsonify({'success': False, 'error': 'No bets provided'})

        # Check free tier limit
        can_add, limit, current_count = can_add_bets(user_id, count=1)
        remaining = limit - current_count

        if not can_add:
            return jsonify({
                'success': False,
                'error': f'Monthly limit reached ({limit} bets). Upgrade to Pro for unlimited bets!',
                'limit_reached': True,
                'monthly_used': current_count,
                'monthly_limit': limit
            })

        imported_count = 0

        for bet in bets:
            # Check if we've hit the limit during import
            if imported_count >= remaining:
                break
            # Check for duplicates (use admin client to bypass RLS)
            existing = supabase_admin.table('bets').select('id').eq('user_id', user_id).eq('matchup', bet.get('matchup', '')).eq('bet_description', bet.get('bet_description', '')).eq('amount', bet.get('amount', 0)).execute()

            if existing.data:
                continue  # Skip duplicate

            # Determine sportsbook from source
            sportsbook = bet.get('source', '').title()
            if sportsbook == 'Fanduel':
                sportsbook = 'FanDuel'
            elif sportsbook == 'Draftkings':
                sportsbook = 'DraftKings'
            elif sportsbook == 'Prizepicks':
                sportsbook = 'PrizePicks'

            # Get result and profit
            result = bet.get('result', 'pending')
            profit = 0
            if result in ['win', 'loss']:
                # Use scraped profit if provided (important for PrizePicks Flex plays with partial wins)
                if 'profit' in bet and bet['profit'] != 0:
                    profit = bet['profit']
                else:
                    # Fallback: calculate from odds
                    profit = calculate_profit(
                        bet.get('odds', -110),
                        bet.get('amount', 0),
                        result
                    )

            # Insert the bet (use admin client to bypass RLS)
            supabase_admin.table('bets').insert({
                'user_id': user_id,
                'date': datetime.now().strftime('%Y-%m-%d'),
                'sport': bet.get('sport', 'Other'),
                'matchup': bet.get('matchup', 'Unknown'),
                'bet_type': bet.get('bet_type', 'Other'),
                'bet_description': bet.get('bet_description', 'Unknown'),
                'odds': bet.get('odds', -110),
                'amount': bet.get('amount', 0),
                'result': result,
                'profit': profit,
                'sportsbook': sportsbook
            }).execute()
            imported_count += 1

        # Calculate how many were skipped due to limit
        skipped_due_to_limit = max(0, len(bets) - imported_count - (len(bets) - remaining if remaining < len(bets) else 0))
        new_count = current_count + imported_count

        response_data = {
            'success': True,
            'imported': imported_count,
            'message': f'Successfully imported {imported_count} bets',
            'monthly_used': new_count,
            'monthly_limit': limit
        }

        if imported_count < len(bets) and new_count >= limit:
            response_data['warning'] = f'Some bets were not imported due to monthly limit ({limit}). Upgrade to Pro for unlimited!'

        return jsonify(response_data)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    """Check if user is logged in (for extension)"""
    if 'user' in session and 'access_token' in session:
        return jsonify({
            'logged_in': True,
            'user': session['user'],
            'access_token': session['access_token']
        })
    return jsonify({'logged_in': False})

@app.route('/api/stats', methods=['GET'])
def api_stats():
    """Get stats as JSON (for extension)"""
    if 'user' not in session:
        return jsonify({'error': 'Not logged in'})

    user = get_current_user()
    return jsonify(get_stats(user['id']))

if __name__ == '__main__':
    print("=" * 50)
    print("LOCKTRACKER - Starting up!")
    print("=" * 50)
    print("\nOpen your browser and go to: http://127.0.0.1:5000")
    print("\nPress Ctrl+C to stop the server\n")
    # Use debug=True only in development
    debug_mode = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
