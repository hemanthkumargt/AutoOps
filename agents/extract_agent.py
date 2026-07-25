"""
ExtractAgent: Stage 2 of the AutoOps pipeline.
Calls an LLM with a structured-output prompt to pull candidate action items
out of a cleaned meeting transcript.
"""

import os
import json
from typing import List, Optional

try:
    from anthropic import Anthropic
    _CLIENT = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
except ImportError:
    _CLIENT = None

EXTRACTION_PROMPT = """You are an extraction agent. Read the meeting transcript below and \
identify every concrete action item — a task someone agreed to do, with an implied or \
explicit owner and deadline if mentioned.

Return ONLY a JSON array. Each object must have these fields:
- "description": string, the action item in clear imperative form
- "owner": string or null, the person's name if mentioned or clearly implied
- "due_date": string or null, in YYYY-MM-DD format if a date/timeframe was mentioned
- "priority": one of "low", "medium", "high"
- "confidence_score": float between 0 and 1, how confident you are this is a real action item

Do not include anything that is not a real, actionable task. Do not add commentary.

Transcript:
{transcript}
"""


class ExtractAgent:
    def __init__(self, model: str = "claude-sonnet-4-5"):
        self.model = model

    def run(self, cleaned_text: str, participants: Optional[List[str]] = None) -> List[dict]:
        if _CLIENT is None or not os.environ.get("ANTHROPIC_API_KEY"):
            # Fallback: simple heuristic extraction so the pipeline still runs
            # end-to-end without an API key configured (useful for demos/tests).
            return self._heuristic_extract(cleaned_text, participants)

        prompt = EXTRACTION_PROMPT.format(transcript=cleaned_text)
        response = _CLIENT.messages.create(
            model=self.model,
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = response.content[0].text.strip()

        try:
            items = json.loads(raw_text)
        except json.JSONDecodeError:
            # LLM occasionally wraps JSON in markdown fences — strip and retry once
            cleaned = raw_text.strip("`").lstrip("json").strip()
            items = json.loads(cleaned)

        return items

    def _heuristic_extract(self, text: str, participants: Optional[List[str]]) -> List[dict]:
        """Naive fallback used only when no LLM key is present (offline/demo mode)."""
        sentences = [s.strip() for s in text.split(".") if s.strip()]
        action_keywords = ["will", "need to", "should", "must", "going to", "follow up", "send"]
        items = []
        for sentence in sentences:
            if any(kw in sentence.lower() for kw in action_keywords):
                owner = next((p for p in (participants or []) if p.lower() in sentence.lower()), None)
                items.append({
                    "description": sentence,
                    "owner": owner,
                    "due_date": None,
                    "priority": "medium",
                    "confidence_score": 0.55,
                })
        return items
