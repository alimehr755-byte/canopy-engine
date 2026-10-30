import { lmsError } from "./lms/types";

const USER_AGENT = "Veritas-Engine-WebScan/1.0 (localized academic integrity tool)";

export interface WebCandidate {
  url: string;
  title: string;
  snippet: string;
  engine: "web" | "pubmed" | "arxiv" | "crossref" | "books" | "wikipedia" | "googlecse";
  abstract?: string | null;
}

const MAX_RESULTS_PER_ENGINE = 4;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_FETCH_BYTES = 800_000;

interface EngineResult {
  engine: WebCandidate["engine"];
  candidates: WebCandidate[];
}

export function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&#x27;/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

async function textFetch(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/json,application/xml" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok || res.status >= 400) {
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/json|text\/plain|\.xml|atom/iu.test(contentType)) {
      return null; // skip PDFs/binaries here — handled separately
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_FETCH_BYTES) {
      return buffer.subarray(0, MAX_FETCH_BYTES).toString("utf8");
    }
    return buffer.toString("utf8");
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** DuckDuckGo HTML endpoint (free, no key). Social permissive robots-lite usage. */
async function duckduckgo(query: string): Promise<EngineResult> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await textFetch(url);
  const candidates: WebCandidate[] = [];
  if (!html) {
    return { engine: "web", candidates };
  }
  const anchorRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu;
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gu;
  const snippets: string[] = [];
  let snippetMatch: RegExpExecArray | null;
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(stripHtmlTags(snippetMatch[1] ?? ""));
  }
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = anchorRegex.exec(html)) !== null && candidates.length < MAX_RESULTS_PER_ENGINE) {
    const hrefRaw = match[1];
    if (!hrefRaw) {
      continue;
    }
    let href = hrefRaw;
    const uddg = /uddg=([^&]+)/u.exec(href);
    const uddgValue = uddg?.[1];
    if (uddgValue) {
      href = decodeURIComponent(uddgValue);
    }
    if (!/^https?:\/\//iu.test(href) || /duckduckgo\.com/iu.test(href)) {
      continue;
    }
    candidates.push({
      url: href,
      title: stripHtmlTags(match[2] ?? "").slice(0, 200),
      snippet: snippets[index] ?? "",
      engine: "web",
    });
    index += 1;
  }
  return { engine: "web", candidates };
}

/** Google Programmable Search when keys are configured (broad web + scholar-indexed domains). */
async function googleCse(query: string): Promise<EngineResult> {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) {
    return { engine: "googlecse", candidates: [] };
  }
  const url = `https://customsearch.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&num=${MAX_RESULTS_PER_ENGINE}&q=${encodeURIComponent(query)}`;
  const json = await textFetch(url);
  const candidates: WebCandidate[] = [];
  if (!json) {
    return { engine: "googlecse", candidates };
  }
  try {
    const payload = JSON.parse(json) as { items?: { link: string; title: string; snippet?: string }[] };
    for (const item of payload.items ?? []) {
      if (item.link) {
        candidates.push({ url: item.link, title: item.title, snippet: item.snippet ?? "", engine: "googlecse" });
      }
    }
  } catch {
    // fall through
  }
  return { engine: "googlecse", candidates };
}

/** Wikipedia (free). */
async function wikipedia(query: string): Promise<EngineResult> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${MAX_RESULTS_PER_ENGINE}&format=json&origin=*`;
  const json = await textFetch(url);
  const candidates: WebCandidate[] = [];
  if (!json) {
    return { engine: "wikipedia", candidates };
  }
  try {
    const payload = JSON.parse(json) as { query?: { search?: { title: string; snippet: string }[] } };
    for (const hit of payload.query?.search ?? []) {
      const title = hit.title ?? "";
      if (!title) {
        continue;
      }
      candidates.push({
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /gu, "_"))}`,
        title,
        snippet: stripHtmlTags(hit.snippet ?? ""),
        engine: "wikipedia",
      });
    }
  } catch {
    // fall through
  }
  return { engine: "wikipedia", candidates };
}

