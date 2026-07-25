"""
RetryAgent: Stage 3b of the AutoOps pipeline.
Re-runs extraction on items that failed the confidence threshold,
up to max_retries times, before giving up and discarding them.
"""

from typing import List


class RetryAgent:
    def __init__(self, max_retries: int = 3):
        self.max_retries = max_retries

    def run(self, low_confidence_items: List[dict], extract_agent, cleaned_text: str) -> List[dict]:
        recovered = []

        for item in low_confidence_items:
            attempts = 0
            current_score = item.get("confidence_score", 0.0)

            while attempts < self.max_retries and current_score < 0.6:
                # Re-prompt the extraction agent narrowly on just this candidate sentence.
                # This focuses the LLM on a smaller surface area, which in practice
                # raises confidence for borderline extractions.
                retried = extract_agent.run(item["description"])
                attempts += 1

                if retried:
                    current_score = retried[0].get("confidence_score", current_score)
                    item.update(retried[0])

            item["retry_count"] = attempts
            if current_score >= 0.6:
                item["status"] = "pending"
                recovered.append(item)
            else:
                item["status"] = "failed"
                # Items that never clear the bar are logged, not silently dropped,
                # so a human can review them later if needed.
                recovered.append(item)

        return recovered
