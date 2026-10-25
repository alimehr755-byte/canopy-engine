from __future__ import annotations

import math
import re
import statistics
from typing import Any

SENTENCE_PATTERN = re.compile(r"[^.!?\n]+[.!?]+[\"')\]]*|[^.!?\n]+$")
WORD_PATTERN = re.compile(r"[\w'’\-]+", re.UNICODE)
MAX_SENTENCES = 240


def split_sentences(text: str, max_sentences: int = MAX_SENTENCES) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    for match in SENTENCE_PATTERN.finditer(text):
        raw = match.group(0)
        if not raw:
            continue
        leading = len(raw) - len(raw.lstrip())
        trimmed = raw.strip()
        if not trimmed:
            continue
        words = WORD_PATTERN.findall(trimmed)
        if len(words) < 3:
            continue
        start = match.start() + leading
        spans.append(
            {
                "sentence": trimmed,
                "start": start,
                "end": start + len(trimmed),
                "words": len(words),
            }
        )
        if len(spans) >= max_sentences:
            break
    return spans


def label_for(probability: float) -> str:
    if probability < 0.45:
        return "human"
    if probability < 0.7:
        return "mixed"
    return "ai"


def length_statistics(spans: list[dict[str, Any]]) -> tuple[float, float]:
    lengths = [span["words"] for span in spans]
    mean_length = statistics.fmean(lengths)
    deviation = statistics.pstdev(lengths) if len(lengths) > 1 else 0.0
    burstiness = deviation / mean_length if mean_length > 0 else 0.0
    return mean_length, burstiness


def heuristic_perplexity(sentences: list[str]) -> list[float]:
    frequencies: dict[str, int] = {}
    total = 0
    for sentence in sentences:
        for word in WORD_PATTERN.findall(sentence.lower()):
            total += 1
            frequencies[word] = frequencies.get(word, 0) + 1
    if total == 0:
        return [90.0 for _ in sentences]

    results: list[float] = []
    for sentence in sentences:
        words = WORD_PATTERN.findall(sentence.lower())
        if not words:
            results.append(90.0)
            continue
        likelihood = 0.0
        for word in words:
            likelihood += math.log((frequencies.get(word, 1) or 1) / total)
        results.append(float(math.exp(-likelihood / len(words))))
    return results


def probability_from(perplexity: float, burstiness: float, mean_length: float) -> float:
    safe = max(1.0, perplexity)
    perplexity_signal = 1.0 / (1.0 + math.exp((math.log(safe) - math.log(45.0)) / 0.55))
    burstiness_signal = 1.0 / (1.0 + burstiness * 2.4)
    length_signal = 1.0 / (1.0 + abs(mean_length - 19.0) / 32.0)
    combined = 0.68 * perplexity_signal + 0.22 * burstiness_signal + 0.1 * length_signal
    return max(0.01, min(0.99, combined))
