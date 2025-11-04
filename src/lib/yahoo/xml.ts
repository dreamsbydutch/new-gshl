import { XMLParser } from "fast-xml-parser";

import type { YahooFantasyMetadata, YahooFantasyResponse } from "@gshl-types";

/**
 * Error thrown when Yahoo fantasy XML cannot be parsed into a valid document.
 */
export class YahooXmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YahooXmlParseError";
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  attributesGroupName: "$",
  textNodeName: "_text",
  trimValues: true,
  parseAttributeValue: false,
  parseTagValue: false,
});

/**
 * Parse a Yahoo fantasy API XML payload into a JSON document that aligns with
 * the strongly typed contracts in `src/lib/types/yahooSports.ts`.
 */
export function parseYahooFantasyXml<TPayload = unknown>(
  xml: string,
): YahooFantasyResponse<TPayload> {
  let raw: unknown;
  try {
    raw = parser.parse(xml);
  } catch (error) {
    throw new YahooXmlParseError(
      `Failed to parse Yahoo fantasy XML: ${String(error)}`,
    );
  }

  if (!isObjectRecord(raw)) {
    throw new YahooXmlParseError(
      "Yahoo fantasy XML did not resolve to an object document.",
    );
  }

  const root = raw.fantasy_content;
  if (!isObjectRecord(root)) {
    throw new YahooXmlParseError(
      "Yahoo fantasy XML missing <fantasy_content> root element.",
    );
  }

  const normalized = normalizeNode(root);
  if (!isObjectRecord(normalized)) {
    throw new YahooXmlParseError(
      "Normalized Yahoo fantasy payload is not an object.",
    );
  }

  const meta = extractMetadata(normalized);
  const payload = stripMetadataKeys(normalized);

  return {
    meta,
    payload: payload as TPayload,
  };
}

function normalizeNode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeNode(item));
  }

  if (!isObjectRecord(value)) {
    return value;
  }

  const attributes = value.$;
  const textContent = value._text;

  const result: Record<string, unknown> = {};

  if (isObjectRecord(attributes)) {
    for (const [attrKey, attrValue] of Object.entries(attributes)) {
      result[normalizeAttributeName(attrKey)] = normalizeNode(attrValue);
    }
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (key === "$" || key === "_text") {
      continue;
    }
    result[key] = normalizeNode(entryValue);
  }

  if (textContent !== undefined) {
    const textValue = normalizeNode(textContent);
    if (
      Object.keys(result).length === 0 &&
      (typeof textValue === "string" || typeof textValue === "number")
    ) {
      return textValue;
    }

    if (textValue !== undefined) {
      result.value = textValue;
    }
  }

  return result;
}

function extractMetadata(
  source: Record<string, unknown>,
): YahooFantasyMetadata {
  const meta: YahooFantasyMetadata = {};

  const time = pickString(source.time);
  if (time) {
    meta.time = time;
  }

  const copyright = pickString(source.copyright);
  if (copyright) {
    meta.copyright = copyright;
  }

  const language =
    pickString(source["xml:lang"]) ??
    pickString(source.xml_lang) ??
    pickString(source.language);
  if (language) {
    meta.language = language;
  }

  const yahooUri =
    pickString(source["yahoo:uri"]) ?? pickString(source.yahoo_uri);
  if (yahooUri) {
    meta.yahooUri = yahooUri;
  }

  return meta;
}

function stripMetadataKeys(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (isMetadataKey(key)) {
      continue;
    }

    payload[key] = value;
  }

  return payload;
}

function isMetadataKey(key: string): boolean {
  return (
    key === "time" ||
    key === "copyright" ||
    key === "xml:lang" ||
    key === "xml_lang" ||
    key === "language" ||
    key === "yahoo:uri" ||
    key === "yahoo_uri" ||
    key === "xmlns" ||
    key.startsWith("xmlns:")
  );
}

function normalizeAttributeName(name: string): string {
  return name.replaceAll(":", "_");
}

function pickString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }

  return undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
