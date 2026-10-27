"""SQLite persistence with opaque session capabilities and atomic mutations."""
from __future__ import annotations
import hashlib
import hmac
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from threading import RLock
from typing import Callable


class Store:
    def __init__(self, path: str):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.lock = RLock()
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, state TEXT NOT NULL)")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def digest(key: str) -> str:
        return hashlib.sha256(key.encode()).hexdigest()

    def create(self, state: dict, key: str) -> None:
        with self.lock, self.connect() as db:
            db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (state["id"], self.digest(key), json.dumps(state)))

    def _load(self, db, session_id: str, key: str) -> dict:
        row = db.execute("SELECT key_hash, state FROM sessions WHERE id=?", (session_id,)).fetchone()
        if row is None or not hmac.compare_digest(row[0], self.digest(key)):
            raise KeyError("Session not found or its access key is missing.")
        return json.loads(row[1])

    def get(self, session_id: str, key: str) -> dict:
        with self.lock, self.connect() as db:
            return self._load(db, session_id, key)

    def mutate(self, session_id: str, key: str, fn: Callable[[dict], None]) -> dict:
        with self.lock, self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            state = self._load(db, session_id, key)
            fn(state)
            db.execute("UPDATE sessions SET state=? WHERE id=?", (json.dumps(state), session_id))
            return state
