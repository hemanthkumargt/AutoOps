"""
ValidateAgent: Stage 3 of the AutoOps pipeline.
Splits extracted items into "validated" (high confidence) and
"low_confidence" (sent to RetryAgent) based on a configurable threshold.
"""

from typing import List, Tuple


class ValidateAgent:
    def __init__(self, confidence_threshold: float = 0.6):
        self.confidence_threshold = confidence_threshold

    def run(self, raw_items: List[dict]) -> Tuple[List[dict], List[dict]]:
        validated, low_confidence = [], []

        for item in raw_items:
            # Basic structural validation first
            if not item.get("description") or len(item["description"].strip()) < 5:
                continue

            score = item.get("confidence_score", 0.0)
            item["status"] = "pending"
            item["retry_count"] = 0

            if score >= self.confidence_threshold:
                validated.append(item)
            else:
                low_confidence.append(item)

        return validated, low_confidence
