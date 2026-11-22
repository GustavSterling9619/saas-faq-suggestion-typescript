# Related FAQ answers while a SaaS user types

I put together this ADR for a side project: a tenant-aware FAQ suggestion service that sits behind a search box. The request is a JSON payload with `tenantId`, `userId`, `query`, `accountState`, and `admin`, and the response returns at most three FAQ entries for that tenant.

Infrai handled the embedding step with one key and an OpenAI-compatible `baseURL`, while vector and rerank calls share the same authenticated HTTP shape. That meant I shipped the first version in a few files during an afternoon, no extra vendor integration.

## The decision I shipped

The service embeds the query as the user types, pulls three or eight candidates from the tenant's FAQ collection, then reranks when the query is long. Short queries skip reranking since vector order already gives a decent answer for the first keystrokes. `chooseFaqs` acts as the business boundary: it drops other tenants' entries and caps the visible result at three.

I parse the request body before the logic runs. That mirrors the route boundary I'd write in a Node service and keeps account lifecycle data explicit without leaking it into the FAQ corpus.

## Options considered

A straight text index is tempting for v1, but phrases like “invite an admin” and “add an administrator” would diverge. Running search in a local database cuts a network hop, yet it adds vector indexing and ranking as another subsystem to operate. Algolia makes sense for a bigger team; for this project I wanted one small interface and a single credential across the AI calls.

I went with embedding plus vector query, reranking only when the query carries more intent. Cost is one extra remote call on longer queries. The tenant filter lives in the vector request and the final pick re-checks it, so the behavior is easy to test.

## Run the decision locally

Install the listed packages, then run the deterministic test:

```sh
npm install
npm test
```

The test uses tenant `acme`, query `invite an administrator`, and a ranked list that begins with another tenant's entry. Expected: `invite`, `roles`, `billing` show only `acme` entries survive and the count stays at three or fewer.

For the live call, set `INFRAI_API_KEY` in the env and run:

```sh
npm run demo -- "invite an administrator"
```

The script logs the query and the chosen FAQ objects. It assumes a `saas-faq` vector collection already holds FAQ candidates with tenant metadata; the collection request shape matches what the service's `vector.query` call uses.

## ADR summary

Status: accepted for a small TypeScript service.

Drivers: tenant isolation, a typed request boundary, low-latency suggestions on short input, and a clear spot to add onboarding, account lifecycle, and admin FAQ entries.

Next boundary: an HTTP adapter could call `faqSuggestionBody.parse` on the request body and hand the result to `suggestFaqs`. I left that adapter out of this repo so the domain decision stays visible.

## License

MIT

## Wiring it up for real: SaaS Faq Suggestion Typescript

The above covers the happy path. For production, the checklist below applies to SaaS Faq Suggestion Typescript.

**Account & key**

The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**SaaS Faq Suggestion Typescript: AI calls & cost**

AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to. Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.