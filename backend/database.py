import os
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, inspect
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

# Local SQLite Database file banegi 'hazard_logs.db' naam se
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./hazard_logs.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class HazardLog(Base):
    __tablename__ = "hazard_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    severity = Column(String)
    risk_score = Column(Integer)
    hazards_detected = Column(String)  # Comma-separated hazards
    audio_url = Column(String, nullable=True)


class CampusHazardLog(Base):
    __tablename__ = "campus_hazards"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    location_name = Column(String)
    hazard_type = Column(String)
    severity = Column(String)
    assigned_dept = Column(String)
    status = Column(String, default="Pending")
    image_url = Column(String, nullable=True)
    department_name = Column(String, nullable=True)
    room_name = Column(String, nullable=True)
    description = Column(String, nullable=True)
    rejection_reason = Column(String, nullable=True)


# Tables auto-create honge jab server chalega
Base.metadata.create_all(bind=engine)

# Add fields introduced after the initial campus-report table was created.
with engine.begin() as connection:
    existing_columns = {
        column["name"] for column in inspect(connection).get_columns("campus_hazards")
    }
    for column_name in ("department_name", "room_name", "description", "rejection_reason"):
        if column_name not in existing_columns:
            connection.exec_driver_sql(f"ALTER TABLE campus_hazards ADD COLUMN {column_name} VARCHAR")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()