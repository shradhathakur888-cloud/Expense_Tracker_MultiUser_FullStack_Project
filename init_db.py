from database import setup_database, get_engine
from models import Base
from seed_data import seed_default_categories

def init():
    print("[INIT] Setting up database connection...")
    setup_database()
    engine = get_engine()
    print("[INIT] Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("[INIT] Seeding standard categories (clean, zero fake transactions)...")
    seed_default_categories()
    print("[INIT] Database initialized with 0 fake data. Ready for real user!")

if __name__ == '__main__':
    init()
