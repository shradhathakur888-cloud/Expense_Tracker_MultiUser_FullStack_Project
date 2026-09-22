import os
import secrets
from datetime import datetime, date, timedelta
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from sqlalchemy import func, or_, and_, desc

from config import Config
from database import setup_database, get_session, get_db_info, test_mysql_connection
from models import Base, User, Account, AccountMember, Category, Transaction
from seed_data import seed_default_categories

# Base paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TEMPLATES_DIR = os.path.join(BASE_DIR, 'templates')
STATIC_DIR = os.path.join(BASE_DIR, 'static')

app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR)
app.config.from_object(Config)
CORS(app)

# In-memory simple token session store (token -> user_id)
SESSION_TOKENS = {}

def get_current_user():
    """Extract user from Authorization header 'Bearer <token>'."""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split(' ')[1].strip()
    user_id = SESSION_TOKENS.get(token)
    if not user_id:
        return None
    session = get_session()
    return session.get(User, user_id)

def login_required(f):
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Unauthorized. Please sign in first.'}), 401
        return f(user, *args, **kwargs)
    decorated_function.__name__ = f.__name__
    return decorated_function

# ==========================================
# Frontend SPA Routes
# ==========================================
@app.route('/')
def index():
    return render_template('index.html')

# ==========================================
# Database Status & Settings
# ==========================================
@app.route('/api/db/status', methods=['GET'])
def get_db_status():
    return jsonify(get_db_info())

@app.route('/api/db/test-mysql', methods=['POST'])
def test_mysql():
    data = request.json or {}
    host = data.get('host', 'localhost')
    port = int(data.get('port', 3306))
    user = data.get('user', 'root')
    password = data.get('password', '')
    database = data.get('database', 'expense_tracker')

    success, message = test_mysql_connection(host, port, user, password, database)
    if success:
        return jsonify({'success': True, 'message': message, 'info': get_db_info()})
    return jsonify({'success': False, 'message': message}), 400

# ==========================================
# Authentication Routes
# ==========================================
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json or {}
    username = data.get('username', '').strip().lower()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    full_name = data.get('full_name', '').strip()
    currency = data.get('currency', '₹') # Indian Rupee default
    partner_name = data.get('partner_name', '').strip()

    if not username or not email or not password or not full_name:
        return jsonify({'error': 'All fields (Username, Email, Full Name, Password) are required.'}), 400

    session = get_session()
    if session.query(User).filter_by(username=username).first():
        return jsonify({'error': f"Username '{username}' is already taken."}), 400
    if session.query(User).filter_by(email=email).first():
        return jsonify({'error': f"Email '{email}' is already registered."}), 400

    user = User(
        username=username,
        email=email,
        full_name=full_name
    )
    user.set_password(password)
    session.add(user)
    session.commit()

    # Create Initial Account (Joint if partner specified, else Individual)
    account_name = f"{full_name}'s Vault" if not partner_name else f"{full_name} & {partner_name} Joint"
    account_type = 'joint' if partner_name else 'individual'
    account = Account(
        name=account_name,
        account_type=account_type,
        currency=currency,
        created_by_id=user.id
    )
    session.add(account)
    session.commit()

    user.active_account_id = account.id

    # Add Primary Member (Person 1)
    primary_member = AccountMember(
        account_id=account.id,
        user_id=user.id,
        name=full_name,
        role='Primary',
        avatar_color='#6366f1',
        monthly_budget=50000.0,
        email=email
    )
    session.add(primary_member)

    # Add Second Person (Person 2) if specified!
    if partner_name:
        second_member = AccountMember(
            account_id=account.id,
            user_id=None,
            name=partner_name,
            role='Partner',
            avatar_color='#ec4899',
            monthly_budget=40000.0,
            email=f"{partner_name.lower().replace(' ', '')}@household.internal"
        )
        session.add(second_member)

    session.commit()

    # Seed Default Categories (no fake transactions)
    seed_default_categories(account.id)

    # Generate Token
    token = secrets.token_hex(24)
    SESSION_TOKENS[token] = user.id

    members = [m.to_dict() for m in account.members]

    return jsonify({
        'message': 'Account registered successfully!',
        'token': token,
        'user': user.to_dict(),
        'active_account': account.to_dict(),
        'members': members
    }), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    username_or_email = data.get('username', '').strip().lower()
    password = data.get('password', '')

    if not username_or_email or not password:
        return jsonify({'error': 'Please enter both username and password.'}), 400

    session = get_session()
    user = session.query(User).filter(
        or_(
            func.lower(User.username) == username_or_email,
            func.lower(User.email) == username_or_email
        )
    ).first()

    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid username or password.'}), 401

    token = secrets.token_hex(24)
    SESSION_TOKENS[token] = user.id

    # Ensure active account
    active_account = None
    if user.active_account_id:
        active_account = session.get(Account, user.active_account_id)
    if not active_account:
        active_account = session.query(Account).filter_by(created_by_id=user.id).first()
        if active_account:
            user.active_account_id = active_account.id
            session.commit()

    user_accounts = session.query(Account).filter_by(created_by_id=user.id).all()
    members = [m.to_dict() for m in active_account.members] if active_account else []

    return jsonify({
        'message': 'Signed in successfully!',
        'token': token,
        'user': user.to_dict(),
        'active_account': active_account.to_dict() if active_account else None,
        'accounts': [a.to_dict() for a in user_accounts],
        'members': members
    })

