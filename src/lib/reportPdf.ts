import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportDTO } from "./types";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const BODY_SIZE = 9.5;
const LINE = 13;

function latinize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201C\u201D]/gu, '"')
    .replace(/[\u2013\u2014]/gu, "-")
    .replace(/[\u2026]/gu, "...")
    .replace(/[^\u0020-\u017F\u2019]/gu, "?")
    .slice(0, 4000);
}

function wrap(text: string, font: { widthOfTextAtSize(t: string, s: number): number }, size: number, maxWidth: number): string[] {
  const words = latinize(text).split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current.length > 0) {
      lines.push(current);
    }
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = "";
      for (const character of word) {
        if (font.widthOfTextAtSize(chunk + character, size) > maxWidth) {
          lines.push(chunk);
          chunk = character;
          continue;
        }
        chunk += character;
      }
      current = chunk;
      continue;
    }
    current = word;
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}

class PdfComposer {
  private doc!: PDFDocument;
  private page!: ReturnType<PDFDocument["addPage"]>;
  private font!: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  private bold!: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  private cursor = PAGE_HEIGHT - MARGIN;

  async init(): Promise<void> {
    this.doc = await PDFDocument.create();
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  }

  space(amount: number): void {
    this.cursor -= amount;
  }

  ensure(height: number): void {
    if (this.cursor - height < MARGIN) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.cursor = PAGE_HEIGHT - MARGIN;
    }
  }

  heading(text: string, size = 15): void {
    const lines = wrap(text, this.bold, size, PAGE_WIDTH - MARGIN * 2);
    for (const line of lines) {
      this.ensure(size + 4);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.cursor - size,
        size,
        font: this.bold,
        color: rgb(0.04, 0.06, 0.11)
      });
      this.cursor -= size + LINE * 0.4;
    }
    this.space(3);
  }

  meta(text: string): void {
    this.ensure(LINE);
    this.page.drawText(latinize(text).slice(0, 200), {
      x: MARGIN,
      y: this.cursor - BODY_SIZE,
      size: BODY_SIZE - 0.5,
      font: this.font,
      color: rgb(0.42, 0.46, 0.55)
    });
    this.space(LINE);
  }

  paragraph(text: string, size = BODY_SIZE, color = rgb(0.15, 0.18, 0.24), bold = false): void {
    const font = bold ? this.bold : this.font;
    const lines = wrap(text, font, size, PAGE_WIDTH - MARGIN * 2);
    for (const line of lines) {
      this.ensure(LINE);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.cursor - size,
        size,
        font,
        color
      });
      this.space(LINE);
    }
  }

  row(cells: string[], widths: number[], bold = false): void {
    const font = bold ? this.bold : this.font;
    this.ensure(LINE);
    let x = MARGIN;
    cells.forEach((cell, index) => {
      const width = widths[index] ?? PAGE_WIDTH - MARGIN * 2;
      const lines = wrap(cell, font, sizeOf(cells.length), width - 6);
      this.page.drawText(lines[0] ?? "", {
        x,
        y: this.cursor - BODY_SIZE,
        size: sizeOf(cells.length),
        font,
        color: rgb(0.15, 0.18, 0.24)
      });
      x += width;
    });
    this.space(LINE);
  }

  async bytes(): Promise<Uint8Array> {
    return this.doc.save();
  }
}

function sizeOf(cells: number): number {
  return cells <= 2 ? BODY_SIZE : BODY_SIZE - 0.5;
}

export async function renderReportPdf(report: ReportDTO): Promise<Uint8Array> {
  const composer = new PdfComposer();
  await composer.init();

  composer.heading(`Veritas Engine - Similarity Report`);
  composer.meta(
    `${report.title} · generated ${new Date().toISOString()} · status ${report.status}`
  );

  composer.space(4);
  composer.heading("Overall metrics", 12);
  composer.paragraph(
    `Similarity (adjusted): ${report.scores.similarity.toFixed(1)}%    ·    ` +
      `Base similarity: ${report.baseScores.similarity.toFixed(1)}%    ·    ` +
      `AI writing signal: ${report.ai.overallScore.toFixed(1)}%`,
    BODY_SIZE,
    rgb(0.04, 0.06, 0.11),
    true
  );
  composer.meta(`Processed text: ${report.stats.wordCount} words · ${report.stats.characterCount} characters`);
  composer.meta(
    `Exact matches: ${report.stats.exactWordCount} words · Paraphrases: ${report.stats.paraphraseWordCount} words · ` +
      `Quotes: ${report.stats.quoteWordCount} words · Bibliography: ${report.stats.bibliographyWordCount} words`
  );

  composer.space(6);
  composer.heading("Matched sources", 12);
  if (report.sources.length === 0) {
    composer.paragraph("No matching sources.");
  } else {
    composer.row(["Source", "Type", "Match", "Words"], [300, 90, 65, 60], true);
    for (const source of report.sources) {
      composer.row(
        [
          source.sourceTitle ?? source.sourceUrl ?? "Unlabeled source",
          source.sourceType,
          `${source.percentage.toFixed(1)}% (${source.kinds.join(" + ").toLowerCase()})`,
          String(source.wordCount)
        ],
        [300, 90, 65, 60]
      );
    }
  }

  composer.space(6);
  composer.heading("Match details", 12);
  for (const match of report.matches) {
    composer.paragraph(
      `#${match.id.slice(0, 8)}  ${match.kind}  ${match.similarityPercentage.toFixed(1)}% of document  ` +
        `${match.wordCount} words${match.excludedBy.quotes ? "  [quote excluded]" : ""}` +
        `${match.excludedBy.bibliography ? "  [bibliography excluded]" : ""}` +
        `${match.excludedBy.smallMatch ? "  [small match excluded]" : ""}`,
      BODY_SIZE - 0.5,
      rgb(0.3, 0.34, 0.42),
      true
    );
    composer.meta(
      `${match.sourceType} · ${match.sourceTitle ?? match.sourceUrl ?? "unknown"}${match.semanticScore !== null ? ` · semantic ${match.semanticScore.toFixed(3)}` : ""}`
    );
    composer.paragraph(match.matchedText, BODY_SIZE - 0.5);
    composer.space(6);
  }

  composer.space(4);
  composer.heading("AI writing analysis", 12);
  composer.paragraph(
    `Provider: ${report.ai.provider} · model: ${report.ai.model} · aggregated signal ${report.ai.overallScore.toFixed(1)}%`
  );

  return composer.bytes();
}