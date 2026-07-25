"""
MonitorAgent: Stage 5 of the AutoOps pipeline.
Normalizes due dates and sets up the tracking state each item needs
before it can be checked for overdue/escalation status downstream.
"""

from datetime import datetime, timedelta
from typing import List

PRIORITY_DEFAULT_WINDOW_DAYS = {
    "high": 2,
    "medium": 5,
    "low": 10,
}


class MonitorAgent:
    def run(self, assigned_items: List[dict]) -> List[dict]:
        today = datetime.utcnow().date()

        for item in assigned_items:
            if not item.get("due_date"):
                window = PRIORITY_DEFAULT_WINDOW_DAYS.get(item.get("priority", "medium"), 5)
                item["due_date"] = (today + timedelta(days=window)).isoformat()

            item["created_at"] = today.isoformat()

        return assigned_items
