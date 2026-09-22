// ==========================================================================
// Expense Tracker - React 18 Application
// Multi-User & Duo Household Budgeting
// Currency: Indian Rupee (₹) | Bright Mode | Zero Fake Data | Print History
// Made by Shradha Thakur
// ==========================================================================

const { useState, useEffect, useRef, useMemo } = React;

// Currency Formatter for Indian Rupees (₹)
const formatINR = (val) => {
  const num = Number(val) || 0;
  return '₹' + num.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });
};

const formatINRCompact = (val) => {
  const num = Number(val) || 0;
  return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

// API Helper
const API_BASE = '/api';

const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('shradha_tracker_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong');
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
};

// ==========================================
// Root App Component
// ==========================================
function App() {
  const [user, setUser] = useState(null);
  const [activeAccount, setActiveAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [members, setMembers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState('overview'); // overview, records, duo, history_chart
  const [dbInfo, setDbInfo] = useState({ type: 'Checking...', connected: false });
  const [toast, setToast] = useState(null);

  // Bright Mode / Dark Mode Theme
  const [theme, setTheme] = useState(() => localStorage.getItem('shradha_tracker_theme') || 'dark');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [initialTxType, setInitialTxType] = useState('expense');
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showDuoModal, setShowDuoModal] = useState(false);
  const [showDbModal, setShowDbModal] = useState(false);

  // Filters for History Ledger
  const [filters, setFilters] = useState({
    type: 'all',
    member_id: 'all',
    category_id: 'all',
    payment_method: 'all',
    search: '',
    start_date: '',
    end_date: ''
  });

  // Apply Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('shradha_tracker_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Initial Auth Check
  useEffect(() => {
    const token = localStorage.getItem('shradha_tracker_token');
    fetchDbStatus();

    if (token) {
      checkAuth();
    } else {
      setLoading(false);
      removeSplash();
    }
  }, []);

  const removeSplash = () => {
    const splash = document.getElementById('initial-loader');
    if (splash) splash.style.display = 'none';
  };

  const fetchDbStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/db/status`);
      const data = await res.json();
      setDbInfo(data);
    } catch (e) {
      console.warn('Could not fetch DB status', e);
    }
  };

  const checkAuth = async () => {
    try {
      const data = await apiRequest('/auth/me');
      setUser(data.user);
      setActiveAccount(data.active_account);
      setAccounts(data.accounts || []);
      setMembers(data.members || []);
      await loadInitialData(data.active_account?.id);
    } catch (err) {
      console.error('Session expired or invalid:', err);
      localStorage.removeItem('shradha_tracker_token');
      setUser(null);
    } finally {
      setLoading(false);
      removeSplash();
    }
  };

  const loadInitialData = async (accountId) => {
    if (!accountId) return;
    try {
      const [cats, dash, txs] = await Promise.all([
        apiRequest('/categories'),
        apiRequest('/analytics/dashboard'),
        apiRequest('/transactions?limit=100')
      ]);
      setCategories(cats);
      setDashboardData(dash);
      setTransactions(txs.transactions || []);
    } catch (e) {
      console.error('Failed loading initial data:', e);
    }
  };

  const refreshDashboard = async () => {
    try {
      const [dash, txs, mems] = await Promise.all([
        apiRequest('/analytics/dashboard'),
        apiRequest(buildTransactionQuery(filters)),
        apiRequest('/members')
      ]);
      setDashboardData(dash);
      setTransactions(txs.transactions || []);
      setMembers(mems);
    } catch (e) {
      console.error('Refresh error:', e);
    }
  };

  const buildTransactionQuery = (f) => {
    const params = new URLSearchParams();
    if (f.type && f.type !== 'all') params.append('type', f.type);
    if (f.member_id && f.member_id !== 'all') params.append('member_id', f.member_id);
    if (f.category_id && f.category_id !== 'all') params.append('category_id', f.category_id);
    if (f.payment_method && f.payment_method !== 'all') params.append('payment_method', f.payment_method);
    if (f.search) params.append('search', f.search);
    if (f.start_date) params.append('start_date', f.start_date);
    if (f.end_date) params.append('end_date', f.end_date);
    params.append('limit', '200');
    return `/transactions?${params.toString()}`;
  };

  const handleFilterChange = async (newFilters) => {
    setFilters(newFilters);
    try {
      const data = await apiRequest(buildTransactionQuery(newFilters));
      setTransactions(data.transactions || []);
    } catch (e) {
      showToast('Error filtering records', 'error');
    }
  };

  const handleLoginSuccess = (data) => {
    localStorage.setItem('shradha_tracker_token', data.token);
    setUser(data.user);
    setActiveAccount(data.active_account);
    setAccounts(data.accounts || []);
    setMembers(data.members || []);
    showToast(`Welcome, ${data.user.full_name}!`);
    loadInitialData(data.active_account?.id);
  };

  const handleLogout = () => {
    localStorage.removeItem('shradha_tracker_token');
    setUser(null);
    setActiveAccount(null);
    setAccounts([]);
    setMembers([]);
    setDashboardData(null);
    setTransactions([]);
    showToast('Signed out successfully.');
  };

  const handleSwitchAccount = async (accountId) => {
    try {
      const res = await apiRequest('/auth/switch-account', {
        method: 'POST',
        body: JSON.stringify({ account_id: accountId })
      });
      setActiveAccount(res.active_account);
      setMembers(res.members || []);
      showToast(`Switched account to ${res.active_account.name}`);
      setShowAccountModal(false);
      loadInitialData(accountId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openAddRecord = (type = 'expense') => {
    setEditingTransaction(null);
    setInitialTxType(type);
    setShowAddModal(true);
  };

  if (loading) {
    return null;
  }

  // Dashboard is strictly NOT available till Sign In / Sign Up
  if (!user) {
    return (
      <div className="app-container">
        <AuthPage 
          onLoginSuccess={handleLoginSuccess}
          dbInfo={dbInfo}
          showToast={showToast}
          theme={theme}
          toggleTheme={toggleTheme}
        />
        <Footer />
        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    );
  }

  return (
    <div className="app-container">
      <Navbar 
        user={user}
        activeAccount={activeAccount}
        accounts={accounts}
        members={members}
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        dbInfo={dbInfo}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenAccountModal={() => setShowAccountModal(true)}
        onOpenAddExpense={() => openAddRecord('expense')}
        onOpenAddIncome={() => openAddRecord('income')}
        onOpenDuoModal={() => setShowDuoModal(true)}
        onOpenDbModal={() => setShowDbModal(true)}
        onLogout={handleLogout}
      />

      <main className="main-content">
        {/* Printable Statement Header (Only visible when printing) */}
        <div className="print-report-header">
          <h1>Expense Tracker & Financial History Statement</h1>
          <p>Account: <strong>{activeAccount?.name}</strong> • Account Holder: <strong>{user.full_name}</strong></p>
          <p>Generated on: {new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })} • Currency: Indian Rupee (₹)</p>
          <p style={{ marginTop: 4, fontSize: '9pt', color: '#64748b' }}>Crafted with precision by Shradha Thakur</p>
        </div>

        {/* Easy To Use Quick Action Ribbon */}
        <div className="quick-actions-bar">
          <button className="btn-quick-expense" onClick={() => openAddRecord('expense')}>
            <i className="fa-solid fa-minus-circle"></i> Record Expense (खर्च)
          </button>
          <button className="btn-quick-income" onClick={() => openAddRecord('income')}>
            <i className="fa-solid fa-plus-circle"></i> Record Income (कमाई)
          </button>
          <button className="btn-print" onClick={() => window.print()} title="Print Statement / Save as PDF">
            <i className="fa-solid fa-print"></i> Print History
          </button>
        </div>

        {currentTab === 'overview' && (
          <OverviewTab 
            dashboardData={dashboardData}
            activeAccount={activeAccount}
            members={members}
            onOpenAddExpense={() => openAddRecord('expense')}
            onOpenAddIncome={() => openAddRecord('income')}
            onOpenDuoModal={() => setShowDuoModal(true)}
            onViewAllRecords={() => setCurrentTab('records')}
          />
        )}

        {currentTab === 'records' && (
          <RecordsTab 
            transactions={transactions}
            categories={categories}
            members={members}
            filters={filters}
            onFilterChange={handleFilterChange}
            onOpenAddExpense={() => openAddRecord('expense')}
            onOpenAddIncome={() => openAddRecord('income')}
            onEditTransaction={(tx) => { setEditingTransaction(tx); setShowAddModal(true); }}
            onDeleteTransaction={async (id) => {
              if (confirm('Are you sure you want to delete this record from history?')) {
                await apiRequest(`/transactions/${id}`, { method: 'DELETE' });
                showToast('Record deleted');
                refreshDashboard();
              }
            }}
          />
        )}

        {currentTab === 'duo' && (
          <DuoHouseholdTab 
            members={members}
            dashboardData={dashboardData}
            onOpenDuoModal={() => setShowDuoModal(true)}
            onOpenAddExpense={() => openAddRecord('expense')}
          />
        )}

        {currentTab === 'history_chart' && (
          <HistoryBarGraphTab 
            dashboardData={dashboardData}
            transactions={transactions}
          />
        )}
      </main>

      <Footer />

      {/* Modals */}
      {showAddModal && (
        <AddTransactionModal 
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          categories={categories}
          members={members}
          initialType={initialTxType}
          editingTransaction={editingTransaction}
          onSaved={() => {
            setShowAddModal(false);
            showToast(editingTransaction ? 'Record updated!' : 'Transaction recorded successfully!');
            refreshDashboard();
            if (window.confetti) {
              window.confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
            }
          }}
        />
      )}

      {showDuoModal && (
        <ManageDuoModal 
          isOpen={showDuoModal}
          onClose={() => setShowDuoModal(false)}
          members={members}
          activeAccount={activeAccount}
          onUpdated={() => {
            refreshDashboard();
            showToast('Household members updated!');
          }}
        />
      )}

      {showAccountModal && (
        <AccountSwitcherModal 
          isOpen={showAccountModal}
          onClose={() => setShowAccountModal(false)}
          accounts={accounts}
          activeAccount={activeAccount}
          onSelectAccount={handleSwitchAccount}
          onAccountCreated={(newAcc) => {
            setAccounts([...accounts, newAcc]);
            handleSwitchAccount(newAcc.id);
          }}
        />
      )}

      {showDbModal && (
        <DatabaseSettingsModal 
          isOpen={showDbModal}
          onClose={() => setShowDbModal(false)}
          dbInfo={dbInfo}
          onConnected={(newInfo) => {
            setDbInfo(newInfo);
            showToast('Connected to MySQL successfully!');
            refreshDashboard();
          }}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

// ==========================================
// Authentication Portal (Sign In First)
// ==========================================
function AuthPage({ onLoginSuccess, dbInfo, showToast, theme, toggleTheme }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    partner_name: '',
    currency: '₹'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isSignUp ? '/auth/register' : '/auth/login';
      const payload = isSignUp ? formData : { username: formData.username, password: formData.password };
      const res = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      onLoginSuccess(res);
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartFresh = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/auth/demo-login', { method: 'POST' });
      onLoginSuccess(res);
    } catch (err) {
      setError('Could not start clean account: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="auth-card">
        {/* Left Side: Brand & Feature Highlights */}
        <div className="auth-hero-side">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="brand-logo-large">
                <div className="icon"><i className="fa-solid fa-indian-rupee-sign"></i></div>
                <h2>Expense Vault</h2>
              </div>
              <button 
                type="button" 
                className="theme-toggle-btn" 
                onClick={toggleTheme}
                title={`Switch to ${theme === 'dark' ? 'Bright' : 'Dark'} Mode`}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>

            <h1 className="auth-hero-headline">
              Smart Money Tracker in <span>Indian Rupees (₹)</span>
            </h1>
            <p className="auth-hero-sub">
              Sign in to manage your genuine expenses, track your income gains, add two people to one joint household, and print complete financial history statements.
            </p>

            <div className="auth-feature-list">
              <div className="auth-feature-item">
                <div className="feat-icon"><i className="fa-solid fa-indian-rupee-sign"></i></div>
                <div>
                  <h4>Amounts in Indian Rupee (₹)</h4>
                  <p>All calculations, history, and charts strictly in Indian currency (INR).</p>
                </div>
              </div>
              <div className="auth-feature-item">
                <div className="feat-icon"><i className="fa-solid fa-people-arrows"></i></div>
                <div>
                  <h4>Two People in One Account</h4>
                  <p>Add your partner or roommate to split joint expenses 50/50.</p>
                </div>
              </div>
              <div className="auth-feature-item">
                <div className="feat-icon"><i className="fa-solid fa-print"></i></div>
                <div>
                  <h4>Record History & Print Statement</h4>
                  <p>Full transaction ledger with instant one-click print or PDF save.</p>
                </div>
              </div>
              <div className="auth-feature-item">
                <div className="feat-icon"><i className="fa-solid fa-chart-column"></i></div>
                <div>
                  <h4>History Bar Graph</h4>
                  <p>Visual historical timeline of verified inflows vs expenditures.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="auth-hero-credit">
            Designed & Developed with ❤️ by <strong>Shradha Thakur</strong>
          </div>
        </div>

        {/* Right Side: Auth Forms */}
        <div className="auth-form-side">
          <div className="auth-tabs">
            <button 
              className={`auth-tab-btn ${!isSignUp ? 'active' : ''}`}
              onClick={() => { setIsSignUp(false); setError(''); }}
            >
              <i className="fa-solid fa-right-to-bracket" style={{ marginRight: 6 }}></i> Sign In
            </button>
            <button 
              className={`auth-tab-btn ${isSignUp ? 'active' : ''}`}
              onClick={() => { setIsSignUp(true); setError(''); }}
            >
              <i className="fa-solid fa-user-plus" style={{ marginRight: 6 }}></i> New Account
            </button>
          </div>

          {error && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#f43f5e',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: '0.85rem',
              marginBottom: 16
            }}>
              <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 6 }}></i>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {isSignUp && (
              <div className="form-group">
                <label><i className="fa-solid fa-id-card"></i> Your Full Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Shradha Thakur"
                  value={formData.full_name}
                  onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label><i className="fa-solid fa-user"></i> Username</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. shradha"
                value={formData.username}
                onChange={e => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>

            {isSignUp && (
              <div className="form-group">
                <label><i className="fa-solid fa-envelope"></i> Email Address</label>
                <input 
                  type="email" 
                  className="form-control" 
                  placeholder="name@domain.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label><i className="fa-solid fa-lock"></i> Password</label>
              <input 
                type="password" 
                className="form-control" 
                placeholder="••••••••"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>

            {isSignUp && (
              <div className="form-group">
                <label><i className="fa-solid fa-heart"></i> Add Second Person / Partner Name (Optional)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Partner or Roommate name"
                  value={formData.partner_name}
                  onChange={e => setFormData({ ...formData, partner_name: e.target.value })}
                />
              </div>
            )}

            <button 
              type="submit" 
              className="btn-primary" 
              style={{ width: '100%', marginTop: 12, padding: 12 }}
              disabled={loading}
            >
              {loading ? (
                <span><i className="fa-solid fa-circle-notch fa-spin"></i> Authenticating...</span>
              ) : isSignUp ? (
                <span><i className="fa-solid fa-user-check"></i> Register & Open Dashboard</span>
              ) : (
                <span><i className="fa-solid fa-door-open"></i> Sign In to Dashboard</span>
              )}
            </button>
          </form>

          {/* Clean Quick Start Button (0 Fake Transactions) */}
          <div className="quick-demo-box" style={{ marginTop: 24 }}>
            <p><i className="fa-solid fa-sparkles" style={{ color: '#10b981' }}></i> Start immediately with a fresh, clean account (Zero fake data):</p>
            <button 
              type="button" 
              className="btn-secondary" 
              style={{ width: '100%', fontSize: '0.88rem', fontWeight: 600 }}
              onClick={handleStartFresh}
              disabled={loading}
            >
              <i className="fa-solid fa-bolt"></i> Quick Sign-In (Shradha Thakur • Clean State)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Navbar Component
// ==========================================
function Navbar({ 
  user, 
  activeAccount, 
  accounts, 
  members, 
  currentTab, 
  setCurrentTab, 
  dbInfo,
  theme,
  toggleTheme,
  onOpenAccountModal, 
  onOpenAddExpense, 
  onOpenAddIncome,
  onOpenDuoModal,
  onOpenDbModal,
  onLogout 
}) {
  return (
    <header className="navbar">
      <div className="nav-brand" onClick={() => setCurrentTab('overview')}>
        <div className="brand-icon"><i className="fa-solid fa-indian-rupee-sign"></i></div>
        <div className="brand-text">
          <h1>Shradha's Expense Tracker</h1>
          <div className="brand-badge">
            <span className="account-badge-dot"></span>
            <span>By <span className="author">Shradha Thakur</span></span>
          </div>
        </div>
      </div>

      <nav className="nav-center">
        <button 
          className={`nav-tab ${currentTab === 'overview' ? 'active' : ''}`}
          onClick={() => setCurrentTab('overview')}
        >
          <i className="fa-solid fa-house"></i> Overview
        </button>
        <button 
          className={`nav-tab ${currentTab === 'records' ? 'active' : ''}`}
          onClick={() => setCurrentTab('records')}
        >
          <i className="fa-solid fa-receipt"></i> Record History
        </button>
        <button 
          className={`nav-tab ${currentTab === 'history_chart' ? 'active' : ''}`}
          onClick={() => setCurrentTab('history_chart')}
        >
          <i className="fa-solid fa-chart-column"></i> History Bar Graph
        </button>
        <button 
          className={`nav-tab ${currentTab === 'duo' ? 'active' : ''}`}
          onClick={() => setCurrentTab('duo')}
        >
          <i className="fa-solid fa-user-group"></i> Duo Household
        </button>
      </nav>

      <div className="nav-actions">
        {/* Bright Mode / Dark Mode Toggle */}
        <button 
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Bright' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        {/* Database Status indicator */}
        <div 
          className={`db-status-pill ${dbInfo.type?.includes('SQLite') ? 'sqlite' : ''}`}
          onClick={onOpenDbModal}
          title="Click to view or link MySQL 8.0 connection"
        >
          <i className="fa-solid fa-database"></i>
          <span>{dbInfo.type || 'DB'}</span>
        </div>

        {/* Account Switcher Button */}
        <button className="account-selector-btn" onClick={onOpenAccountModal} title="Switch or Create Account">
          <i className="fa-solid fa-wallet" style={{ color: '#818cf8' }}></i>
          <span>{activeAccount ? activeAccount.name : 'Switch Vault'}</span>
          <i className="fa-solid fa-chevron-down" style={{ fontSize: '0.75rem', opacity: 0.6 }}></i>
        </button>

        {/* Quick Add Expense */}
        <button className="btn-primary" onClick={onOpenAddExpense} style={{ background: 'var(--expense-gradient)' }}>
          <i className="fa-solid fa-minus"></i>
          <span>Expense</span>
        </button>

        {/* Quick Add Income */}
        <button className="btn-primary" onClick={onOpenAddIncome} style={{ background: 'var(--gain-gradient)' }}>
          <i className="fa-solid fa-plus"></i>
          <span>Income</span>
        </button>

        {/* Logout */}
        <button className="btn-secondary" onClick={onLogout} title="Sign Out" style={{ padding: '8px 12px' }}>
          <i className="fa-solid fa-arrow-right-from-bracket"></i>
        </button>
      </div>
    </header>
  );
}

// ==========================================
// Overview Dashboard Tab
// ==========================================
function OverviewTab({ dashboardData, activeAccount, members, onOpenAddExpense, onOpenAddIncome, onOpenDuoModal, onViewAllRecords }) {
  const summary = dashboardData?.summary || {
    total_income: 0,
    total_expense: 0,
    net_gain: 0,
    savings_rate: 0
  };
  const splitInfo = dashboardData?.split_info;
  const hasRecords = (dashboardData?.recent_transactions || []).length > 0;

  return (
    <div>
      {/* 4 Top KPI Cards in Indian Rupees */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="title">Total Gain / Income (कुल आय)</span>
            <div className="stat-icon gain"><i className="fa-solid fa-arrow-trend-up"></i></div>
          </div>
          <div className="stat-value gain-text">
            {formatINR(summary.total_income)}
          </div>
          <div className="stat-footer">
            <span className="badge-trend up"><i className="fa-solid fa-arrow-up"></i> Inflow</span>
            <span>Total genuine gains recorded</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="title">Total Expenditure (कुल खर्च)</span>
            <div className="stat-icon expense"><i className="fa-solid fa-arrow-trend-down"></i></div>
          </div>
          <div className="stat-value expense-text">
            {formatINR(summary.total_expense)}
          </div>
          <div className="stat-footer">
            <span className="badge-trend down"><i className="fa-solid fa-arrow-down"></i> Outflow</span>
            <span>All outgoing payments</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="title">Net Cash Flow (शुद्ध बचत)</span>
            <div className="stat-icon net"><i className="fa-solid fa-wallet"></i></div>
          </div>
          <div className={`stat-value ${summary.net_gain >= 0 ? 'gain-text' : 'expense-text'}`}>
            {formatINR(summary.net_gain)}
          </div>
          <div className="stat-footer">
            <span className={`badge-trend ${summary.net_gain >= 0 ? 'up' : 'down'}`}>
              {summary.net_gain >= 0 ? 'Surplus (+)' : 'Deficit (-)'}
            </span>
            <span>Inflow minus outflow</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="title">Savings Rate (बचत दर)</span>
            <div className="stat-icon duo"><i className="fa-solid fa-piggy-bank"></i></div>
          </div>
          <div className="stat-value" style={{ color: '#c084fc' }}>
            {summary.savings_rate}%
          </div>
          <div className="stat-footer">
            <span className="badge-trend up"><i className="fa-solid fa-shield-halved"></i> Health</span>
            <span>Retained income</span>
          </div>
        </div>
      </div>

      {/* Two People in One Account - Household Split Card */}
      {members && members.length >= 2 ? (
        <div className="duo-card">
          <div className="duo-header">
            <div className="duo-title">
              <i className="fa-solid fa-people-arrows" style={{ color: '#ec4899', fontSize: '1.2rem' }}></i>
              <h3>Joint Household Duo ({members[0]?.name} & {members[1]?.name})</h3>
              <span className="duo-tag">Duo Mode Active</span>
            </div>
            <button className="btn-secondary" onClick={onOpenDuoModal} style={{ fontSize: '0.82rem' }}>
              <i className="fa-solid fa-gear"></i> Manage Duo Members
            </button>
          </div>

          <div className="duo-members-row">
            {/* Person 1 */}
            <div className="duo-person-card">
              <div className="duo-avatar" style={{ background: members[0]?.avatar_color || '#6366f1' }}>
                {members[0]?.name?.charAt(0) || 'P'}
              </div>
              <div className="duo-person-info">
                <h4>{members[0]?.name}</h4>
                <p>{members[0]?.role} Member</p>
                <div className="duo-person-spent">
                  Total Spent: <strong>{formatINR(dashboardData?.member_stats?.[0]?.total_expense || 0)}</strong>
                </div>
              </div>
            </div>

            <div className="duo-vs-divider">
              <div className="duo-vs-badge">VS</div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>50/50 Split</span>
            </div>

            {/* Person 2 */}
            <div className="duo-person-card">
              <div className="duo-avatar" style={{ background: members[1]?.avatar_color || '#ec4899' }}>
                {members[1]?.name?.charAt(0) || 'P'}
              </div>
              <div className="duo-person-info">
                <h4>{members[1]?.name}</h4>
                <p>{members[1]?.role} Member</p>
                <div className="duo-person-spent">
                  Total Spent: <strong>{formatINR(dashboardData?.member_stats?.[1]?.total_expense || 0)}</strong>
                </div>
              </div>
            </div>
          </div>

          {splitInfo && (
            <div className="duo-split-settlement">
              <div className="duo-settlement-text">
                <i className="fa-solid fa-scale-balanced" style={{ color: '#818cf8', fontSize: '1.1rem' }}></i>
                <span>{splitInfo.settlement_text.replace(/\$/g, '₹')}</span>
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Spread: {formatINR(splitInfo.difference)}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="duo-card" style={{ background: 'rgba(30, 41, 59, 0.4)', borderStyle: 'dashed' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="stat-icon duo"><i className="fa-solid fa-user-plus"></i></div>
              <div>
                <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem' }}>Add Two People in One Account</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Add your partner or roommate to split joint expenses 50/50 and see who owes whom.
                </p>
              </div>
            </div>
            <button className="btn-primary" onClick={onOpenDuoModal}>
              <i className="fa-solid fa-user-plus"></i> Add Second Person
            </button>
          </div>
        </div>
      )}

      {/* History Bar Graph */}
      <HistoryBarChart 
        cashFlowData={dashboardData?.cash_flow_trend}
        title="History Bar Graph (Inflow vs Expenditure Timeline)"
      />

      {/* Recent History Table */}
      <div className="records-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem' }}>
            <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: 8, color: '#818cf8' }}></i>
            Recent Transaction History
          </h3>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={() => window.print()} title="Print Statement / Save PDF">
              <i className="fa-solid fa-print"></i> Print
            </button>
            <button className="btn-secondary" onClick={onViewAllRecords}>
              View Full History <i className="fa-solid fa-arrow-right" style={{ marginLeft: 6 }}></i>
            </button>
          </div>
        </div>

        <LedgerTable 
          transactions={dashboardData?.recent_transactions || []}
          readOnly={true}
          onOpenAddExpense={onOpenAddExpense}
          onOpenAddIncome={onOpenAddIncome}
        />
      </div>
    </div>
  );
}

// ==========================================
// History Bar Graph Component (Chart.js)
// ==========================================
function HistoryBarChart({ cashFlowData, title = "Transaction History Bar Graph" }) {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !cashFlowData || !cashFlowData.length) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');
    const labels = cashFlowData.map(d => d.month);
    const incomeData = cashFlowData.map(d => d.income);
    const expenseData = cashFlowData.map(d => d.expense);

    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Income Gain (आय)',
            data: incomeData,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 6,
            maxBarThickness: 36
          },
          {
            label: 'Expenditure (खर्च)',
            data: expenseData,
            backgroundColor: 'rgba(244, 63, 94, 0.85)',
            borderRadius: 6,
            maxBarThickness: 36
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#64748b', font: { family: 'Outfit', size: 12, weight: '600' } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatINR(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#64748b', font: { family: 'Inter' } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#64748b',
              callback: (val) => formatINRCompact(val)
            }
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, [cashFlowData]);

  return (
    <div className="history-bar-card">
      <div className="chart-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="fa-solid fa-chart-column" style={{ color: '#10b981', fontSize: '1.2rem' }}></i>
          <h3>{title}</h3>
        </div>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Amount in Indian Rupee (₹)</span>
      </div>
      <div className="chart-container" style={{ minHeight: 300 }}>
        <canvas ref={canvasRef}></canvas>
      </div>
    </div>
  );
}

// ==========================================
// History Bar Graph Dedicated Tab
// ==========================================
function HistoryBarGraphTab({ dashboardData, transactions }) {
  const cashFlow = dashboardData?.cash_flow_trend || [];
  const categories = dashboardData?.category_breakdown || [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', fontWeight: 700 }}>
            Historical Financial Timeline
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            Bar graph showing the historical trajectory of your real income gains and expenditures.
          </p>
        </div>
        <button className="btn-secondary" onClick={() => window.print()}>
          <i className="fa-solid fa-print"></i> Print Graph
        </button>
      </div>

      <HistoryBarChart 
        cashFlowData={cashFlow}
        title="Monthly History Bar Graph (Inflow vs Outflow)"
      />

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <h3>Expenditure by Category</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Indian Rupees (₹)</span>
          </div>
          <CategoryDonutChart categories={categories} />
        </div>

        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: 32 }}>
          <div className="stat-icon duo" style={{ width: 56, height: 56, fontSize: '1.6rem', marginBottom: 16 }}>
            <i className="fa-solid fa-scale-balanced"></i>
          </div>
          <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: 6 }}>
            100% Genuine History
          </h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: 300, marginBottom: 16 }}>
            No dummy or fabricated entries are present. Every bar directly reflects the transactions you recorded.
          </p>
          <button className="btn-print" onClick={() => window.print()}>
            <i className="fa-solid fa-file-pdf"></i> Print History Statement
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryDonutChart({ categories }) {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !categories || !categories.length) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');
    const labels = categories.map(c => c.category);
    const data = categories.map(c => c.total);
    const colors = categories.map(c => c.color || '#6366f1');

    chartInstance.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: 'transparent'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#64748b', font: { family: 'Outfit', size: 11 }, boxWidth: 12 }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${formatINR(ctx.parsed)}`
            }
          }
        },
        cutout: '68%'
      }
    });

    return () => {
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, [categories]);

  if (!categories || categories.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '24px 0' }}>
        <p>No category expenditures recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="chart-container" style={{ minHeight: 260 }}>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}

