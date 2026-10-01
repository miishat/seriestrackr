# DeepSeek evidence-extraction trial

Status: first live check passed on 2026-09-29 (Toronto time). DeepSeek is a candidate under evaluation; the user requested real-source testing before selection. Free catalogs and search remain the retrieval layers.

Open the hidden `.env.deepseek.local` file in the project root and paste the key after `DEEPSEEK_API_KEY=`. Save the file, then tell the assistant the key is ready. Do not paste it into chat. The file is Git-ignored and hidden on Windows; it is ordinary local plaintext, so hiding it is not encryption. Preserve `DEEPSEEK_MODEL=deepseek-flash` for this bounded trial.

The research harness reads this file locally and sends the key only in an authorization header to `https://api.deepseek.com/chat/completions`. It refuses a tracked or non-ignored key file, rejects redirects, and never includes the key in reports or console output. It does not use Vite environment variables or browser storage.

Dry run, with no network requests:

```powershell
node scripts/discovery-deepseek-check.mjs
```

After key entry, one explicitly requested API call:

```powershell
node scripts/discovery-deepseek-check.mjs --run
```

Each run makes at most one request, disables thinking, caps output at 2,048 tokens, limits supplied input to 16,000 UTF-8 bytes, uses a 45-second timeout and caps successful response bodies at 64 KiB. No search tools, retries, model switching or private library data are involved. Running `--run` again makes another billable attempt.

This is a token-billed API. The expected small request should cost less than one US cent at the researched Flash rates, but that is an estimate, not a provider-enforced dollar cap. Usage is recorded when the provider returns it. Timeout does not guarantee that the provider avoided generation or charges. No account billing settings are changed.

The historical synthetic suite uses the original strict-market rule; the real-source follow-up tests the updated any-market fallback. Five fictional fixtures test earliest ebook/print selection, market and language exclusion, partial-date abstention, same-edition conflicts, and a malicious instruction inside source text. Only exact expected dates and supplied source IDs pass. This is an extraction check, not a live publication or next-title discovery evaluation.

The script appends sanitized attempt metadata, token usage and per-case validation to `docs/discovery-deepseek-check.json`. Raw provider error bodies, raw model output and authentication headers are discarded. Exit code 1 means the attempt did not yield a fully passing extraction; it does not imply that the key is invalid.

First live result: HTTP 200 in 1,261 ms, 628 tokens, all five fixtures passed. Estimated inference cost: USD 0.0001662 at the researched off-peak rates; actual billing was not inspected. See [sanitized results](discovery-deepseek-check.json). A later assisted real-source test is recorded below.

Offline harness checks:

```powershell
node --test scripts/deepseek-check.node.mjs
```

API format: [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/). Costs: [official pricing](https://api-docs.deepseek.com/quick_start/pricing).

## Assisted real-source follow-up

The eight-series test plus two market-rule cases used assistant-retrieved primary-source facts and known catalog pages. Initial instructions passed 5/10 complete cases; a comparison with explicit fallback and order-citation instructions passed 10/10. Both reports are saved in [real-source results](discovery-deepseek-real-check.json). These tests do not verify autonomous search or free production search API access.

Dry run or one explicitly requested comparison call:

```powershell
node scripts/discovery-deepseek-real-check.mjs --refined
node scripts/discovery-deepseek-real-check.mjs --run --refined
```

Each `--run` makes another paid request. Original instructions remain available by omitting `--refined`. Expected answers stay in the local validator and are never sent to the API. The real-source report retains only bounded bibliographic result fields, validation, status and usage; raw completion text is discarded.
