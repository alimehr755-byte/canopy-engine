from __future__ import annotations

import math
import os
import statistics
import threading
from typing import Any

from text_normalizer import (
    heuristic_perplexity,
    label_for,
    length_statistics,
    probability_from,
    split_sentences,
)

MODEL_NAME = os.environ.get("AI_MODEL", "gpt2")
MAX_SENTENCE_TOKENS = int(os.environ.get("MAX_SENTENCE_TOKENS", "256"))
ALLOW_MODEL_DOWNLOAD = os.environ.get("ALLOW_MODEL_DOWNLOAD", "true").lower() != "false"

_model_lock = threading.Lock()
_model_bundle: dict[str, Any] | None = None
_model_error: str | None = None


def model_error() -> str | None:
    return _model_error


def is_model_loaded() -> bool:
    return _model_bundle is not None


def load_model() -> dict[str, Any] | None:
    global _model_bundle, _model_error
    if _model_bundle is not None:
        return _model_bundle
    if _model_error is not None:
        return None

    with _model_lock:
        if _model_bundle is not None:
            return _model_bundle
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer

            torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
            tokenizer = AutoTokenizer.from_pretrained(
                MODEL_NAME, local_files_only=not ALLOW_MODEL_DOWNLOAD
            )
            model = AutoModelForCausalLM.from_pretrained(
                MODEL_NAME, local_files_only=not ALLOW_MODEL_DOWNLOAD
            )
            model.eval()
            if tokenizer.pad_token is None:
                tokenizer.pad_token = tokenizer.eos_token
            _model_bundle = {"tokenizer": tokenizer, "model": model, "torch": torch}
            return _model_bundle
        except Exception as error:  # noqa: BLE001
            _model_error = str(error)
            return None


def sentence_perplexities(sentences: list[str]) -> list[float]:
    bundle = load_model()
    if bundle is None:
        return []

    tokenizer = bundle["tokenizer"]
    model = bundle["model"]
    torch = bundle["torch"]

    results: list[float] = []
    batch_size = 6
    with torch.no_grad():
        for offset in range(0, len(sentences), batch_size):
            batch = sentences[offset : offset + batch_size]
            encoded = tokenizer(
                batch,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=MAX_SENTENCE_TOKENS,
            )
            input_ids = encoded["input_ids"]
            attention_mask = encoded["attention_mask"]
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            logits = outputs.logits[:, :-1, :]
            targets = input_ids[:, 1:]
            mask = attention_mask[:, 1:].bool()
            log_probs = torch.log_softmax(logits, dim=-1)
            gathered = log_probs.gather(-1, targets.unsqueeze(-1)).squeeze(-1)
            negative = -gathered
            for index in range(len(batch)):
                token_mask = mask[index]
                count = int(token_mask.sum().item())
                if count == 0:
                    results.append(90.0)
                    continue
                loss = float((negative[index] * token_mask).sum().item() / count)
                results.append(float(math.exp(min(loss, 20.0))))
    return results


def warmup() -> dict[str, Any]:
    bundle = load_model()
    return {"loaded": bundle is not None, "error": _model_error}


def analyze_text(text: str, provider: str = "transformers", model_name: str | None = None) -> dict[str, Any]:
    model_name = model_name or MODEL_NAME
    spans = split_sentences(text)
    if not spans:
        return {
            "overall_score": 0.0,
            "perplexity": 0.0,
            "burstiness": 0.0,
            "mean_sentence_length": 0.0,
            "provider": provider,
            "model": model_name,
            "sentence_scores": [],
            "unavailable_reason": "Text is too short for sentence-level analysis.",
        }

    sentences = [span["sentence"] for span in spans]
    perplexities = sentence_perplexities(sentences)
    used_provider = provider
    reason: str | None = None
    if not perplexities:
        perplexities = heuristic_perplexity(sentences)
        used_provider = "python-heuristic"
        reason = _model_error or "Transformer model unavailable; lexical calibration applied."

    mean_length, burstiness = length_statistics(spans)
    scored: list[dict[str, Any]] = []
    for span, perplexity in zip(spans, perplexities):
        probability = probability_from(perplexity, burstiness, mean_length)
        scored.append(
            {
                "sentence": span["sentence"],
                "start_index": span["start"],
                "end_index": span["end"],
                "ai_probability": round(probability, 3),
                "label": label_for(probability),
            }
        )

    overall = 100.0 * statistics.fmean([score["ai_probability"] for score in scored])
    return {
        "overall_score": round(overall, 1),
        "perplexity": round(statistics.fmean(perplexities), 1),
        "burstiness": round(burstiness, 2),
        "mean_sentence_length": round(mean_length, 1),
        "provider": used_provider,
        "model": model_name,
        "sentence_scores": scored,
        "unavailable_reason": reason,
    }
