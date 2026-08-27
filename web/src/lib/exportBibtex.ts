import type { Publication } from "@/api/schemas";

const STOPWORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to", "with"]);

function field(name: string, value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  return `  ${name} = {{${String(value).replace(/[{}]/g, "")}}}`;
}

function keyFor(pub: Publication): string {
  const author = pub.authors[0]?.last || "publication";
  const word = pub.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .find((part) => part && !STOPWORDS.has(part)) ?? "study";
  return `${author.toLowerCase().replace(/[^a-z0-9]/g, "")}_${pub.year}_${word}`;
}

export function toBibtex(pub: Publication): string {
  const type = pub.pub_type.toLowerCase().includes("book") ? "incollection" : "article";
  const authors = pub.authors.map((author) => `${author.last}, ${author.first || author.initials}`).join(" and ");
  const fields = [
    field("author", authors),
    field("title", pub.title),
    field("journal", pub.journal),
    field("year", pub.year),
    field("volume", pub.volume),
    field("number", pub.issue),
    field("pages", pub.pages),
    field("doi", pub.doi),
    field("abstract", pub.abstract),
    field("keywords", [...pub.keywords, ...pub.tags].join(", ")),
  ].filter((entry): entry is string => Boolean(entry));
  return `@${type}{${keyFor(pub)},\n${fields.join(",\n")}\n}`;
}

export function exportBibtexFile(publications: Publication[], filename: string): void {
  const text = `${publications.map(toBibtex).join("\n\n")}\n`;
  const blob = new Blob([text], { type: "application/x-bibtex;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