@app.route('/api/auth/demo-login', methods=['POST'])
def demo_login():
    """Quick start login for Shradha Thakur with a clean Duo Household and 0 fake transactions."""
    session = get_session()
    user = session.query(User).filter_by(username="shradha").first()
    if not user:
        user = User(
            username="shradha",
            email="shradha@tracker.internal",
            full_name="Shradha Thakur"
        )
        user.set_password("shradha123")
        session.add(user)
        session.commit()

        account = Account(
            name="Shradha & Partner Duo Vault",
            account_type="joint",
            currency="₹",
            created_by_id=user.id
        )
        session.add(account)
        session.commit()
        user.active_account_id = account.id

        # Person 1
        m1 = AccountMember(
            account_id=account.id,
            user_id=user.id,
            name="Shradha Thakur",
            role="Primary",
            avatar_color="#6366f1",
            monthly_budget=50000.0,
            email="shradha@tracker.internal"
        )
        # Person 2
        m2 = AccountMember(
            account_id=account.id,
            user_id=None,
            name="Partner",
            role="Partner",
            avatar_color="#ec4899",
            monthly_budget=40000.0,
            email="partner@household.internal"
        )
        session.add(m1)
        session.add(m2)
        session.commit()
        seed_default_categories(account.id)

    token = secrets.token_hex(24)
    SESSION_TOKENS[token] = user.id

    active_account = session.get(Account, user.active_account_id) if user.active_account_id else None
    user_accounts = session.query(Account).filter_by(created_by_id=user.id).all()
    members = [m.to_dict() for m in active_account.members] if active_account else []

    return jsonify({
        'message': 'Signed in as Shradha Thakur (Clean State)!',
        'token': token,
        'user': user.to_dict(),
        'active_account': active_account.to_dict() if active_account else None,
        'accounts': [a.to_dict() for a in user_accounts],
        'members': members
    })


@app.route('/api/auth/me', methods=['GET'])
@login_required
def get_me(user):
    session = get_session()
    active_account = session.query(Account).get(user.active_account_id) if user.active_account_id else None
    user_accounts = session.query(Account).filter_by(created_by_id=user.id).all()
    members = [m.to_dict() for m in active_account.members] if active_account else []

    return jsonify({
        'user': user.to_dict(),
        'active_account': active_account.to_dict() if active_account else None,
        'accounts': [a.to_dict() for a in user_accounts],
        'members': members
    })

@app.route('/api/auth/switch-account', methods=['POST'])
@login_required
def switch_account(user):
    data = request.json or {}
    account_id = data.get('account_id')
    session = get_session()
    account = session.query(Account).get(account_id)
    if not account:
        return jsonify({'error': 'Account not found.'}), 404

    user.active_account_id = account.id
    session.commit()

    return jsonify({
        'message': f"Switched to account '{account.name}'",
        'active_account': account.to_dict(),
        'members': [m.to_dict() for m in account.members]
    })

