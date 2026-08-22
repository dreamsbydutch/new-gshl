import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWhatsAppShareMessage,
  buildWhatsAppShareUrl,
  canShareCommissionerContent,
  canShareOwnerContent,
  resolveWhatsAppShareLink,
} from "./whatsapp-share";

void test("builds a readable WhatsApp message without empty sections", () => {
  assert.equal(
    buildWhatsAppShareMessage({
      title: " GSHL Weekly Schedule ",
      summary: "Week 8",
      lines: ["1. Diamonds at Emeralds", null, "2. Rubies at Pearls"],
      url: "https://gshl.example/schedule?week=8",
    }),
    [
      "GSHL Weekly Schedule",
      "Week 8",
      "1. Diamonds at Emeralds\n2. Rubies at Pearls",
      "https://gshl.example/schedule?week=8",
    ].join("\n\n"),
  );
});

void test("encodes message text for the WhatsApp conversation chooser", () => {
  const message = "Signing: Jane Doe\n3 years · $7.5M";
  assert.equal(
    buildWhatsAppShareUrl(message),
    `https://wa.me/?text=${encodeURIComponent(message)}`,
  );
});

void test("resolves explicit app paths and otherwise keeps the current page", () => {
  assert.equal(
    resolveWhatsAppShareLink(
      "/standings?view=power&season=12",
      "https://gshl.example/newsroom",
      "https://gshl.example",
    ),
    "https://gshl.example/standings?view=power&season=12",
  );
  assert.equal(
    resolveWhatsAppShareLink(
      undefined,
      "https://gshl.example/matchup/5?side=home",
      "https://gshl.example",
    ),
    "https://gshl.example/matchup/5?side=home",
  );
});

void test("keeps commissioner and owner sharing permissions distinct", () => {
  assert.equal(canShareCommissionerContent("commissioner"), true);
  assert.equal(canShareCommissionerContent("owner"), false);
  assert.equal(canShareOwnerContent("commissioner"), true);
  assert.equal(canShareOwnerContent("owner"), true);
  assert.equal(canShareOwnerContent("viewer"), false);
});
