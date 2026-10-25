"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileText, Loader2, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/format";

type Mode = "file" | "text";

const pipeline = [
  "Extracting and sanitizing text",
  "Fingerprinting document",
  "Comparing against the repository",
  "Scoring AI writing signals"
];

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function acceptFile(candidate: File | null | undefined): void {
    if (!candidate) {
      return;
    }
    if (candidate.size > 15 * 1024 * 1024) {
      setError("File exceeds the 15 MB upload limit.");
      return;
    }
    setError(null);
    setFile(candidate);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) {
      return;
    }
    setError(null);

    const form = new FormData(event.currentTarget);
    if (mode === "file" && !file) {
      setError("Choose a PDF, DOCX, TXT or Markdown file to analyze.");
      return;
    }
    if (mode === "text" && String(form.get("text") ?? "").trim().length < 20) {
      setError("Paste at least 20 words for a meaningful analysis.");
      return;
    }

    if (mode === "file" && file) {
      form.set("file", file);
    } else {
      form.delete("file");
    }

    setPending(true);
    try {
      const response = await fetch("/api/submit", { method: "POST", body: form });
      const payload = (await response.json()) as {
        submission?: { id: string };
        error?: string;
      };
      if (!response.ok || !payload.submission) {
        throw new Error(payload.error ?? "The submission could not be analyzed.");
      }
      router.push(`/report/${payload.submission.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Submission failed.");
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-ink-200/80 bg-white shadow-paper"
    >
      <div className="flex items-center justify-between gap-4 border-b border-ink-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-ink-900">New submission</h2>
          <p className="text-xs text-ink-500">
            Similarity, citation exclusions, evasion checks and AI writing in one pass.
          </p>
        </div>
        <div className="flex rounded-lg bg-ink-100 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={cn(
              "rounded-md px-2.5 py-1 transition",
              mode === "file" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"
            )}
          >
            Upload
          </button>
          <button
            type="button"
            onClick={() => setMode("text")}
            className={cn(
              "rounded-md px-2.5 py-1 transition",
              mode === "text" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"
            )}
          >
            Paste
          </button>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Title
            </span>
            <input
              name="title"
              placeholder="e.g. Renewable energy policy essay"
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Author email
            </span>
            <input
              name="authorEmail"
              type="email"
              placeholder="student@veritas.local"
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
            />
          </label>
        </div>

        {mode === "file" ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              acceptFile(event.dataTransfer.files[0]);
            }}
            className={cn(
              "relative rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
              dragging
                ? "border-brand-500 bg-brand-500/5"
                : "border-ink-200 bg-ink-50/60 hover:border-ink-300"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="sr-only"
              onChange={(event) => acceptFile(event.target.files?.[0])}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="h-5 w-5 text-brand-500" aria-hidden="true" />
                <div className="text-left">
                  <p className="text-sm font-medium text-ink-900">{file.name}</p>
                  <p className="text-xs text-ink-500">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) {
                      inputRef.current.value = "";
                    }
                  }}
                  className="rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => inputRef.current?.click()} className="group">
                <UploadCloud className="mx-auto h-8 w-8 text-ink-400 transition group-hover:text-brand-500" />
                <p className="mt-2 text-sm font-medium text-ink-800">
                  Drop a document or <span className="text-brand-600">browse</span>
                </p>
                <p className="mt-1 text-xs text-ink-500">PDF, DOCX, TXT or MD · up to 15 MB</p>
              </button>
            )}
          </div>
        ) : (
          <textarea
            name="text"
            rows={7}
            placeholder="Paste the student's text here. Minimum 20 words."
            className="w-full resize-y rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm leading-6 text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
          />
        )}

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Analyzing submission…" : "Run integrity analysis"}
        </button>

        {pending ? (
          <ul className="space-y-1.5 rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-500">
            {pipeline.map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <span className="h-1 w-1 animate-pulse-soft rounded-full bg-brand-500" style={{ animationDelay: `${index * 180}ms` }} />
                {step}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] leading-5 text-ink-400">
            Documents are sanitized for zero-width characters and homoglyphs before matching. Quoted
            and bibliographic text can be excluded from the headline similarity score.
          </p>
        )}
      </div>
    </form>
  );
}
