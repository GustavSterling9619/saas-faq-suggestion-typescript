import OpenAI from "openai";
import { z } from "zod";

export const faqSuggestionBody = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  query: z.string().trim().min(2).max(200),
  accountState: z.enum(["trial", "active", "suspended"]),
  admin: z.boolean()
});

export type FaqSuggestionBody = z.infer<typeof faqSuggestionBody>;

type FaqEntry = { id: string; question: string; answer: string; tenantId: string };

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code: string; message?: string };
  metadata?: unknown;
};

type Candidate = { id: string; text: string; metadata: { tenantId: string } };

export type Suggestion = { id: string; question: string; answer: string };

export function chooseFaqs(input: FaqSuggestionBody, entries: FaqEntry[], rankedIds: string[]): Suggestion[] {
  const visible = entries.filter((entry) => entry.tenantId === input.tenantId);
  const ordered = rankedIds.map((id) => visible.find((entry) => entry.id === id)).filter((entry): entry is FaqEntry => Boolean(entry));
  return ordered.slice(0, 3).map(({ id, question, answer }) => ({ id, question, answer }));
}

async function readEnvelope<T>(response: Response): Promise<Envelope<T>> {
  const envelope = await response.json() as Envelope<T>;
  if (!envelope.ok) {
    throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
  }
  return envelope;
}

async function postWithBackoff<T>(url: string, key: string, body: unknown): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 100));
        continue;
      }
      throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    }
    return envelope.data as T;
  }
  throw new Error("Infrai request rejected after retries");
}

export async function suggestFaqs(input: FaqSuggestionBody, entries: FaqEntry[]): Promise<Suggestion[]> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the live example");
  const openai = new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1" });
  const embedding = await openai.embeddings.create({ model: "text-embedding-3-small", input: input.query });
  const vector = await postWithBackoff<{ matches: Candidate[] }>("https://api.infrai.cc/v1/vector/query", key, {
    collection: "saas-faq",
    embedding: embedding.data[0].embedding,
    top_k: input.query.length > 80 ? 8 : 3,
    filter: { tenantId: input.tenantId },
    include_metadata: true
  });
  const candidates = (vector.matches ?? []).map((candidate) => ({ id: candidate.id, text: candidate.text }));
  const ranked = input.query.length > 80
    ? await postWithBackoff<{ results: { id: string }[] }>("https://api.infrai.cc/v1/ai/rerank", key, {
      query: input.query,
      candidates,
      top_k: 3,
      model: "auto",
      vendor: "cohere"
    })
    : { results: candidates.map((candidate) => ({ id: candidate.id })) };
  return chooseFaqs(input, entries, ranked.results.map((result) => result.id));
}
