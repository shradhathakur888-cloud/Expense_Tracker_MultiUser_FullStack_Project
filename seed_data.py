from database import get_session
from models import Category

DEFAULT_CATEGORIES = [
    # Expenses
    {"name": "Food & Dining", "type": "expense", "icon": "fa-utensils", "color": "#f59e0b"},
    {"name": "Groceries", "type": "expense", "icon": "fa-basket-shopping", "color": "#10b981"},
    {"name": "Housing & Rent", "type": "expense", "icon": "fa-house", "color": "#6366f1"},
    {"name": "Utilities & Bills", "type": "expense", "icon": "fa-bolt", "color": "#3b82f6"},
    {"name": "Transport & Fuel", "type": "expense", "icon": "fa-car", "color": "#06b6d4"},
    {"name": "Shopping & Lifestyle", "type": "expense", "icon": "fa-bag-shopping", "color": "#ec4899"},
    {"name": "Health & Fitness", "type": "expense", "icon": "fa-heart-pulse", "color": "#ef4444"},
    {"name": "Entertainment & Fun", "type": "expense", "icon": "fa-film", "color": "#8b5cf6"},
    {"name": "Travel & Vacation", "type": "expense", "icon": "fa-plane", "color": "#f97316"},
    {"name": "Subscriptions", "type": "expense", "icon": "fa-repeat", "color": "#a855f7"},
    {"name": "Investments & Savings", "type": "expense", "icon": "fa-chart-pie", "color": "#14b8a6"},
    {"name": "Miscellaneous", "type": "expense", "icon": "fa-layer-group", "color": "#64748b"},
    # Income
    {"name": "Primary Salary", "type": "income", "icon": "fa-money-bill-wave", "color": "#10b981"},
    {"name": "Freelance & Consulting", "type": "income", "icon": "fa-laptop-code", "color": "#3b82f6"},
    {"name": "Investments & Dividends", "type": "income", "icon": "fa-arrow-trend-up", "color": "#8b5cf6"},
    {"name": "Bonus & Rewards", "type": "income", "icon": "fa-gift", "color": "#ec4899"},
    {"name": "Side Hustle", "type": "income", "icon": "fa-rocket", "color": "#f59e0b"}
]

def seed_default_categories(account_id=None):
    """Seed base categories for system or specific account (No fake transactions)."""
    session = get_session()
    created = []
    for cat_data in DEFAULT_CATEGORIES:
        exists = session.query(Category).filter_by(
            account_id=account_id,
            name=cat_data["name"],
            type=cat_data["type"]
        ).first()
        if not exists:
            cat = Category(
                account_id=account_id,
                name=cat_data["name"],
                type=cat_data["type"],
                icon=cat_data["icon"],
                color=cat_data["color"],
                is_default=True
            )
            session.add(cat)
            created.append(cat)
    session.commit()
    return created
