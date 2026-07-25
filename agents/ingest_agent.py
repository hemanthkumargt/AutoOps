"""
IngestAgent: Stage 1 of the AutoOps pipeline.
Cleans raw transcript text — removes filler, normalizes speaker tags,
and chunks long transcripts so downstream LLM calls stay within context limits.
"""

import re


class IngestAgent:
    FILLER_PATTERNS = [
        r"\b(um|uh|like|you know|i mean)\b",
        r"\[inaudible\]",
        r"\[crosstalk\]",
    ]

    def run(self, raw_transcript: str) -> str:
        text = raw_transcript.strip()

        # Normalize whitespace
        text = re.sub(r"\s+", " ", text)

        # Strip common filler words/transcription artifacts (case-insensitive)
        for pattern in self.FILLER_PATTERNS:
            text = re.sub(pattern, "", text, flags=re.IGNORECASE)

        # Normalize speaker tags like "JOHN:" or "[John Doe]" into a consistent format
        text = re.sub(r"\[([A-Za-z ]+)\]\s*:", r"\1:", text)

        return text.strip()

    def chunk(self, text: str, max_chars: int = 4000) -> list[str]:
        """Splits long transcripts into LLM-context-safe chunks on sentence boundaries."""
        if len(text) <= max_chars:
            return [text]

        sentences = re.split(r"(?<=[.!?])\s+", text)
        chunks, current = [], ""
        for sentence in sentences:
            if len(current) + len(sentence) > max_chars:
                chunks.append(current.strip())
                current = sentence
            else:
                current += " " + sentence
        if current:
            chunks.append(current.strip())
        return chunks
