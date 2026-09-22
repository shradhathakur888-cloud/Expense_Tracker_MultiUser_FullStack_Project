from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Text, Date, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from werkzeug.security import generate_password_hash, check_password_hash
from database import Base

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(80), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(120), nullable=False)
    active_account_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    accounts_created = relationship('Account', back_populates='creator', cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'full_name': self.full_name,
            'active_account_id': self.active_account_id,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }

class Account(Base):
    __tablename__ = 'accounts'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    account_type = Column(String(20), default='individual') # 'individual' or 'joint'
    currency = Column(String(10), default='₹')
    created_by_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    creator = relationship('User', back_populates='accounts_created')
    members = relationship('AccountMember', back_populates='account', cascade='all, delete-orphan')
    transactions = relationship('Transaction', back_populates='account', cascade='all, delete-orphan')
    categories = relationship('Category', back_populates='account', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'account_type': self.account_type,
            'currency': self.currency,
            'created_by_id': self.created_by_id,
            'members_count': len(self.members) if self.members else 0,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }

class AccountMember(Base):
    """Represents members of an account. Enables 'add two people in one account' (e.g. Shradha & Partner)."""
    __tablename__ = 'account_members'

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    name = Column(String(100), nullable=False)
    role = Column(String(50), default='Primary') # 'Primary', 'Partner', 'Co-spender'
    avatar_color = Column(String(30), default='#6366f1')
    monthly_budget = Column(Float, default=0.0)
    email = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    account = relationship('Account', back_populates='members')
    transactions = relationship('Transaction', back_populates='member')

    def to_dict(self):
        return {
            'id': self.id,
            'account_id': self.account_id,
            'user_id': self.user_id,
            'name': self.name,
            'role': self.role,
            'avatar_color': self.avatar_color,
            'monthly_budget': self.monthly_budget,
            'email': self.email,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }

class Category(Base):
    __tablename__ = 'categories'

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(20), nullable=False) # 'expense' or 'income'
    icon = Column(String(50), default='fa-tag')
    color = Column(String(30), default='#10b981')
    is_default = Column(Boolean, default=False)

    # Relationships
    account = relationship('Account', back_populates='categories')
    transactions = relationship('Transaction', back_populates='category')

    def to_dict(self):
        return {
            'id': self.id,
            'account_id': self.account_id,
            'name': self.name,
            'type': self.type,
            'icon': self.icon,
            'color': self.color,
            'is_default': self.is_default
        }

class Transaction(Base):
    __tablename__ = 'transactions'

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey('account_members.id', ondelete='SET NULL'), nullable=True, index=True)
    type = Column(String(20), nullable=False, index=True) # 'income' or 'expense'
    amount = Column(Float, nullable=False)
    category_id = Column(Integer, ForeignKey('categories.id', ondelete='RESTRICT'), nullable=False)
    date = Column(Date, nullable=False, index=True)
    payment_method = Column(String(50), default='Credit Card')
    notes = Column(Text, nullable=True)
    tags = Column(String(255), default='')
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    account = relationship('Account', back_populates='transactions')
    member = relationship('AccountMember', back_populates='transactions')
    category = relationship('Category', back_populates='transactions')

    def to_dict(self):
        return {
            'id': self.id,
            'account_id': self.account_id,
            'member_id': self.member_id,
            'member_name': self.member.name if self.member else 'Unassigned',
            'member_color': self.member.avatar_color if self.member else '#94a3b8',
            'type': self.type,
            'amount': float(self.amount),
            'category_id': self.category_id,
            'category_name': self.category.name if self.category else 'General',
            'category_icon': self.category.icon if self.category else 'fa-tag',
            'category_color': self.category.color if self.category else '#64748b',
            'date': self.date.strftime('%Y-%m-%d') if self.date else '',
            'payment_method': self.payment_method,
            'notes': self.notes or '',
            'tags': [t.strip() for t in self.tags.split(',') if t.strip()] if self.tags else [],
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }
