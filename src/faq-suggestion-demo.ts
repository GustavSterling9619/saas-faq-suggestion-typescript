import { faqSuggestionBody, suggestFaqs } from "./faq-suggestion.ts";

const body = faqSuggestionBody.parse({
  tenantId: "acme", userId: "u-7", query: process.argv[2] ?? "invite an administrator",
  accountState: "active", admin: true
});

const entries = [
  { id: "invite", question: "How do I invite an administrator?", answer: "Open Team settings and choose Invite.", tenantId: "acme" },
  { id: "roles", question: "How do roles work?", answer: "Roles define workspace permissions.", tenantId: "acme" },
  { id: "billing", question: "When is the next invoice?", answer: "Invoices are issued monthly.", tenantId: "acme" }
];

const suggestions = await suggestFaqs(body, entries);
console.log(JSON.stringify({ query: body.query, suggestions }, null, 2));
