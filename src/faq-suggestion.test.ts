import assert from "node:assert/strict";
import test from "node:test";
import { chooseFaqs, faqSuggestionBody } from "./faq-suggestion.ts";

test("keeps suggestions inside the tenant and returns the ranked first three", () => {
  const input = faqSuggestionBody.parse({
    tenantId: "acme", userId: "u-7", query: "invite an administrator", accountState: "active", admin: true
  });
  const result = chooseFaqs(input, [
    { id: "billing", question: "How does billing work?", answer: "Invoices are issued monthly.", tenantId: "acme" },
    { id: "invite", question: "How do I invite an administrator?", answer: "Open Team settings.", tenantId: "acme" },
    { id: "roles", question: "How do roles work?", answer: "Roles define permissions.", tenantId: "acme" },
    { id: "other", question: "How do I invite a user?", answer: "Open Team settings.", tenantId: "other" }
  ], ["other", "invite", "roles", "billing"]);
  assert.deepEqual(result.map((item) => item.id), ["invite", "roles", "billing"]);
});
