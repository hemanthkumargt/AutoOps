"""
AssignAgent: Stage 4 of the AutoOps pipeline.
Assigns each validated action item to an owner — using the owner the
extraction agent identified, or falling back to round-robin assignment
across known meeting participants when ownership is ambiguous.
"""

from typing import List, Optional


class AssignAgent:
    def run(self, validated_items: List[dict], participants: Optional[List[str]] = None) -> List[dict]:
        participants = participants or []
        rr_index = 0

        for item in validated_items:
            if item.get("owner"):
                item["status"] = "assigned"
                continue

            if participants:
                # Round-robin fallback when the transcript didn't make ownership explicit
                item["owner"] = participants[rr_index % len(participants)]
                rr_index += 1
                item["status"] = "assigned"
            else:
                item["owner"] = None
                item["status"] = "pending"  # stays unassigned, will get escalated later

        return validated_items
