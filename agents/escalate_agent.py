"""
EscalateAgent: Stage 6 (final) of the AutoOps pipeline.
Flags items that need human attention: unassigned owners, high-priority
items, or anything already past its due date at creation time.
"""

from datetime import datetime
from typing import List, Tuple


class EscalateAgent:
    def run(self, monitored_items: List[dict]) -> Tuple[List[dict], int]:
        today = datetime.utcnow().date()
        escalated_count = 0

        for item in monitored_items:
            should_escalate = False

            if item.get("owner") is None:
                should_escalate = True

            if item.get("priority") == "high":
                should_escalate = True

            due_date_str = item.get("due_date")
            if due_date_str:
                due_date = datetime.fromisoformat(due_date_str).date()
                if due_date < today:
                    should_escalate = True

            if should_escalate and item.get("status") != "failed":
                item["status"] = "escalated"
                escalated_count += 1

        return monitored_items, escalated_count