# ==========================================
# Accounts & Household Duo Management
# ==========================================
@app.route('/api/accounts', methods=['GET', 'POST'])
@login_required
def handle_accounts(user):
    session = get_session()
    if request.method == 'GET':
        accounts = session.query(Account).filter_by(created_by_id=user.id).all()
        return jsonify([a.to_dict() for a in accounts])
    
    # POST: Create new account
    data = request.json or {}
    name = data.get('name', '').strip()
    account_type = data.get('account_type', 'individual')
    currency = data.get('currency', '$')
    partner_name = data.get('partner_name', '').strip()

    if not name:
        return jsonify({'error': 'Account name is required.'}), 400

    account = Account(
        name=name,
        account_type=account_type,
        currency=currency,
        created_by_id=user.id
    )
    session.add(account)
    session.commit()

    # Add Creator as Primary Member
    p1 = AccountMember(
        account_id=account.id,
        user_id=user.id,
        name=user.full_name,
        role='Primary',
        avatar_color='#6366f1',
        monthly_budget=3000.0,
        email=user.email
    )
    session.add(p1)

    if account_type == 'joint' and partner_name:
        p2 = AccountMember(
            account_id=account.id,
            user_id=None,
            name=partner_name,
            role='Partner',
            avatar_color='#ec4899',
            monthly_budget=2500.0
        )
        session.add(p2)

    session.commit()
    seed_default_categories(account.id)

    return jsonify(account.to_dict()), 201

@app.route('/api/members', methods=['GET', 'POST'])
@login_required
def handle_members(user):
    session = get_session()
    if not user.active_account_id:
        return jsonify({'error': 'No active account selected.'}), 400

    if request.method == 'GET':
        members = session.query(AccountMember).filter_by(account_id=user.active_account_id).all()
        # Calculate current month's spent for each member
        today = date.today()
        first_day = today.replace(day=1)

        result = []
        for m in members:
            m_dict = m.to_dict()
            spent = session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
                Transaction.account_id == user.active_account_id,
                Transaction.member_id == m.id,
                Transaction.type == 'expense',
                Transaction.date >= first_day
            ).scalar()
            earned = session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
                Transaction.account_id == user.active_account_id,
                Transaction.member_id == m.id,
                Transaction.type == 'income',
                Transaction.date >= first_day
            ).scalar()
            m_dict['month_spent'] = float(spent)
            m_dict['month_earned'] = float(earned)
            result.append(m_dict)

        return jsonify(result)

    # POST: Add two people in one account (Add second member / partner)
    data = request.json or {}
    name = data.get('name', '').strip()
    role = data.get('role', 'Partner').strip()
    avatar_color = data.get('avatar_color', '#ec4899')
    monthly_budget = float(data.get('monthly_budget', 0.0) or 0.0)
    email = data.get('email', '').strip()

    if not name:
        return jsonify({'error': 'Member name is required.'}), 400

    member = AccountMember(
        account_id=user.active_account_id,
        name=name,
        role=role,
        avatar_color=avatar_color,
        monthly_budget=monthly_budget,
        email=email if email else None
    )
    session.add(member)

    # Update account type to joint if it now has 2 people
    account = session.query(Account).get(user.active_account_id)
    if account and account.account_type == 'individual':
        account.account_type = 'joint'

    session.commit()
    return jsonify(member.to_dict()), 201

@app.route('/api/members/<int:member_id>', methods=['PUT', 'DELETE'])
@login_required
def member_detail(user, member_id):
    session = get_session()
    member = session.query(AccountMember).filter_by(id=member_id, account_id=user.active_account_id).first()
    if not member:
        return jsonify({'error': 'Member not found.'}), 404

    if request.method == 'DELETE':
        # Check if this is the only member
        count = session.query(AccountMember).filter_by(account_id=user.active_account_id).count()
        if count <= 1:
            return jsonify({'error': 'Cannot remove the only member of an account.'}), 400
        session.delete(member)
        session.commit()
        return jsonify({'message': 'Member removed successfully.'})

    # PUT
    data = request.json or {}
    if 'name' in data and data['name'].strip():
        member.name = data['name'].strip()
    if 'role' in data:
        member.role = data['role'].strip()
    if 'avatar_color' in data:
        member.avatar_color = data['avatar_color']
    if 'monthly_budget' in data:
        member.monthly_budget = float(data['monthly_budget'] or 0.0)
    if 'email' in data:
        member.email = data['email'].strip()

    session.commit()
    return jsonify(member.to_dict())