// ==========================================
// Records & History Tab with Print
// ==========================================
function RecordsTab({ 
  transactions, 
  categories, 
  members, 
  filters, 
  onFilterChange, 
  onOpenAddExpense, 
  onOpenAddIncome, 
  onEditTransaction, 
  onDeleteTransaction 
}) {
  const exportToCSV = () => {
    if (!transactions.length) return alert('No transaction records to export.');
    const headers = ['Date', 'Type', 'Category', 'Member', 'Amount (INR)', 'Payment Method', 'Notes', 'Tags'];
    const rows = transactions.map(t => [
      t.date,
      t.type,
      `"${t.category_name}"`,
      `"${t.member_name}"`,
      t.amount,
      `"${t.payment_method}"`,
      `"${(t.notes || '').replace(/"/g, '""')}"`,
      `"${(t.tags || []).join('; ')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Expense_History_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalInflow = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const totalOutflow = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);

  return (
    <div className="records-card">
      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <div className="filter-group-left">
          <div className="search-input-box">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Search history..."
              value={filters.search}
              onChange={e => onFilterChange({ ...filters, search: e.target.value })}
            />
          </div>

          <select 
            className="filter-select"
            value={filters.type}
            onChange={e => onFilterChange({ ...filters, type: e.target.value })}
          >
            <option value="all">All Types (सभी)</option>
            <option value="expense">Expenses Only (खर्च)</option>
            <option value="income">Income Only (कमाई)</option>
          </select>

          <select 
            className="filter-select"
            value={filters.member_id}
            onChange={e => onFilterChange({ ...filters, member_id: e.target.value })}
          >
            <option value="all">All People (Joint)</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
            ))}
          </select>

          <select 
            className="filter-select"
            value={filters.category_id}
            onChange={e => onFilterChange({ ...filters, category_id: e.target.value })}
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
            ))}
          </select>

          <select 
            className="filter-select"
            value={filters.payment_method}
            onChange={e => onFilterChange({ ...filters, payment_method: e.target.value })}
          >
            <option value="all">All Payment Methods</option>
            <option value="UPI / Bank Transfer">UPI / Bank Transfer (GPay/PhonePe/Paytm)</option>
            <option value="Credit Card">Credit Card</option>
            <option value="Debit Card">Debit Card</option>
            <option value="Cash">Cash (नकद)</option>
            <option value="Digital Wallet">Digital Wallet</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Print History Statement Button */}
          <button className="btn-print" onClick={() => window.print()} title="Print Statement / Save PDF">
            <i className="fa-solid fa-print"></i> Print History
          </button>
          <button className="btn-secondary" onClick={exportToCSV} title="Export to Excel / CSV">
            <i className="fa-solid fa-file-csv"></i> CSV
          </button>
          <button className="btn-primary" onClick={onOpenAddExpense} style={{ background: 'var(--expense-gradient)' }}>
            <i className="fa-solid fa-minus"></i> Add Expense
          </button>
          <button className="btn-primary" onClick={onOpenAddIncome} style={{ background: 'var(--gain-gradient)' }}>
            <i className="fa-solid fa-plus"></i> Add Income
          </button>
        </div>
      </div>

      {/* Summary Chips for Filtered History */}
      {transactions.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', fontSize: '0.85rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--gain)', padding: '6px 12px', borderRadius: 8, fontWeight: 600 }}>
            Inflow: +{formatINR(totalInflow)}
          </div>
          <div style={{ background: 'rgba(244, 63, 94, 0.1)', color: 'var(--expense)', padding: '6px 12px', borderRadius: 8, fontWeight: 600 }}>
            Outflow: -{formatINR(totalOutflow)}
          </div>
          <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', padding: '6px 12px', borderRadius: 8, fontWeight: 600 }}>
            Net Balance: {formatINR(totalInflow - totalOutflow)}
          </div>
        </div>
      )}

      {/* Main Ledger Table */}
      <LedgerTable 
        transactions={transactions}
        onEdit={onEditTransaction}
        onDelete={onDeleteTransaction}
        onOpenAddExpense={onOpenAddExpense}
        onOpenAddIncome={onOpenAddIncome}
      />
    </div>
  );
}

// ==========================================
// Reusable Ledger Table
// ==========================================
function LedgerTable({ transactions, readOnly = false, onEdit, onDelete, onOpenAddExpense, onOpenAddIncome }) {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="empty-state">
        <i className="fa-solid fa-file-invoice" style={{ color: 'var(--primary)', opacity: 0.6 }}></i>
        <h4>No Transaction History Recorded Yet</h4>
        <p style={{ maxWidth: 420, margin: '0 auto 18px', color: 'var(--text-muted)' }}>
          Start tracking your genuine income gains and expenses. Click below to record your first entry.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn-primary" onClick={onOpenAddExpense} style={{ background: 'var(--expense-gradient)' }}>
            <i className="fa-solid fa-minus"></i> Record Expense
          </button>
          <button className="btn-primary" onClick={onOpenAddIncome} style={{ background: 'var(--gain-gradient)' }}>
            <i className="fa-solid fa-plus"></i> Record Income
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type & Category</th>
            <th>Attributed Person</th>
            <th>Notes & Details</th>
            <th>Payment Method</th>
            <th style={{ textAlign: 'right' }}>Amount (₹)</th>
            {!readOnly && <th style={{ textAlign: 'center' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {transactions.map(tx => (
            <tr key={tx.id}>
              <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                {tx.date}
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span 
                    className="category-chip" 
                    style={{ borderLeft: `3px solid ${tx.category_color || '#6366f1'}` }}
                  >
                    <i className={`fa-solid ${tx.category_icon || 'fa-tag'}`} style={{ color: tx.category_color }}></i>
                    {tx.category_name}
                  </span>
                </div>
              </td>
              <td>
                <span className="member-chip" style={{ background: `${tx.member_color || '#6366f1'}20`, color: tx.member_color }}>
                  <span className="member-dot" style={{ background: tx.member_color }}></span>
                  {tx.member_name}
                </span>
              </td>
              <td>
                <div style={{ fontWeight: 500 }}>{tx.notes || '—'}</div>
                {tx.tags && tx.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {tx.tags.map((t, idx) => (
                      <span key={idx} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <i className="fa-solid fa-money-bill-wave" style={{ marginRight: 6, opacity: 0.6 }}></i>
                {tx.payment_method}
              </td>
              <td style={{ textAlign: 'right' }}>
                <span className={`amount-display ${tx.type}`}>
                  {tx.type === 'income' ? '+' : '-'}{formatINR(tx.amount)}
                </span>
              </td>
              {!readOnly && (
                <td style={{ textAlign: 'center' }}>
                  <div className="table-actions" style={{ justifyContent: 'center' }}>
                    <button className="action-btn-sm" onClick={() => onEdit(tx)} title="Edit Record">
                      <i className="fa-solid fa-pen"></i>
                    </button>
                    <button className="action-btn-sm delete" onClick={() => onDelete(tx.id)} title="Delete Record">
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ==========================================
// Duo Household Tab ("Two People in One Account")
// ==========================================
function DuoHouseholdTab({ members, dashboardData, onOpenDuoModal, onOpenAddExpense }) {
  const memberStats = dashboardData?.member_stats || [];
  const splitInfo = dashboardData?.split_info;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', fontWeight: 700 }}>
            Two People in One Account (Duo Household)
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            Shared accountability and automatic 50/50 split settlement in Indian Rupees (₹).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={onOpenDuoModal}>
            <i className="fa-solid fa-user-pen"></i> Edit Members
          </button>
          <button className="btn-primary" onClick={onOpenAddExpense} style={{ background: 'var(--expense-gradient)' }}>
            <i className="fa-solid fa-minus"></i> Record Expense
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24, marginBottom: 28 }}>
        {members.map((m) => {
          const stats = memberStats.find(s => s.member_id === m.id) || { total_expense: 0, total_income: 0 };
          const budget = m.monthly_budget || 50000;
          const pct = budget > 0 ? Math.min(Math.round((stats.total_expense / budget) * 100), 100) : 0;

          return (
            <div key={m.id} className="stat-card" style={{ borderTop: `4px solid ${m.avatar_color || '#6366f1'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div className="duo-avatar" style={{ background: m.avatar_color || '#6366f1' }}>
                  {m.name.charAt(0)}
                </div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem' }}>{m.name}</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Role: {m.role} Member</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL SPENT</div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', color: 'var(--expense)', fontWeight: 700 }}>
                    {formatINR(stats.total_expense)}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL EARNED</div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', color: 'var(--gain)', fontWeight: 700 }}>
                    {formatINR(stats.total_income)}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Monthly Budget Limit</span>
                  <span style={{ fontWeight: 600 }}>{formatINR(stats.total_expense)} / {formatINR(budget)} ({pct}%)</span>
                </div>
                <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct > 90 ? 'var(--expense)' : m.avatar_color || 'var(--primary)', borderRadius: 4, transition: 'width 0.4s ease' }}></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {splitInfo && (
        <div className="duo-card">
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: 10 }}>
            <i className="fa-solid fa-scale-balanced" style={{ marginRight: 8, color: '#ec4899' }}></i>
            Fair-Share 50/50 Settlement
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
            {splitInfo.settlement_text.replace(/\$/g, '₹')}
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 16px', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{splitInfo.person1} Spent</span>
              <div style={{ fontWeight: 700 }}>{formatINR(splitInfo.person1_spent)}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 16px', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{splitInfo.person2} Spent</span>
              <div style={{ fontWeight: 700 }}>{formatINR(splitInfo.person2_spent)}</div>
            </div>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(99, 102, 241, 0.3)' }}>
              <span style={{ fontSize: '0.78rem', color: '#c7d2fe' }}>50/50 Target per Person</span>
              <div style={{ fontWeight: 700, color: '#a5b4fc' }}>
                {formatINR((splitInfo.person1_spent + splitInfo.person2_spent) / 2)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// Add / Edit Transaction Modal
// ==========================================
function AddTransactionModal({ isOpen, onClose, categories, members, initialType = 'expense', editingTransaction, onSaved }) {
  const [txType, setTxType] = useState(editingTransaction?.type || initialType);
  const [amount, setAmount] = useState(editingTransaction ? editingTransaction.amount : '');
  const [categoryId, setCategoryId] = useState(editingTransaction ? editingTransaction.category_id : '');
  const [memberId, setMemberId] = useState(editingTransaction ? editingTransaction.member_id : (members[0]?.id || ''));
  const [txDate, setTxDate] = useState(editingTransaction?.date || new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState(editingTransaction?.payment_method || 'UPI / Bank Transfer');
  const [notes, setNotes] = useState(editingTransaction?.notes || '');
  const [tags, setTags] = useState(editingTransaction?.tags ? editingTransaction.tags.join(', ') : '');
  const [submitting, setSubmitting] = useState(false);

  // Filter categories by type
  const availableCategories = useMemo(() => {
    return categories.filter(c => c.type === txType);
  }, [categories, txType]);

  // Sync categoryId when type changes
  useEffect(() => {
    if (availableCategories.length > 0 && !availableCategories.find(c => c.id === Number(categoryId))) {
      setCategoryId(availableCategories[0].id);
    }
  }, [txType, availableCategories]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return alert('Please enter a valid amount in ₹.');
    setSubmitting(true);

    try {
      const payload = {
        type: txType,
        amount: parseFloat(amount),
        category_id: parseInt(categoryId),
        member_id: memberId ? parseInt(memberId) : null,
        date: txDate,
        payment_method: paymentMethod,
        notes,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean)
      };

      if (editingTransaction) {
        await apiRequest(`/transactions/${editingTransaction.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await apiRequest('/transactions', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      onSaved();
    } catch (err) {
      alert('Error saving record: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fa-solid fa-receipt" style={{ marginRight: 10, color: '#818cf8' }}></i>
            {editingTransaction ? 'Edit History Record' : 'Record Transaction (लेन-देन)'}
          </h3>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Expense vs Income Toggle */}
            <div className="type-toggle-pills">
              <button 
                type="button" 
                className={`type-pill ${txType === 'expense' ? 'active expense' : ''}`}
                onClick={() => setTxType('expense')}
              >
                <i className="fa-solid fa-arrow-down" style={{ marginRight: 6 }}></i> Expense (खर्च)
              </button>
              <button 
                type="button" 
                className={`type-pill ${txType === 'income' ? 'active income' : ''}`}
                onClick={() => setTxType('income')}
              >
                <i className="fa-solid fa-arrow-up" style={{ marginRight: 6 }}></i> Income (कमाई)
              </button>
            </div>

            {/* Amount in INR */}
            <div className="form-group">
              <label>Amount in Indian Rupees (₹)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)' }}>
                  ₹
                </span>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0.01" 
                  className="form-control" 
                  placeholder="0.00"
                  style={{ fontSize: '1.4rem', fontWeight: 700, paddingLeft: 40 }}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Category */}
              <div className="form-group">
                <label>Category</label>
                <select 
                  className="form-control"
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  required
                >
                  {availableCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Attribution (Person 1 or Person 2) */}
              <div className="form-group">
                <label>Person Attributed</label>
                <select 
                  className="form-control"
                  value={memberId}
                  onChange={e => setMemberId(e.target.value)}
                >
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Date */}
              <div className="form-group">
                <label>Date</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={txDate}
                  onChange={e => setTxDate(e.target.value)}
                  required
                />
              </div>

              {/* Payment Method */}
              <div className="form-group">
                <label>Payment Method</label>
                <select 
                  className="form-control"
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                >
                  <option value="UPI / Bank Transfer">UPI / GPay / PhonePe / Paytm</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Debit Card">Debit Card</option>
                  <option value="Cash">Cash (नकद)</option>
                  <option value="Net Banking">Net Banking</option>
                  <option value="Digital Wallet">Digital Wallet</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div className="form-group">
              <label>Description / Notes</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. Grocery store, electricity bill, or monthly stipend"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Tags */}
            <div className="form-group">
              <label>Tags (comma-separated)</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. groceries, weekend, home"
                value={tags}
                onChange={e => setTags(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : editingTransaction ? 'Update Entry' : 'Save Entry (दर्ज करें)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// Manage Duo Modal ("Add Two People in One Account")
// ==========================================
function ManageDuoModal({ isOpen, onClose, members, activeAccount, onUpdated }) {
  const [partnerName, setPartnerName] = useState('');
  const [partnerRole, setPartnerRole] = useState('Partner');
  const [partnerBudget, setPartnerBudget] = useState('40000');
  const [avatarColor, setAvatarColor] = useState('#ec4899');
  const [submitting, setSubmitting] = useState(false);

  const handleAddPartner = async (e) => {
    e.preventDefault();
    if (!partnerName.trim()) return;
    setSubmitting(true);

    try {
      await apiRequest('/members', {
        method: 'POST',
        body: JSON.stringify({
          name: partnerName.trim(),
          role: partnerRole,
          monthly_budget: parseFloat(partnerBudget) || 0,
          avatar_color: avatarColor
        })
      });
      setPartnerName('');
      onUpdated();
      onClose();
    } catch (err) {
      alert('Failed to add member: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fa-solid fa-user-group" style={{ marginRight: 10, color: '#ec4899' }}></i>
            Household Duo (Two People in One Account)
          </h3>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 18 }}>
            Add or manage two people in your account (<strong>{activeAccount?.name}</strong>) to track both individual and joint expenditures.
          </p>

          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>
              Current Members ({members.length}/2)
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="duo-avatar" style={{ width: 36, height: 36, fontSize: '1rem', background: m.avatar_color || '#6366f1' }}>
                      {m.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{m.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Role: {m.role} • Budget: {formatINR(m.monthly_budget)}</div>
                    </div>
                  </div>
                  <span className="badge-trend up" style={{ fontSize: '0.7rem' }}>Active</span>
                </div>
              ))}
            </div>
          </div>

          {members.length < 2 ? (
            <form onSubmit={handleAddPartner}>
              <h4 style={{ fontSize: '0.9rem', color: '#c7d2fe', marginBottom: 12 }}>
                <i className="fa-solid fa-plus-circle" style={{ marginRight: 6 }}></i> Add Second Person (Partner / Roommate)
              </h4>

              <div className="form-group">
                <label>Full Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Partner Name"
                  value={partnerName}
                  onChange={e => setPartnerName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Role</label>
                  <select 
                    className="form-control"
                    value={partnerRole}
                    onChange={e => setPartnerRole(e.target.value)}
                  >
                    <option value="Partner">Partner</option>
                    <option value="Roommate">Roommate</option>
                    <option value="Co-Spender">Co-Spender</option>
                    <option value="Family">Family</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Monthly Budget (₹)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={partnerBudget}
                    onChange={e => setPartnerBudget(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={submitting}>
                <i className="fa-solid fa-user-check"></i> Add to Joint Account
              </button>
            </form>
          ) : (
            <div style={{ padding: '14px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 8, fontSize: '0.85rem', color: 'var(--gain)' }}>
              <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }}></i>
              Your duo household is complete! You can assign any transaction to Person 1, Person 2, or both.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Account Switcher Modal
// ==========================================
function AccountSwitcherModal({ isOpen, onClose, accounts, activeAccount, onSelectAccount, onAccountCreated }) {
  const [newAccName, setNewAccName] = useState('');
  const [accType, setAccType] = useState('joint');
  const [partnerName, setPartnerName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newAccName.trim()) return;
    setCreating(true);

    try {
      const res = await apiRequest('/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: newAccName.trim(),
          account_type: accType,
          currency: '₹',
          partner_name: partnerName.trim()
        })
      });
      setNewAccName('');
      setPartnerName('');
      onAccountCreated(res);
    } catch (err) {
      alert('Error creating account: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fa-solid fa-wallet" style={{ marginRight: 10, color: '#818cf8' }}></i>
            Multi-User Account Switcher
          </h3>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>
            Switch Active Vault
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {accounts.map(acc => {
              const isActive = activeAccount?.id === acc.id;
              return (
                <div 
                  key={acc.id}
                  onClick={() => onSelectAccount(acc.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isActive ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border-subtle)'}`,
                    padding: '12px 16px',
                    borderRadius: 10,
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="duo-avatar" style={{ width: 36, height: 36, fontSize: '1rem', background: isActive ? 'var(--primary)' : '#475569' }}>
                      <i className={`fa-solid ${acc.account_type === 'joint' ? 'fa-people-arrows' : 'fa-user'}`}></i>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{acc.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {acc.account_type === 'joint' ? 'Duo Joint Vault' : 'Individual'} • Currency: ₹
                      </div>
                    </div>
                  </div>
                  {isActive && <span className="badge-trend up">Active</span>}
                </div>
              );
            })}
          </div>

          <form onSubmit={handleCreate} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 18 }}>
            <h4 style={{ fontSize: '0.95rem', color: '#c7d2fe', marginBottom: 12 }}>
              <i className="fa-solid fa-folder-plus" style={{ marginRight: 6 }}></i> Create New Vault
            </h4>

            <div className="form-group">
              <label>Account / Vault Name</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. Home Budget or Savings Vault"
                value={newAccName}
                onChange={e => setNewAccName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Account Type</label>
              <select 
                className="form-control"
                value={accType}
                onChange={e => setAccType(e.target.value)}
              >
                <option value="joint">Joint (Two People in one account)</option>
                <option value="individual">Individual</option>
              </select>
            </div>

            {accType === 'joint' && (
              <div className="form-group">
                <label>Second Person Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Partner Name"
                  value={partnerName}
                  onChange={e => setPartnerName(e.target.value)}
                />
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={creating}>
              {creating ? 'Creating...' : 'Create Account'}
            </button>
          </form>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Database Settings Modal (MySQL Server Link)
// ==========================================
function DatabaseSettingsModal({ isOpen, onClose, dbInfo, onConnected }) {
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('3306');
  const [user, setUser] = useState('root');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('expense_tracker');
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleTestMySQL = async (e) => {
    e.preventDefault();
    setTesting(true);
    setMsg(null);

    try {
      const res = await apiRequest('/db/test-mysql', {
        method: 'POST',
        body: JSON.stringify({ host, port: parseInt(port), user, password, database })
      });
      setMsg({ type: 'success', text: res.message });
      onConnected(res.info);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fa-solid fa-database" style={{ marginRight: 10, color: '#10b981' }}></i>
            MySQL Database Engine
          </h3>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div style={{
            background: dbInfo.type?.includes('MySQL') ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            border: `1px solid ${dbInfo.type?.includes('MySQL') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            padding: 14,
            borderRadius: 8,
            marginBottom: 20
          }}>
            <div style={{ fontWeight: 600, color: dbInfo.type?.includes('MySQL') ? 'var(--gain)' : 'var(--warning)', marginBottom: 4 }}>
              Current Engine: {dbInfo.type}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {dbInfo.message}
            </p>
          </div>

          <form onSubmit={handleTestMySQL}>
            <h4 style={{ fontSize: '0.95rem', color: '#c7d2fe', marginBottom: 12 }}>
              Link Local MySQL 8.0 Server
            </h4>

            {msg && (
              <div style={{
                background: msg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                color: msg.type === 'success' ? 'var(--gain)' : 'var(--expense)',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: '0.85rem',
                marginBottom: 14
              }}>
                {msg.text}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>MySQL Host</label>
                <input type="text" className="form-control" value={host} onChange={e => setHost(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Port</label>
                <input type="number" className="form-control" value={port} onChange={e => setPort(e.target.value)} required />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>User</label>
                <input type="text" className="form-control" value={user} onChange={e => setUser(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" className="form-control" placeholder="Root password" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label>Database Name</label>
              <input type="text" className="form-control" value={database} onChange={e => setDatabase(e.target.value)} required />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={testing}>
              {testing ? 'Connecting & Migrating...' : 'Test & Connect to MySQL'}
            </button>
          </form>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Footer Component
// ==========================================
function Footer() {
  return (
    <footer className="footer">
      <div>
        Multi-User Expense & Duo Household Tracker • Crafted with precision by <strong>Shradha Thakur</strong>
      </div>
      <div className="footer-links">
        <span><i className="fa-solid fa-indian-rupee-sign"></i> Indian Rupees (₹)</span>
        <span>•</span>
        <span><i className="fa-solid fa-code"></i> React 18 + Flask</span>
        <span>•</span>
        <span><i className="fa-solid fa-database"></i> MySQL 8.0 & PostgreSQL</span>
        <span>•</span>
        <span><i className="fa-solid fa-print"></i> Printable Statements</span>
      </div>
    </footer>
  );
}

// ==========================================
// Toast Notification Component
// ==========================================
function Toast({ toast, onClose }) {
  return (
    <div className="toast-container">
      <div className={`toast ${toast.type}`}>
        <i className={`fa-solid ${toast.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`}></i>
        <span>{toast.message}</span>
      </div>
    </div>
  );
}

// Mount the React Application
ReactDOM.render(<App />, document.getElementById('root'));