/** PubMed E-utilities (free). */
async function pubmed(query: string): Promise<EngineResult> {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${MAX_RESULTS_PER_ENGINE}&email=webscan%40veritas.local&term=${encodeURIComponent(query)}`;
  const searchJson = await textFetch(searchUrl);
  const candidates: WebCandidate[] = [];
  if (!searchJson) {
    return { engine: "pubmed", candidates };
  }
  const ids: string[] = [];
  try {
    const payload = JSON.parse(searchJson) as { esearchresult?: { idlist?: string[] } };
    const found = payload.esearchresult?.idlist ?? [];
    ids.push(...found);
  } catch {
    return { engine: "pubmed", candidates };
  }
  if (ids.length === 0) {
    return { engine: "pubmed", candidates };
  }
  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}&email=webscan%40veritas.local`;
  const summaryJson = await textFetch(summaryUrl);
  if (!summaryJson) {
    return { engine: "pubmed", candidates };
  }
  try {
    const payload = JSON.parse(summaryJson) as { result?: Record<string, { title?: string; fulljournalname?: string; elocationid?: string; doi?: string }> };
    for (const id of ids) {
      const entry = payload.result?.[id];
      if (!entry?.title) {
        continue;
      }
      const doi = entry.doi ?? entry.elocationid?.match(/10\.\d{4,}\/[^\s"]+/u)?.[0];
      candidates.push({
        url: doi ? `https://pubmed.ncbi.nlm.nih.gov/${id}/` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        title: entry.title.slice(0, 250),
        snippet: entry.fulljournalname ?? "",
        abstract: null,
        engine: "pubmed",
      });
    }
  } catch {
    // fall through
  }
  return { engine: "pubmed", candidates };
}

/** arXiv API (free; Atom XML). Abstracts fetched on demand in fetchCandidateText. */
async function arxiv(query: string): Promise<EngineResult> {
  const trimmed = query.replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/gu, " ").trim();
  const url = `https://export.arxiv.org/api/query?search_query=all:%22${encodeURIComponent(trimmed.slice(0, 90))}%22&start=0&max_results=${MAX_RESULTS_PER_ENGINE}`;
  const xml = await textFetch(url);
  const candidates: WebCandidate[] = [];
  if (!xml) {
    return { engine: "arxiv", candidates };
  }
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gu;
  let entryMatch: RegExpExecArray | null;
  while ((entryMatch = entryRegex.exec(xml)) !== null && candidates.length < MAX_RESULTS_PER_ENGINE) {
    const entry = entryMatch[1] ?? "";
    const id = /<id>(https?:\/\/arxiv\.org\/abs\/[^<]+)<\/id>/u.exec(entry)?.[1];
    const title = stripHtmlTags(/<title>([\s\S]*?)<\/title>/u.exec(entry)?.[1] ?? "");
    const summary = stripHtmlTags(/<summary>([\s\S]*?)<\/summary>/u.exec(entry)?.[1] ?? "");
    if (id) {
      candidates.push({ url: id, title: title.slice(0, 250), snippet: summary.slice(0, 300), abstract: summary, engine: "arxiv" });
    }
  }
  return { engine: "arxiv", candidates };
}

/** Crossref (free, no key; covers most scholarly metadata incl. O&P and other journals). */
async function crossref(query: string): Promise<EngineResult> {
  const url = `https://api.crossref.org/works?rows=${MAX_RESULTS_PER_ENGINE}&select=title,URL,DOI,abstract&query=${encodeURIComponent(query)}&mailto=webscan%40veritas.local`;
  const json = await textFetch(url);
  const candidates: WebCandidate[] = [];
  if (!json) {
    return { engine: "crossref", candidates };
  }
  try {
    const payload = JSON.parse(json) as { message?: { items?: { title?: string[]; URL?: string; DOI?: string; abstract?: string }[] } };
    for (const item of payload.message?.items ?? []) {
      const title = item.title?.[0];
      if (!title || !item.URL) {
        continue;
      }
      candidates.push({
        url: item.URL,
        title: title.slice(0, 250),
        snippet: stripHtmlTags(item.abstract ?? "").slice(0, 300),
        abstract: stripHtmlTags(item.abstract ?? ""),
        engine: "crossref",
      });
    }
  } catch {
    // fall through
  }
  return { engine: "crossref", candidates };
}

/** Google Books (free; books). */
async function googleBooks(query: string): Promise<EngineResult> {
  const url = `https://www.googleapis.com/books/v1/volumes?maxResults=${MAX_RESULTS_PER_ENGINE}&country=US&q=${encodeURIComponent(query)}`;
  const json = await textFetch(url);
  const candidates: WebCandidate[] = [];
  if (!json) {
    return { engine: "books", candidates };
  }
  try {
    const payload = JSON.parse(json) as { items?: { volumeInfo?: { title: string; previewLink?: string; description?: string }; searchInfo?: { textSnippet?: string } }[] };
    for (const item of payload.items ?? []) {
      const info = item.volumeInfo;
      const link = info?.previewLink ?? "";
      if (!link) {
        continue;
      }
      candidates.push({
        url: link,
        title: (info?.title ?? link).slice(0, 250),
        snippet: item.searchInfo?.textSnippet ?? info?.description?.slice(0, 200) ?? "",
        abstract: info?.description ?? null,
        engine: "books",
      });
    }
  } catch {
    // fall through
  }
  return { engine: "books", candidates };
}

export async function searchAllEngines(
  queries: readonly string[],
  onEngineComplete?: (engine: WebCandidate["engine"], count: number) => void
): Promise<WebCandidate[]> {
  const byUrl = new Map<string, WebCandidate>();
  for (const query of queries) {
    const engines = [duckduckgo, googleCse, wikipedia, pubmed, arxiv, crossref, googleBooks];
    const results = await Promise.all(
      engines.map(async (engine) => {
        try {
          return await engine(query);
        } catch {
          return { engine: "web" as const, candidates: [] as WebCandidate[] };
        }
      })
    );
    for (const result of results) {
      for (const candidate of result.candidates) {
        const existing = byUrl.get(candidate.url);
        if (!existing) {
          byUrl.set(candidate.url, candidate);
        }
      }
      onEngineComplete?.(result.engine, result.candidates.length);
    }
    if (byUrl.size >= 24) {
      break;
    }
  }
  return Array.from(byUrl.values());
}

/** Downloads a candidate page and extracts comparable plain text. */
export async function fetchCandidateText(candidate: WebCandidate): Promise<{ text: string; blocked: boolean }> {
  // arXiv/PubMed abstracts are already captured in the search payload.
  if (candidate.abstract && candidate.abstract.length > 300) {
    return { text: candidate.abstract, blocked: false };
  }
  const isPdf = /\.pdf($|\?)/iu.test(candidate.url);
  const html = isPdf ? null : await textFetch(candidate.url, 15_000);
  if (html) {
    return { text: stripHtmlTags(html), blocked: false };
  }
  if (isPdf) {
    return { text: "", blocked: true };
  }
  return { text: "", blocked: true };
}

export function buildQueriesFromSentences(sentences: readonly string[], limit = 4): string[] {
  const stopwords = new Set(
    ("a about above after against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just least like may me might more most must my nor not of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until very was way we were what when where which while who whom why will with within would you your".split(
      " "
    ) as string[])
  );
  const queries: string[] = [];
  for (const sentence of sentences) {
    if (queries.length >= limit) {
      break;
    }
    const words = (sentence.toLowerCase().match(/[\p{L}\p{N}]{5,}/gu) ?? []).filter((word) => !stopwords.has(word));
    const unique = Array.from(new Set(words)).slice(0, 10);
    if (unique.length < 4) {
      continue;
    }
    queries.push(unique.join(" "));
  }
  return queries;
}

export { lmsError };