# ==========================================
# Categories API
# ==========================================
@app.route('/api/categories', methods=['GET', 'POST'])
@login_required
def handle_categories(user):
    session = get_session()
    if request.method == 'GET':
        categories = session.query(Category).filter(
            or_(
                Category.account_id == user.active_account_id,
                Category.account_id == None
            )
        ).all()
        return jsonify([c.to_dict() for c in categories])

    # POST: Add new category
    data = request.json or {}
    name = data.get('name', '').strip()
    cat_type = data.get('type', 'expense').lower()
    icon = data.get('icon', 'fa-tag')
    color = data.get('color', '#6366f1')

    if not name or cat_type not in ('expense', 'income'):
        return jsonify({'error': 'Valid name and type (expense/income) are required.'}), 400

    cat = Category(
        account_id=user.active_account_id,
        name=name,
        type=cat_type,
        icon=icon,
        color=color,
        is_default=False
    )
    session.add(cat)
    session.commit()
    return jsonify(cat.to_dict()), 201

# ==========================================
# Transactions API (Records & Income/Expense)
# ==========================================
@app.route('/api/transactions', methods=['GET', 'POST'])
@login_required
def handle_transactions(user):
    session = get_session()
    if not user.active_account_id:
        return jsonify({'error': 'No active account selected.'}), 400

    if request.method == 'GET':
        # Query parameters
        tx_type = request.args.get('type') # 'income', 'expense', or 'all'
        member_id = request.args.get('member_id') # specific member or 'all'
        category_id = request.args.get('category_id')
        payment_method = request.args.get('payment_method')
        search = request.args.get('search', '').strip()
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))

        query = session.query(Transaction).filter_by(account_id=user.active_account_id)

        if tx_type and tx_type in ('income', 'expense'):
            query = query.filter(Transaction.type == tx_type)
        if member_id and member_id != 'all' and member_id.isdigit():
            query = query.filter(Transaction.member_id == int(member_id))
        if category_id and category_id.isdigit():
            query = query.filter(Transaction.category_id == int(category_id))
        if payment_method and payment_method != 'all':
            query = query.filter(Transaction.payment_method == payment_method)
        if start_date:
            query = query.filter(Transaction.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            query = query.filter(Transaction.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        if search:
            search_pattern = f"%{search}%"
            query = query.outerjoin(Category).filter(
                or_(
                    Transaction.notes.ilike(search_pattern),
                    Transaction.tags.ilike(search_pattern),
                    Category.name.ilike(search_pattern)
                )
            )

        total_count = query.count()
        transactions = query.order_by(desc(Transaction.date), desc(Transaction.id)).offset(offset).limit(limit).all()

        # Calculate total income & total expense for current filter
        tot_income = session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
            Transaction.account_id == user.active_account_id,
            Transaction.type == 'income'
        ).scalar()

        tot_expense = session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
            Transaction.account_id == user.active_account_id,
            Transaction.type == 'expense'
        ).scalar()

        net_gain = float(tot_income) - float(tot_expense)

        return jsonify({
            'transactions': [t.to_dict() for t in transactions],
            'total_count': total_count,
            'summary': {
                'total_income': float(tot_income),
                'total_expense': float(tot_expense),
                'net_gain': float(net_gain)
            }
        })

    # POST: Add new Transaction
    data = request.json or {}
    tx_type = data.get('type', 'expense').lower()
    amount = float(data.get('amount', 0.0))
    category_id = data.get('category_id')
    member_id = data.get('member_id')
    tx_date_str = data.get('date')
    payment_method = data.get('payment_method', 'Credit Card')
    notes = data.get('notes', '').strip()
    tags = data.get('tags', '')
    if isinstance(tags, list):
        tags = ', '.join(tags)

    if amount <= 0:
        return jsonify({'error': 'Amount must be greater than 0.'}), 400
    if not category_id:
        return jsonify({'error': 'Please select a category.'}), 400

    tx_date = datetime.strptime(tx_date_str, '%Y-%m-%d').date() if tx_date_str else date.today()

    # If no member_id provided, default to primary member
    if not member_id:
        primary_m = session.query(AccountMember).filter_by(account_id=user.active_account_id, role='Primary').first()
        member_id = primary_m.id if primary_m else None

    tx = Transaction(
        account_id=user.active_account_id,
        member_id=member_id,
        type=tx_type,
        amount=amount,
        category_id=int(category_id),
        date=tx_date,
        payment_method=payment_method,
        notes=notes,
        tags=tags
    )
    session.add(tx)
    session.commit()

    return jsonify(tx.to_dict()), 201

