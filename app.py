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
import stripe

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

# Stripe configuration
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET')
STRIPE_PRICE_ID = os.environ.get('STRIPE_PRICE_ID')  # Pro subscription price ID

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY
else:
    print("WARNING: STRIPE_SECRET_KEY not set. Stripe payments will not work.")

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
                return redirect(url_for('dashboard'))
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
                return redirect(url_for('dashboard'))
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

@app.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    """Forgot password page - sends reset email"""
    if request.method == 'POST':
        email = request.form['email']

        try:
            # Get the base URL for the reset link
            base_url = request.host_url.rstrip('/')
            redirect_url = f"{base_url}/reset-password"

            # Send password reset email via Supabase
            supabase.auth.reset_password_for_email(
                email,
                {"redirect_to": redirect_url}
            )

            # Always show success message (don't reveal if email exists)
            return render_template('forgot_password.html',
                                 success=True,
                                 message='If an account exists with this email, you will receive a password reset link.')

        except Exception as e:
            print(f"Password reset error: {e}")
            # Still show success to prevent email enumeration
            return render_template('forgot_password.html',
                                 success=True,
                                 message='If an account exists with this email, you will receive a password reset link.')

    return render_template('forgot_password.html')

@app.route('/reset-password', methods=['GET', 'POST'])
def reset_password():
    """Reset password page - user sets new password after clicking email link"""
    if request.method == 'POST':
        password = request.form['password']
        access_token = request.form.get('access_token')

        if not access_token:
            return render_template('reset_password.html', error='Invalid or expired reset link. Please request a new one.')

        try:
            # Use the access token to update the password
            # First, set the session with the token from the URL
            supabase.auth.set_session(access_token, request.form.get('refresh_token', ''))

            # Now update the password
            supabase.auth.update_user({"password": password})

            return render_template('reset_password.html',
                                 success=True,
                                 message='Password updated successfully! You can now log in with your new password.')

        except Exception as e:
            print(f"Password update error: {e}")
            return render_template('reset_password.html',
                                 error='Could not update password. The reset link may have expired. Please request a new one.')

    # GET request - check for tokens in URL (Supabase sends them as hash fragments)
    # The tokens come as URL fragments (#access_token=...) which we handle in JavaScript
    return render_template('reset_password.html')

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
    """Check if user is on free or paid tier"""
    try:
        # Check subscriptions table for active subscription
        response = supabase_admin.table('subscriptions').select('*').eq('user_id', user_id).eq('status', 'active').execute()
        if response.data and len(response.data) > 0:
            return 'paid'
    except Exception as e:
        # Table might not exist yet, that's ok
        print(f"Error checking subscription: {e}")
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
def home():
    """Landing page or dashboard based on login status"""
    if 'user' in session:
        return redirect(url_for('dashboard'))
    return render_template('landing.html')

@app.route('/landing')
def landing():
    """Always show landing page (for previewing while logged in)"""
    return render_template('landing.html')

@app.route('/dashboard')
@login_required
def dashboard():
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

    return redirect(url_for('dashboard'))

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

    return redirect(url_for('dashboard'))

@app.route('/delete/<int:bet_id>', methods=['POST'])
@login_required
def delete_bet(bet_id):
    """Delete a bet"""
    user = get_current_user()

    try:
        supabase_admin.table('bets').delete().eq('id', bet_id).eq('user_id', user['id']).execute()
    except Exception as e:
        print(f"Error deleting bet: {e}")

    return redirect(url_for('dashboard'))

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

