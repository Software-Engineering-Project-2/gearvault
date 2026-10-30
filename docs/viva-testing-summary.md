# GearVault — Testing Summary (Viva Notes)

Project: GearVault — A Rule-Driven Equipment Rental Management Platform
Team: Harshit Vasu (24BCE1468), Govind Rajeshkumar Pillai (24BCE1434), M Sathyanarayanan (24BCE1689)
Process model: Incremental SDLC (5 increments)

Dates below come from the git history (the commit that first added each test file).

---

## 1. Testing setup

| Item | Detail |
|---|---|
| Framework | Python built-in `unittest` |
| HTTP testing | Flask `test_client()` (calls API endpoints without a real server) |
| CLI testing | Flask `test_cli_runner()` |
| Mocking | `unittest.mock.patch` (environment variables, simulated database failure) |
| Test database | In-memory SQLite, created fresh in `setUp()` and dropped in `tearDown()` |
| Test isolation | Each test builds its own app with `create_app({"TESTING": True})` |
| Location | `backend/tests/` |

How to run:

```bash
cd backend
TESTING=true python -m unittest discover tests
```

Result (run on 19 Oct 2026, deployment branch): `Ran 57 tests in 42.4s — OK`

---

## 2. Testing timeline (in sequence)

### Stage 1 — Increments 1 and 2 (18–19 Aug 2026): Manual testing

Scope: Authentication & RBAC (FR001–FR004), Catalog & Booking (FR005–FR010).

- No automated tests were written in this stage.
- The app was tested by hand in the browser using the three seeded dev accounts:
  `customer@test.com`, `staff@test.com`, `manager@test.com`.
- Bugs found manually were fixed in later commits, e.g. "Authentication page_utf_fix" (18 Aug)
  and "Fix RBAC SQLite auth…" (19 Sep).

Example manual test:
- Log in as a customer and open `/analytics` → expected: "403 — Access Denied" page.

---

### Stage 2 — Increment 3 (22 Aug 2026): Unit tests for the pricing engine

File: `test_pricing.py` — 10 tests (8 unit tests on the engine, 2 API tests).
Requirements covered: FR011 (depreciation pricing), FR012 (duration tiers).

Techniques:
- **Equivalence partitioning** — one test per duration tier class:
  Daily (< 7 days), Weekly (7–29 days), Monthly (≥ 30 days).
- **Boundary value analysis** — fractional days round up.
- **Salvage floor check** — a very old item never falls below 20% of purchase price.
- **API test** — `POST /api/pricing/estimate` returns the same values over HTTP.

Examples:

| Test | Input | Expected |
|---|---|---|
| Brand-new item | ₹1,00,000, purchased today | Depreciated value = ₹1,00,000 |
| Fractional days | 36-hour rental of a new ₹1,00,000 item | 2 billable days, price ₹5,000 |
| Camera depreciation | Camera category (3-year life) | Depreciates faster than the 5-year default |

---

### Stage 3 — Increments 4 and 5 (15–19 Sep 2026): Damage engine, workflows, reports

Requirements covered: FR015–FR027.

| File | Tests | Type |
|---|---|---|
| `test_damage.py` | 11 | Unit (black-box + white-box) |
| `test_return_workflow.py` | 3 | Integration (API + database) |
| `test_notifications_and_reports.py` | 5 | Integration |
| `test_manager_inventory_and_audit.py` | 3 | Integration + negative |

Examples from `test_damage.py`:

| Test | Input | Expected |
|---|---|---|
| Cosmetic damage | Value ₹50,000, severity 3, weight 0.05 | Deduction ₹7,500 |
| Deduction cap (boundary) | Value ₹50,000, Major damage, severity 5 | Raw ₹2,50,000 → capped to ₹50,000 |
| Late penalty | Returned 3 days 2 hours late | 4 days × ₹500 = ₹2,000 |
| Presumed Lost | Returned 8 days late | Presumed Lost = true |

White-box (branch coverage) of the settlement function — one test per branch:
1. On-time, undamaged → full deposit refund
2. Overdue + cosmetic damage → partial refund
3. Deductions larger than deposit → balance owed
4. Presumed Lost → full replacement charge