@app.route('/api/transactions/<int:tx_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def transaction_detail(user, tx_id):
    session = get_session()
    tx = session.query(Transaction).filter_by(id=tx_id, account_id=user.active_account_id).first()
    if not tx:
        return jsonify({'error': 'Transaction not found.'}), 404

    if request.method == 'GET':
        return jsonify(tx.to_dict())

    if request.method == 'DELETE':
        session.delete(tx)
        session.commit()
        return jsonify({'message': 'Transaction deleted successfully.'})

    # PUT
    data = request.json or {}
    if 'amount' in data and float(data['amount']) > 0:
        tx.amount = float(data['amount'])
    if 'type' in data and data['type'] in ('income', 'expense'):
        tx.type = data['type']
    if 'category_id' in data:
        tx.category_id = int(data['category_id'])
    if 'member_id' in data:
        tx.member_id = int(data['member_id'])
    if 'date' in data and data['date']:
        tx.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    if 'payment_method' in data:
        tx.payment_method = data['payment_method']
    if 'notes' in data:
        tx.notes = data['notes'].strip()
    if 'tags' in data:
        tags = data['tags']
        tx.tags = ', '.join(tags) if isinstance(tags, list) else tags

# ==========================================
# Zero-Out Transactions (Reset Expenses or Income to ₹0)
# ==========================================
@app.route('/api/transactions/zero-out', methods=['POST'])
@login_required
def zero_out_transactions(user):
    """Function to make all expenses or income 0 for the active account."""
    session = get_session()
    if not user.active_account_id:
        return jsonify({'error': 'No active account selected.'}), 400

    data = request.json or {}
    target = data.get('target', 'all').lower() # 'expense', 'income', or 'all'

    query = session.query(Transaction).filter_by(account_id=user.active_account_id)
    if target in ('expense', 'income'):
        query = query.filter(Transaction.type == target)

    deleted_count = query.delete(synchronize_session=False)
    session.commit()

    label = "All expenses" if target == 'expense' else "All income" if target == 'income' else "All records"
    return jsonify({
        'success': True,
        'message': f"{label} have been reset to ₹0 ({deleted_count} records cleared).",
        'cleared_count': deleted_count,
        'target': target
    })

# ==========================================
# Analytics & Visual Dashboards API
# ==========================================
@app.route('/api/analytics/dashboard', methods=['GET'])
@login_required
def get_dashboard_analytics(user):
    session = get_session()
    if not user.active_account_id:
        return jsonify({'error': 'No active account selected.'}), 400

    account_id = user.active_account_id
    today = date.today()
    this_month_start = today.replace(day=1)
    
    # 1. Total Lifetime Income, Expense & Net Gain
    tot_income = session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
        Transaction.account_id == account_id,
        Transaction.type == 'income'
    ).scalar()

    tot_expense = session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
        Transaction.account_id == account_id,
        Transaction.type == 'expense'
    ).scalar()

    net_gain = float(tot_income) - float(tot_expense)
    savings_rate = round((net_gain / float(tot_income) * 100), 1) if float(tot_income) > 0 else 0.0

    # 2. This Month's Income & Expense
    month_income = session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
        Transaction.account_id == account_id,
        Transaction.type == 'income',
        Transaction.date >= this_month_start
    ).scalar()

    month_expense = session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
        Transaction.account_id == account_id,
        Transaction.type == 'expense',
        Transaction.date >= this_month_start
    ).scalar()

    month_gain = float(month_income) - float(month_expense)

    # 3. Member Duo Split Analysis (Two People in One Account)
    members = session.query(AccountMember).filter_by(account_id=account_id).all()
    member_stats = []
    for m in members:
        m_expense = session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
            Transaction.account_id == account_id,
            Transaction.member_id == m.id,
            Transaction.type == 'expense'
        ).scalar()
        m_income = session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
            Transaction.account_id == account_id,
            Transaction.member_id == m.id,
            Transaction.type == 'income'
        ).scalar()
        member_stats.append({
            'member_id': m.id,
            'name': m.name,
            'role': m.role,
            'avatar_color': m.avatar_color,
            'monthly_budget': m.monthly_budget,
            'total_expense': float(m_expense),
            'total_income': float(m_income),
            'net_balance': float(m_income) - float(m_expense)
        })

    # Duo fair split (if 2 members present)
    split_info = None
    if len(member_stats) >= 2:
        m1, m2 = member_stats[0], member_stats[1]
        diff = m1['total_expense'] - m2['total_expense']
        half_diff = round(abs(diff) / 2.0, 2)
        if diff > 0:
            owe_text = f"{m2['name']} owes {m1['name']} ₹{half_diff:.2f} to balance joint expenses evenly (50/50)."
        elif diff < 0:
            owe_text = f"{m1['name']} owes {m2['name']} ₹{half_diff:.2f} to balance joint expenses evenly (50/50)."
        else:
            owe_text = f"Both members have contributed equally (₹{m1['total_expense']:.2f} each). Settled up!"

        split_info = {
            'person1': m1['name'],
            'person1_spent': m1['total_expense'],
            'person2': m2['name'],
            'person2_spent': m2['total_expense'],
            'settlement_text': owe_text,
            'difference': abs(diff),
            'half_difference': half_diff
        }

    # 4. Category Breakdown (Expenses) - Fixed SQL for MySQL 8.0 Full Group By compliance
    total_agg = func.coalesce(func.sum(Transaction.amount), 0.0)
    cat_query = session.query(
        Category.name,
        Category.color,
        Category.icon,
        total_agg.label('total')
    ).join(Transaction, Transaction.category_id == Category.id).filter(
        Transaction.account_id == account_id,
        Transaction.type == 'expense'
    ).group_by(Category.id, Category.name, Category.color, Category.icon).order_by(desc(total_agg)).all()

    category_breakdown = [
        {
            'category': row.name,
            'color': row.color or '#6366f1',
            'icon': row.icon or 'fa-tag',
            'total': float(row.total),
            'percentage': round((float(row.total) / float(tot_expense) * 100), 1) if float(tot_expense) > 0 else 0
        }
        for row in cat_query
    ]

    # 5. Monthly Cash Flow Trend (Last 6 Months)
    cash_flow_trend = []
    for i in range(5, -1, -1):
        # Month start and end
        ref_date = today - timedelta(days=i * 30)
        m_start = ref_date.replace(day=1)
        # Next month start
        if m_start.month == 12:
            next_m = m_start.replace(year=m_start.year + 1, month=1)
        else:
            next_m = m_start.replace(month=m_start.month + 1)
        
        inc = session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
            Transaction.account_id == account_id,
            Transaction.type == 'income',
            Transaction.date >= m_start,
            Transaction.date < next_m
        ).scalar()

        exp = session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
            Transaction.account_id == account_id,
            Transaction.type == 'expense',
            Transaction.date >= m_start,
            Transaction.date < next_m
        ).scalar()

        label = m_start.strftime('%b %Y')
        cash_flow_trend.append({
            'month': label,
            'income': float(inc),
            'expense': float(exp),
            'gain': float(inc) - float(exp)
        })

    # 6. Recent 6 Transactions
    recent_txs = session.query(Transaction).filter_by(account_id=account_id).order_by(
        desc(Transaction.date), desc(Transaction.id)
    ).limit(6).all()

    return jsonify({
        'summary': {
            'total_income': float(tot_income),
            'total_expense': float(tot_expense),
            'net_gain': float(net_gain),
            'savings_rate': savings_rate,
            'month_income': float(month_income),
            'month_expense': float(month_expense),
            'month_gain': float(month_gain)
        },
        'member_stats': member_stats,
        'split_info': split_info,
        'category_breakdown': category_breakdown,
        'cash_flow_trend': cash_flow_trend,
        'recent_transactions': [t.to_dict() for t in recent_txs]
    })

if __name__ == '__main__':
    setup_database()
    app.run(host='0.0.0.0', port=Config.PORT, debug=True)