@app.route('/api/usage', methods=['POST'])
def api_usage():
    """Get user's usage info (for extension to know remaining bets)"""
    try:
        data = request.get_json()
        user_token = data.get('access_token')

        if not user_token:
            return jsonify({'success': False, 'error': 'No authentication token'})

        # Verify user from token
        try:
            user_response = supabase.auth.get_user(user_token)
            user_id = user_response.user.id
        except:
            return jsonify({'success': False, 'error': 'Invalid or expired token'})

        # Get usage info
        tier = get_user_tier(user_id)
        monthly_count = get_monthly_bet_count(user_id)
        remaining = FREE_TIER_MONTHLY_LIMIT - monthly_count if tier == 'free' else 999999

        return jsonify({
            'success': True,
            'tier': tier,
            'monthly_count': monthly_count,
            'monthly_limit': FREE_TIER_MONTHLY_LIMIT,
            'remaining': max(0, remaining),
            'at_limit': remaining <= 0 and tier == 'free'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ==============================================
# STRIPE PAYMENT ROUTES
# ==============================================

@app.route('/pricing')
@login_required
def pricing():
    """Pricing page"""
    user = get_current_user()
    tier = get_user_tier(user['id'])
    return render_template('pricing.html', user=user, tier=tier)

@app.route('/privacy')
def privacy():
    """Privacy policy page"""
    return render_template('privacy.html')

@app.route('/checkout', methods=['POST'])
@login_required
def create_checkout_session():
    """Create Stripe checkout session"""
    if not STRIPE_SECRET_KEY or not STRIPE_PRICE_ID:
        return jsonify({'error': 'Stripe not configured'}), 500

    user = get_current_user()

    try:
        # Check if user already has a Stripe customer ID
        existing = supabase_admin.table('subscriptions').select('stripe_customer_id').eq('user_id', user['id']).execute()

        customer_id = None
        if existing.data and existing.data[0].get('stripe_customer_id'):
            customer_id = existing.data[0]['stripe_customer_id']

        # Create checkout session
        checkout_params = {
            'payment_method_types': ['card'],
            'line_items': [{
                'price': STRIPE_PRICE_ID,
                'quantity': 1,
            }],
            'mode': 'subscription',
            'success_url': request.host_url + 'checkout/success?session_id={CHECKOUT_SESSION_ID}',
            'cancel_url': request.host_url + 'checkout/cancel',
            'client_reference_id': user['id'],
            'metadata': {
                'user_id': user['id'],
                'user_email': user['email']
            }
        }

        if customer_id:
            checkout_params['customer'] = customer_id
        else:
            checkout_params['customer_email'] = user['email']

        checkout_session = stripe.checkout.Session.create(**checkout_params)

        return redirect(checkout_session.url)

    except Exception as e:
        print(f"Stripe checkout error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/checkout/success')
@login_required
def checkout_success():
    """Handle successful checkout"""
    session_id = request.args.get('session_id')
    return render_template('checkout_success.html')

@app.route('/checkout/cancel')
@login_required
def checkout_cancel():
    """Handle cancelled checkout"""
    return redirect(url_for('pricing'))

@app.route('/webhook/stripe', methods=['POST'])
def stripe_webhook():
    """Handle Stripe webhooks"""
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature')

    if not STRIPE_WEBHOOK_SECRET:
        print("WARNING: Stripe webhook secret not configured")
        return jsonify({'error': 'Webhook not configured'}), 500

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        print(f"Invalid payload: {e}")
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError as e:
        print(f"Invalid signature: {e}")
        return jsonify({'error': 'Invalid signature'}), 400

    # Handle the event
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        handle_checkout_completed(session)

    elif event['type'] == 'customer.subscription.updated':
        subscription = event['data']['object']
        handle_subscription_updated(subscription)

    elif event['type'] == 'customer.subscription.deleted':
        subscription = event['data']['object']
        handle_subscription_deleted(subscription)

    elif event['type'] == 'invoice.payment_failed':
        invoice = event['data']['object']
        handle_payment_failed(invoice)

    return jsonify({'status': 'success'})

def handle_checkout_completed(session):
    """Handle successful checkout - create/update subscription record"""
    user_id = session.get('client_reference_id') or session.get('metadata', {}).get('user_id')
    customer_id = session.get('customer')
    subscription_id = session.get('subscription')

    if not user_id:
        print("No user_id in checkout session")
        return

    print(f"Checkout completed for user {user_id}")

    try:
        # Check if subscription record exists
        existing = supabase_admin.table('subscriptions').select('id').eq('user_id', user_id).execute()

        subscription_data = {
            'user_id': user_id,
            'stripe_customer_id': customer_id,
            'stripe_subscription_id': subscription_id,
            'status': 'active',
            'updated_at': datetime.now().isoformat()
        }

        if existing.data:
            # Update existing record
            supabase_admin.table('subscriptions').update(subscription_data).eq('user_id', user_id).execute()
        else:
            # Create new record
            subscription_data['created_at'] = datetime.now().isoformat()
            supabase_admin.table('subscriptions').insert(subscription_data).execute()

        print(f"Subscription activated for user {user_id}")

    except Exception as e:
        print(f"Error saving subscription: {e}")

def handle_subscription_updated(subscription):
    """Handle subscription status changes"""
    subscription_id = subscription.get('id')
    status = subscription.get('status')
    customer_id = subscription.get('customer')

    print(f"Subscription {subscription_id} updated to status: {status}")

    try:
        # Map Stripe status to our status
        if status in ['active', 'trialing']:
            our_status = 'active'
        elif status in ['past_due', 'unpaid']:
            our_status = 'past_due'
        else:
            our_status = 'inactive'

        supabase_admin.table('subscriptions').update({
            'status': our_status,
            'updated_at': datetime.now().isoformat()
        }).eq('stripe_subscription_id', subscription_id).execute()

    except Exception as e:
        print(f"Error updating subscription: {e}")

def handle_subscription_deleted(subscription):
    """Handle subscription cancellation"""
    subscription_id = subscription.get('id')

    print(f"Subscription {subscription_id} deleted/cancelled")

    try:
        supabase_admin.table('subscriptions').update({
            'status': 'cancelled',
            'updated_at': datetime.now().isoformat()
        }).eq('stripe_subscription_id', subscription_id).execute()

    except Exception as e:
        print(f"Error cancelling subscription: {e}")

def handle_payment_failed(invoice):
    """Handle failed payment"""
    subscription_id = invoice.get('subscription')
    customer_id = invoice.get('customer')

    print(f"Payment failed for subscription {subscription_id}")

    try:
        supabase_admin.table('subscriptions').update({
            'status': 'past_due',
            'updated_at': datetime.now().isoformat()
        }).eq('stripe_subscription_id', subscription_id).execute()

    except Exception as e:
        print(f"Error updating subscription on payment failure: {e}")

@app.route('/manage-subscription')
@login_required
def manage_subscription():
    """Redirect to Stripe customer portal"""
    if not STRIPE_SECRET_KEY:
        return redirect(url_for('pricing'))

    user = get_current_user()

    try:
        # Get customer ID
        existing = supabase_admin.table('subscriptions').select('stripe_customer_id').eq('user_id', user['id']).execute()

        if not existing.data or not existing.data[0].get('stripe_customer_id'):
            return redirect(url_for('pricing'))

        customer_id = existing.data[0]['stripe_customer_id']

        # Create portal session
        portal_session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=request.host_url
        )

        return redirect(portal_session.url)

    except Exception as e:
        print(f"Portal error: {e}")
        return redirect(url_for('pricing'))

if __name__ == '__main__':
    print("=" * 50)
    print("LOCKTRACKER - Starting up!")
    print("=" * 50)
    print("\nOpen your browser and go to: http://127.0.0.1:5000")
    print("\nPress Ctrl+C to stop the server\n")
    # Use debug=True only in development
    debug_mode = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
