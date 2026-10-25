from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from ai_detector import (ALLOW_MODEL_DOWNLOAD, MODEL_NAME, analyze_text, is_model_loaded, model_error, warmup)

app = FastAPI(title="Veritas AI Writing Engine", version="1.0.0")


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1)
    model: str | None = None


class SentenceScore(BaseModel):
    sentence: str
    start_index: int
    end_index: int
    ai_probability: float
    label: str


class AnalyzeResponse(BaseModel):
    overall_score: float
    perplexity: float
    burstiness: float
    mean_sentence_length: float
    provider: str
    model: str
    sentence_scores: list[SentenceScore]
    unavailable_reason: str | None = None


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "loaded": is_model_loaded(),
        "downloadAllowed": ALLOW_MODEL_DOWNLOAD,
        "error": model_error(),
    }


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> dict[str, Any]:
    return analyze_text(request.text, provider="transformers", model_name=request.model)


@app.post("/warmup")
def warm_up() -> dict[str, Any]:
    return warmup()
