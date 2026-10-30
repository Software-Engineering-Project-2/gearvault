# GearVault – Selenium Test Cases

**Application under test:** GearVault equipment rental system (AWS deployment)
**URL:** https://d2wvsbj3dzkosr.cloudfront.net
**Tool:** Selenium IDE 4 (desktop app)
**Test project file:** `GearVault.side`
**Browser:** Google Chrome, window 1280×860

Each test starts as a logged-out guest by clearing the browser's saved session. Tests that need an account create one first, using a unique email (`selenium.<timestamp>@test.com`, password `Test@1234`). Because of that, every test can run on its own, in any order, and as many times as you like.

| ID | Title | Type |
|---|---|---|
| TC01 | New customer sign up | Positive |
| TC02 | Login with valid credentials | Positive |
| TC03 | Login with wrong password is rejected | Negative |
| TC04 | Guest browses and searches the catalog | Positive |
| TC05 | Role-based access control | Security / Negative |

---

### TC01 – New customer sign up
**Objective:** A new visitor can create an account and is logged in as a customer.
**Precondition:** Not logged in.

| Step | Action | Expected result |
|---|---|---|
| 1 | Open `/login` | "Sign In to GearVault" page shown |
| 2 | Click **Create account** | "Create Your GearVault Account" page shown |
| 3 | Enter Full Name, a unique Email, Password `Test@1234` | Fields accept input |
| 4 | Click **Create Account** | Redirected to the inventory dashboard |
| 5 | Check the navbar | Shows the new email and a **CUSTOMER** role badge, plus a **Reservations** link |

**Actual result:** _Pass / Fail_

### TC02 – Login with valid credentials
**Objective:** A registered user can sign in.
**Precondition:** A registered account exists (the test creates one, then signs out).

| Step | Action | Expected result |
|---|---|---|
| 1 | Register a new account, then click **Sign Out** | Back on the Sign In page |
| 2 | Enter the same email and password `Test@1234` | Fields accept input |
| 3 | Click **Sign In** | Redirected to "Equipment Inventory" |
| 4 | Check the navbar | Shows the user's email and a **CUSTOMER** badge |

**Actual result:** _Pass / Fail_

### TC03 – Login with wrong password is rejected
**Objective:** Wrong credentials are rejected and no session is created.
**Precondition:** A registered account exists (the test creates one, then signs out).

| Step | Action | Expected result |
|---|---|---|
| 1 | Register a new account, then click **Sign Out** | Back on the Sign In page |
| 2 | Enter the correct email with password `WrongPass999` | Fields accept input |
| 3 | Click **Sign In** | Red error message: **"Invalid email or password"** |
| 4 | Check the navbar | No user badge, so the user is not logged in |

**Actual result:** _Pass / Fail_

### TC04 – Guest browses and searches the catalog
**Objective:** Anyone can browse, filter and search the equipment catalog without logging in.
**Precondition:** Not logged in. The catalog contains the Cameras items "Canon EOS R6" and "Sony A7 IV".

| Step | Action | Expected result |
|---|---|---|
| 1 | Click **Inventory** | "Equipment Inventory" page with item cards |
| 2 | Choose Category **Cameras** | "Canon EOS R6" is listed |
| 3 | Type `Sony A7` in **Search Equipment** | "Sony A7 IV" is listed; "Canon EOS R6" disappears |
| 4 | Click **Sony A7 IV** | Item detail page with heading "Sony A7 IV" |

**Actual result:** _Pass / Fail_

### TC05 – Role-based access control
**Objective:** Protected pages can't be reached by guests or by users with the wrong role.
**Precondition:** Not logged in.

| Step | Action | Expected result |
|---|---|---|
| 1 | As a guest, open `/bookings` | Redirected to the Sign In page |
| 2 | Register a new customer account | Logged in as CUSTOMER |
| 3 | Check the navbar | No **Analytics** link (manager-only) |
| 4 | Open `/analytics` directly | **"403 — Access Denied"** page shown |

**Actual result:** _Pass / Fail_

---

## How to run

1. Install the **Selenium IDE 4** desktop app (from the SeleniumHQ GitHub releases page).
2. Open Selenium IDE, click **Open an existing project**, and choose `GearVault.side`.
3. Choose a test on the left and click **Run current test** (▶), or click **Run all tests** (▶▶).
4. A green tick next to each step and test means it passed.

## Recorded executions

| Test | Recording | Result |
|---|---|---|
| TC01 – New customer sign up | `recordings/TC01_signup.mp4` (real time, 1 s pause after each step) | Pass |
| TC03 – Login with wrong password is rejected | `recordings/TC03_wrong_password.mp4` (real time, 1 s pause after each step) | Pass |
| TC04 – Guest browses and searches the catalog | `recordings/TC04_catalog_search.mp4` (real time, 1 s pause after each step) | Pass |