Integration examples:
- Overdue damaged return → customer dispute → manager override → refund recalculated, rental closed.
- An expired soft hold automatically creates a `hold_expired` notification (FR024).
- Manager analytics and monthly CSV export return correct data (FR027).
- **Negative test:** a customer calling `POST /api/items` gets **403 Forbidden** (FR003).

End of stage: the `main` branch was delivered on 3 Oct 2026 with **32 automated tests**.

---

### Stage 4 — Production hardening (4 Oct 2026, deployment branch)

Seven work packages changed the platform (SQLite/Supabase → PostgreSQL/S3,
background thread → scheduled CLI job, dev server → Gunicorn in Docker).
Each package added its own tests, and the original 32 tests were re-run after each change.

| File | Tests | What it proves | Example |
|---|---|---|---|
| `test_uploads.py` | 7 | Upload role checks and validation | Staff uploading an item image → 403; file over 5 MB → 400 |
| `test_jobs.py` | 2 | Background jobs are idempotent | Run 1 expires 1 old hold, keeps 1 valid hold; run 2 expires 0 |
| `test_production_hardening.py` | 8 | Health probes, error handling, fail-fast config | DB faked as down (mock) → `/api/health/ready` returns 503; missing `JWT_SECRET_KEY` stops startup |
| `test_proxy_fix.py` | 1 | Correct client IP behind load balancer | Real IP read from `X-Forwarded-For` |
| `test_media_url.py` | 3 | Image URLs built correctly | Trailing/leading slashes handled |
| `test_cli_create_user.py` | 3 | Admin CLI tool | Duplicate email or invalid role fails |
| `test_e2e_smoke.py` | 1 (13 steps) | Full lifecycle end to end | See below |

End-to-end smoke test steps:
1. Register customer
2. Log in
3. Create manager via CLI (`flask create-user`)
4. Create booking hold
5. Confirm deposit payment
6. Staff handover
7. Get presigned upload URL
8. Staff return with condition photo and damage
9. Customer dispute
10. Manager override
11. Manager analytics
12. Manager CSV export
13. Run background jobs (`flask jobs run`)

End of stage: **57 automated tests, all passing.**

---

## 3. Testing levels used

| Level | Where |
|---|---|
| Unit testing | Pricing engine, damage engine, media URL helper |
| Integration testing | API + database tests using Flask test client |
| System testing | 13-step end-to-end smoke test |
| Acceptance testing | Manual walkthrough per role (Customer, Staff, Manager) |

V-model mapping: unit tests → detailed design; integration tests → architecture;
system test → SRS; acceptance → user needs.

---

## 4. Testing techniques used

| Technique | Example |
|---|---|
| Equivalence partitioning | Daily / Weekly / Monthly tiers; Cosmetic / Functional / Major damage |
| Boundary value analysis | Severity 1 and 5; deduction cap; 36 h = 2 days; salvage floor |
| White-box / branch coverage | Four settlement branches |
| Negative testing | 401 without token, 403 wrong role, 400 bad file type/size |
| Mocking / fault injection | Database failure → 503 |
| Idempotency testing | Jobs run twice, second run changes nothing |
| Regression testing | Original 32 tests re-run after every hardening package |
| Smoke testing | End-to-end lifecycle test |

---

## 5. Summary of test growth

| Stage | Date | Automated tests |
|---|---|---|
| Increments 1–2 | 18–19 Aug 2026 | 0 (manual only) |
| Increment 3 | 22 Aug 2026 | 10 |
| Increments 4–5 | 15–19 Sep 2026 | 32 (main branch) |
| Hardening | 4 Oct 2026 | 57 (deployment branch) |

---

## 6. Known gaps (be ready to admit)

- Auth and booking had no automated tests until October.
- No test that a double booking of the same window is rejected (409 Conflict).
- No exact boundary tests at 6 vs 7 days or 29 vs 30 days.
- No code-coverage measurement (coverage.py not installed).
- No frontend tests and no browser end-to-end tests.
- No load or concurrency tests (SQLite does not exercise row locks).
- No CI pipeline running tests on every push.

---

## 7. One-line viva answer

"Early increments were tested manually. From increment 3 we unit-tested the rule engines using
equivalence partitioning and boundary values. Increments 4–5 added integration tests through
Flask's test client on an in-memory database. Production hardening added regression, negative,
mock-based and a 13-step end-to-end smoke test, taking us from 32 to 57 tests, all passing."
