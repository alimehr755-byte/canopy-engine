export type Role = "STUDENT" | "INSTRUCTOR" | "ADMIN";
export type SubmissionStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
export type SourceType = "INTERNET" | "PUBLICATION" | "REPOSITORY";
export type MatchKind = "EXACT" | "PARAPHRASE";
export type AiLabel = "human" | "mixed" | "ai";
export type Severity = "low" | "medium" | "high";
export type ExclusionReason = "quote" | "citation" | "bibliography";

export interface TextRange {
  start: number;
  end: number;
}

export interface ExclusionRange extends TextRange {
  reason: ExclusionReason;
  label: string;
}

export interface SentenceScore extends TextRange {
  sentence: string;
  aiProbability: number;
  label: AiLabel;
}

export interface AiAnalysis {
  overallScore: number;
  perplexity: number;
  burstiness: number;
  meanSentenceLength: number;
  sentenceScores: SentenceScore[];
  provider: string;
  model: string;
  unavailableReason?: string;
}

export interface AiDetectorResponse {
  overall_score: number;
  perplexity: number;
  burstiness: number;
  mean_sentence_length: number;
  provider: string;
  model: string;
  sentence_scores: Array<{
    sentence: string;
    start_index: number;
    end_index: number;
    ai_probability: number;
    label: AiLabel;
  }>;
}

export interface AntiEvasionFinding extends TextRange {
  code: string;
  severity: Severity;
  message: string;
  sample: string;
}

export interface AntiEvasionReport {
  sanitizedText: string;
  findings: AntiEvasionFinding[];
  homoglyphCount: number;
  hiddenCharacterCount: number;
  encodingAnomalyCount: number;
}

export interface MatchExclusions {
  quotes: boolean;
  bibliography: boolean;
  smallMatch: boolean;
}

export interface MatchDTO {
  id: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceType: SourceType;
  kind: MatchKind;
  similarityPercentage: number;
  semanticScore: number | null;
  matchedText: string;
  sourceText?: string | null;
  originalStart: number;
  originalEnd: number;
  wordCount: number;
  excludedBy: MatchExclusions;
}

export interface ReportFilters {
  excludeQuotes: boolean;
  excludeBibliography: boolean;
  minMatchWords: number;
}

export interface ReportScores {
  similarity: number;
  ai: number;
  adjustedSimilarity: number;
}

export interface SourceGroup {
  key: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceType: SourceType;
  matchIds: string[];
  percentage: number;
  wordCount: number;
  previewText: string;
  kinds: MatchKind[];
}

export interface SubmissionSummary {
  id: string;
  title: string;
  authorName: string | null;
  assignmentTitle: string | null;
  status: SubmissionStatus;
  similarityScore: number;
  aiScore: number;
  wordCount: number;
  createdAt: string;
}

export interface ReportStats {
  wordCount: number;
  characterCount: number;
  exactWordCount: number;
  paraphraseWordCount: number;
  quoteWordCount: number;
  bibliographyWordCount: number;
  sourceCount: number;
  matchCount: number;
}

export interface ReportDTO {
  id: string;
  title: string;
  status: SubmissionStatus;
  createdAt: string;
  authorName: string | null;
  assignmentTitle: string | null;
  text: string;
  error: string | null;
  scores: ReportScores;
  baseScores: ReportScores;
  filters: ReportFilters;
  matches: MatchDTO[];
  sources: SourceGroup[];
  ai: AiAnalysis;
  exclusions: ExclusionRange[];
  findings: AntiEvasionFinding[];
  stats: ReportStats;
}

export interface AnalysisInput {
  text: string;
  title: string;
  submissionId: string;
}

export interface AnalysisResult {
  similarityScore: number;
  aiScore: number;
  cleanText: string;
  wordCount: number;
  characterCount: number;
  matches: Array<Omit<MatchDTO, "id" | "excludedBy"> & { sourceText?: string | null }>;
  fingerprints: Array<{ hash: bigint; position: number }>;
  ai: AiAnalysis;
  exclusions: ExclusionRange[];
  findings: AntiEvasionFinding[];
}

export interface ExtractedDocument {
  text: string;
  fileName: string | null;
  mediaType: string | null;
  kind: "text" | "pdf" | "docx";
  warnings: string[];
}
