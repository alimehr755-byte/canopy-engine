import type { AntiEvasionFinding, AntiEvasionReport, Severity } from "./types";

const CONFUSABLES: Record<string, string> = {
  "\u0430": "a",
  "\u0432": "b",
  "\u0435": "e",
  "\u043A": "k",
  "\u043C": "m",
  "\u043D": "h",
  "\u043E": "o",
  "\u0440": "p",
  "\u0441": "c",
  "\u0442": "t",
  "\u0443": "y",
  "\u0445": "x",
  "\u0455": "s",
  "\u0456": "i",
  "\u0458": "j",
  "\u04BB": "h",
  "\u0501": "d",
  "\u051B": "q",
  "\u051D": "w",
  "\u0410": "A",
  "\u0412": "B",
  "\u0415": "E",
  "\u041A": "K",
  "\u041C": "M",
  "\u041D": "H",
  "\u041E": "O",
  "\u0420": "P",
  "\u0421": "C",
  "\u0422": "T",
  "\u0423": "Y",
  "\u0425": "X",
  "\u0405": "S",
  "\u0406": "I",
  "\u0408": "J",
  "\u03B1": "a",
  "\u03B2": "b",
  "\u03B5": "e",
  "\u03B7": "n",
  "\u03B9": "i",
  "\u03BA": "k",
  "\u03BD": "v",
  "\u03BF": "o",
  "\u03C1": "p",
  "\u03C4": "t",
  "\u03C5": "u",
  "\u03C7": "x",
  "\u0391": "A",
  "\u0392": "B",
  "\u0395": "E",
  "\u0396": "Z",
  "\u0397": "H",
  "\u0399": "I",
  "\u039A": "K",
  "\u039C": "M",
  "\u039D": "N",
  "\u039F": "O",
  "\u03A1": "P",
  "\u03A4": "T",
  "\u03A5": "Y",
  "\u03A7": "X",
  "\uFF41": "a",
  "\uFF42": "b",
  "\uFF43": "c",
  "\uFF44": "d",
  "\uFF45": "e"
};

// eslint-disable-next-line no-control-regex, no-misleading-character-class
const ZERO_WIDTH_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u180E\u061C\u034F\u00AD]/u;
// eslint-disable-next-line no-control-regex, no-misleading-character-class
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const PRIVATE_USE_PATTERN = /[\uE000-\uF8FF]/u;
const REPLACEMENT_PATTERN = /\uFFFD/u;

function codePointLabel(character: string): string {
  return `U+${character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "0000"}`;
}

function pushFinding(
  findings: AntiEvasionFinding[],
  text: string,
  start: number,
  end: number,
  code: string,
  severity: Severity,
  message: string
): void {
  if (findings.length >= 500) {
    return;
  }
  findings.push({
    code,
    severity,
    message,
    start,
    end,
    sample: text.slice(Math.max(0, start - 12), Math.min(text.length, end + 12))
  });
}

export function detectHomoglyphs(text: string): AntiEvasionFinding[] {
  const findings: AntiEvasionFinding[] = [];
  const wordPattern = /[\p{L}\p{N}]+/gu;
  let match: RegExpExecArray | null;

  while ((match = wordPattern.exec(text)) !== null) {
    const word = match[0];
    let hasAsciiLetter = false;
    let hasConfusable = false;

    for (const character of word) {
      if (/[A-Za-z]/.test(character)) {
        hasAsciiLetter = true;
      }
      if (CONFUSABLES[character]) {
        hasConfusable = true;
      }
    }

    if (!hasConfusable || !hasAsciiLetter) {
      continue;
    }

    let relativeIndex = 0;
    for (const character of word) {
      const start = match.index + relativeIndex;
      const replacement = CONFUSABLES[character];
      relativeIndex += character.length;
      if (!replacement) {
        continue;
      }
      pushFinding(
        findings,
        text,
        start,
        start + character.length,
        "HOMOGLYPH",
        "high",
        `Confusable character ${codePointLabel(character)} resembles "${replacement}" inside a Latin word.`
      );
    }
  }

  return findings;
}

export function detectHiddenText(text: string): AntiEvasionFinding[] {
  const findings: AntiEvasionFinding[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (ZERO_WIDTH_PATTERN.test(character)) {
      pushFinding(
        findings,
        text,
        index,
        index + 1,
        "INVISIBLE_CHARACTER",
        "high",
        `Invisible or bidirectional control character ${codePointLabel(character)} detected.`
      );
      continue;
    }
    if (CONTROL_PATTERN.test(character)) {
      pushFinding(
        findings,
        text,
        index,
        index + 1,
        "CONTROL_CHARACTER",
        "medium",
        `Non-printable control character ${codePointLabel(character)} detected.`
      );
      continue;
    }
    if (PRIVATE_USE_PATTERN.test(character)) {
      pushFinding(
        findings,
        text,
        index,
        index + 1,
        "PRIVATE_USE_CHARACTER",
        "medium",
        `Private-use character ${codePointLabel(character)} may come from a manipulated font mapping.`
      );
    }
  }

  return findings;
}

export function detectEncodingAnomalies(text: string): AntiEvasionFinding[] {
  const findings: AntiEvasionFinding[] = [];
  // eslint-disable-next-line no-control-regex, no-misleading-character-class
  const pattern = /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\uE000-\uF8FF]/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const character = match[0];
    const label = codePointLabel(character);
    let code = "ENCODING_ANOMALY";
    let message = `Unmapped or private character ${label} suggests font encoding manipulation.`;
    if (REPLACEMENT_PATTERN.test(character)) {
      code = "REPLACEMENT_CHARACTER";
      message = "Replacement character indicates failed encoding or stripped font glyphs.";
    }
    pushFinding(findings, text, match.index, match.index + character.length, code, "medium", message);
  }

  return findings;
}

export function stripInvisibleCharacters(text: string): string {
  return text.replace(
    // eslint-disable-next-line no-control-regex, no-misleading-character-class
    /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u180E\u061C\u034F\u00AD]/gu,
    ""
  );
}

export function normalizeHomoglyphs(text: string): string {
  let result = "";
  for (const character of text) {
    result += CONFUSABLES[character] ?? character;
  }
  return result;
}

export function sanitizeText(text: string): AntiEvasionReport {
  const homoglyphFindings = detectHomoglyphs(text);
  const hiddenFindings = detectHiddenText(text);
  const encodingFindings = detectEncodingAnomalies(text);

  const sanitized = normalizeHomoglyphs(stripInvisibleCharacters(text.normalize("NFKC")))
    .replace(/\u00A0/gu, " ")
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

  return {
    sanitizedText: sanitized,
    findings: [...homoglyphFindings, ...hiddenFindings, ...encodingFindings].sort(
      (left, right) => left.start - right.start
    ),
    homoglyphCount: homoglyphFindings.length,
    hiddenCharacterCount: hiddenFindings.length,
    encodingAnomalyCount: encodingFindings.length
  };
}

export function detectFontManipulationSignals(text: string): string[] {
  const signals: string[] = [];
  const findings = detectEncodingAnomalies(text);
  if (findings.some((finding) => finding.code === "REPLACEMENT_CHARACTER")) {
    signals.push("Document contains replacement characters, typical of subset font encoding failures.");
  }
  if (findings.some((finding) => finding.code === "PRIVATE_USE_CHARACTER")) {
    signals.push("Document maps text into private-use code points, often used to disguise characters.");
  }
  if (detectHiddenText(text).length > 0) {
    signals.push("Zero-width or bidi characters are present and were removed during normalization.");
  }
  return signals;
}
