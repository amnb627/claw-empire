export interface ParsedSection {
  name: string;
  heading: string;
  content: string;
  lineStart: number;
}

/**
 * Parse a Markdown string into a list of top-level sections.
 * Each `##`-level (or any `#`-level) heading starts a new section.
 * The section `name` is a normalised, slug-style key suitable for fuzzy matching.
 */
export function parseMarkdownSections(markdown: string): ParsedSection[] {
  const lines = markdown.split("\n");
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;
  const currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);

    if (headingMatch) {
      if (currentSection) {
        currentSection.content = currentLines.join("\n").trim();
        sections.push(currentSection);
        currentLines.length = 0;
      }
      currentSection = {
        name: headingMatch[1]!.toLowerCase().replace(/[^a-z0-9\u3040-\u9fff]+/g, "_"),
        heading: headingMatch[1]!,
        content: "",
        lineStart: i,
      };
    } else if (currentSection) {
      currentLines.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = currentLines.join("\n").trim();
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Check whether a Markdown document contains all required sections.
 * Uses fuzzy matching: a required keyword is considered present when any
 * parsed section name contains the keyword (or vice versa).
 */
export function checkRequiredSections(
  markdown: string,
  required: string[],
): { present: string[]; missing: string[]; sections: ParsedSection[] } {
  const sections = parseMarkdownSections(markdown);
  const sectionNames = sections.map((s) => s.name);

  const present: string[] = [];
  const missing: string[] = [];

  for (const req of required) {
    const normalized = req.toLowerCase().replace(/[^a-z0-9\u3040-\u9fff]+/g, "_");
    // Strip underscores for looser comparison (e.g. 'followup' matches 'follow_up')
    const normalizedStripped = normalized.replace(/_/g, "");
    // Fuzzy: either the section name contains the keyword or the keyword contains the section name
    const found = sectionNames.some((n) => {
      const nStripped = n.replace(/_/g, "");
      return (
        n.includes(normalized) ||
        normalized.includes(n) ||
        nStripped.includes(normalizedStripped) ||
        normalizedStripped.includes(nStripped)
      );
    });
    if (found) present.push(req);
    else missing.push(req);
  }

  return { present, missing, sections };
}
