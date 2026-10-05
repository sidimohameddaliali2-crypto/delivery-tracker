# Partner Operations — End-to-End Test Plan

Covers: master menu → partner setup → partner app ordering (single and multiple days) → admin receives, acknowledges, locks/invoices → partner app order/invoice view → admin reports.

Run this against a **staging database** if possible. Every step below creates real records (menu items, orders, invoices).

---

## 0. Before you start

| Item | Expected |
|---|---|
| Server running | `npm run dev` in `server/`, no startup errors |
| Client running | `npm start` in `client/`, or the built app served by the server |
| Admin account | An account with role `admin` (or `super_admin`) |
| Kitchen account (optional) | Role `kitchen` — sees Orders / Invoices / Waste / Reports only |
| Test partner | Created in step 2 below. Use a test email you control |
| Delivery dates | Orders can only be placed **3+ days ahead** (2-day lock window). Note today's date and pick dates ≥ today+3 |
| Min order | Partner's minimum order (set in step 2). Server currently enforces **AED 200** on submit — see Known gaps |

Record today's date here: ____________

---

## 1. Admin — create master menu items

Admin → **Menu** tab.

| # | Step | Expected result |
|---|---|---|
| 1.1 | Click **Add item**. Name `Chicken Caesar Wrap`, Meal Type `Main`, Base price `22`, Selling price `25`. Save | Modal closes. Item appears in the list showing **AED 25** with "base 22" underneath |
| 1.2 | Add item `Berry Oats`, Meal Type `Oats`, Base price `18`, leave Selling price **empty**. Save | Item shows **AED 18** and "selling = base" |
| 1.3 | Add item `Protein Bowl`, Meal Type `Bowl`, Base price `30`, Selling `28`. Save | Shows AED 28, base 30 |
| 1.4 | Add item `Veg Bun`, Meal Type `Wraps/Buns`, Base `12`. Save | Appears with Wraps/Buns label |
| 1.5 | Meal Type dropdown contains exactly: Main, Snack, Bowl, Wraps/Buns, Oats (no Breakfast) | ✔ / ✘ |
| 1.6 | Edit `Chicken Caesar Wrap`, change Selling price to `26`. Save | List shows AED 26 |
| 1.7 | Use the menu **search** box: type `oats` | Only Berry Oats shows. Clear the box → all items show |
| 1.8 | Toggle availability on one item (the switch icon) | Icon changes state; item stays in list |

**Known risk (from earlier):** editing an existing item's selling price previously returned "Server error". If 1.6 fails, copy the server console line starting `Menu item update failed:` and record it in Section 9.

---

## 2. Admin — create the test partner

Admin → **Partners** tab → **Add partner**.

| # | Step | Expected result |
|---|---|---|
| 2.1 | Fill: Business name `QA Test Café`, Type `Cafe`, Contact `QA Tester`, Email `qa-partner@example.com`, Password `test1234`, Account category **MATTER PARTNER**, Min order `100` | Form accepts values |
| 2.2 | Upload a profile picture (small JPG/PNG) | Preview shows the picture |
| 2.3 | Save | Partner appears in the list. Detail panel on the right shows name, a **MATTER PARTNER** tag, and the picture |
| 2.4 | Create a second partner `QA Retail Shop`, email `qa-retail@example.com`, category **MATTER RETAIL**, min order `0` | Tag shows MATTER RETAIL |

---

## 3. Admin — assign menu items to the partner (sub-menu)

Admin → **Partners** → click `QA Test Café` → **Partner sub-menu** panel.

| # | Step | Expected result |
|---|---|---|
| 3.1 | Search box: type `wrap`. Clear it | Filtering works and clears |
| 3.2 | Tick the checkbox for `Chicken Caesar Wrap` | Item moves into a **Selected** group at the top. Price box shows **26** (inherited from master selling price) |
| 3.3 | Tick `Berry Oats` and `Protein Bowl` | All three appear under Selected |
| 3.4 | In `Protein Bowl` price box, type `27` and **stop typing** for ~1 second | A small spinner appears then disappears. **No Set button exists.** Reload the page → price still 27 |
| 3.5 | Change `Chicken Caesar Wrap` to `24` for this partner only | Partner price 24. Master item still shows 26 for other partners |
| 3.6 | Click **Recent orders** and **Members** expanders | Open without error (may be empty) |
| 3.7 | Partner `QA Retail Shop`: check the sub-menu | Items show master price (no overrides) — confirms selling price applies to all partners |
| 3.8 | Untick `Berry Oats` on `QA Test Café` | It returns to its meal-type group, not Selected |

---

## 4. Partner app — login

Open `/partner/login` in a **private window**.

| # | Step | Expected result |
|---|---|---|
| 4.1 | Page shows the large white MATTER logo at top, no "M" tile | ✔ / ✘ |
| 4.2 | Log in `qa-partner@example.com` / `test1234` | Lands on New Order |
| 4.3 | Header shows the partner's picture, `QA Test Café`, and **MATTER PARTNER** | ✔ / ✘ |
| 4.4 | Desktop sidebar: name, picture, and category tag below it | ✔ / ✘ |

---

## 5. Partner app — place a SINGLE-DAY order

New Order tab. Calendar mode switch should show **Single day** selected.

| # | Step | Expected result |
|---|---|---|
| 5.1 | Calendar: days before today+3 are greyed out and cannot be tapped | ✔ / ✘ |
| 5.2 | Tap one valid day (≥ today+3). It highlights lime. "Deliver on" shows that single date | ✔ / ✘ |
| 5.3 | Menu list shows only items assigned in step 3. Prices: Wrap 24, Protein Bowl 27, Berry Oats 25 or master price | Compare with step 3 |
| 5.4 | Add 2 × `Chicken Caesar Wrap` (+ button twice) | Cart bar appears: "2 items · <day>", total = 2 × price |
| 5.5 | Add 1 × `Protein Bowl` | Cart total updates |
| 5.6 | Tap **Checkout** | Sheet/rail shows lines, Subtotal, Delivery Free, Total, "Place order · AED X" |
| 5.7 | Total is **below partner minimum (100)** → place order. Expected: message "Minimum order is AED 100 — you're at AED …". Add more items until ≥ 100 | Blocked below 100, allowed at/above |
| 5.8 | Tap **Place order** | "Order placed" overlay showing the date, window "Morning · 5–6am", and total. Buttons: View orders, New order |
| 5.9 | Tap **View orders** → **Upcoming** | New order card shows the date, items, AED total, status **Scheduled** |

**Record the order number shown (PO-XXXX): ____________**

---

## 6. Partner app — place a MULTIPLE-DAY order

| # | Step | Expected result |
|---|---|---|
| 6.1 | New Order → tap **Multiple days** in the switch | Switch highlights Multiple days. Selected day stays selected |
| 6.2 | Tap 3 more valid days (total 3 or 4 selected) | Each highlights. "Deliver on" shows "N days selected" with the dates listed under it |
| 6.3 | Tap a selected day again | It un-selects. You can never deselect the last remaining day |
| 6.4 | Add 1 × `Protein Bowl` and 1 × `Berry Oats` | Cart reflects items |
| 6.5 | Checkout | Shows "Per day", "Days × N", Total = per-day × N. Button reads **Place N orders · AED total** |
| 6.6 | Place order | Overlay: "N orders placed", lists the dates, shows "AED x/day · AED y total" |
| 6.7 | View orders → Upcoming | One card per selected day |
| 6.8 | Switch back to **Single day** | Only one day remains selected (the earliest) |
| 6.9 | Pick a day where you already have an order | Banner: "You already have 1 order on <day> — new items merge into it." |

**Record the days selected: ____________**

---

## 7. Admin — receives the orders

Admin → **Orders** tab (sidebar badge shows New count).

| # | Step | Expected result |
|---|---|---|
| 7.1 | Badge on **Orders** tab shows the number of new orders | ✔ / ✘ |
| 7.2 | Chips: All / New / Acknowledged / Invoiced show counts | Counts match the orders from steps 5 and 6 |
| 7.3 | Click **New** chip | Only "New" orders (submitted, not acknowledged) show. Red **New** badge |
| 7.4 | Each row shows partner name, delivery date, item count. Expand the arrow → line items with quantities | ✔ / ✘ |
| 7.5 | Filter by Partner = `QA Test Café` | Only that partner's orders |
| 7.6 | Filter by date range covering the test dates, click **Apply** | Results narrow |
| 7.7 | Partner detail panel → **Recent orders** | Lists the same orders with status |

---

## 8. Admin — acknowledge the orders

| # | Step | Expected result |
|---|---|---|
| 8.1 | On one New order click **Acknowledge** | Badge changes to **Acknowledged** (navy). Chip counts update. Acknowledge button disappears |
| 8.2 | Refresh the page | Status persists |
| 8.3 | Click **Acknowledged** chip | Only acknowledged orders show |
| 8.4 | Acknowledge is not required before locking: on another New order click **Lock & invoice** directly | Confirm dialog. Accept. Order becomes **Invoiced** (lime badge) |
| 8.5 | Try acknowledging an already-locked order via the API/UI | Not offered in the UI. Expected: no acknowledge button on Invoiced orders |

---

## 9. Admin — lock and invoice, then check invoices

| # | Step | Expected result |
|---|---|---|
| 9.1 | Lock one acknowledged order: **Lock & invoice** → confirm | Order → Invoiced |
| 9.2 | Admin → **Invoices** → **Partner invoices** | New invoice `INV-…` for `QA Test Café`, delivery date, amount = order total |
| 9.3 | Expand the invoice | Line items, quantities, unit price, total matches the order |
| 9.4 | Click **Download PDF** | PDF downloads with invoice number and items |
| 9.5 | Switch to **Matter statements** | Matter statement exists with cost, margin |
| 9.6 | Lock an order whose delivery is within 2 days | Should fail with lock-window message (only if such an order exists) |

**Known gap:** the partner app has no invoice list (see step 10).

---

## 10. Partner app — see the updated order and invoice

| # | Step | Expected result |
|---|---|---|
| 10.1 | Log in as partner (mobile width, e.g. Chrome devtools 390px) | Bottom nav: New Order, My Orders, Members, Profile |
| 10.2 | My Orders → **Upcoming** | Orders from step 5–6 show. Status changes to **Locked** for the one locked in step 9 (check label — may still read *Scheduled* until refreshed) |
| 10.3 | My Orders → **Past** | Orders with past dates appear here |
| 10.4 | Profile tab | Performance tiles show Orders placed, Total spent, Invoices count, Upcoming. Counts increased |
| 10.5 | Check for an **invoice list / view invoice / download invoice** | **Expected to be missing** — see Known gaps |
| 10.6 | Check for **cancel** or **edit** on an order | **Expected to be missing** — see Known gaps |

---

## 11. Admin — reports

Admin → **Reports** tab. Set From/To covering the test dates, click **Refresh**.

| # | Step | Expected result |
|---|---|---|
| 11.1 | Three tiles: Total revenue, Total cost, Total margin, with "N locked invoices" | Revenue ≥ the locked invoice(s) from step 9 |
| 11.2 | Margin % under Total margin = (revenue − cost) / revenue | Spot-check one value |
| 11.3 | **Revenue by partner** bars | QA Test Café present with its share % |
| 11.4 | **Export CSV** on Revenue by partner | CSV downloads with partner rows |
| 11.5 | **Top items by quantity** | Items from the locked orders, ranked |
| 11.6 | **Waste by partner & party** | Empty or matches waste entries logged |

---

## 12. Admin — waste (optional, quick)

| # | Step | Expected result |
|---|---|---|
| 12.1 | Waste tab → Add to log: Partner `QA Test Café`, date, item, qty 1, reason | Row appears in the log |
| 12.2 | Filter by Partner | Filter works |

---

## Known gaps (expected to FAIL today)

These are real gaps found while writing this plan. Record each as pass/fail in the result table.

| Gap | Where | Expected by the business? |
|---|---|---|
| Partner app has **no invoice list or invoice download** | Partner app → Profile/Orders | Step 10.5 | **this should be under order whence the invoice is ready it should be there**
| Partner app has **no cancel or edit** for an order | Partner app → My Orders | Step 10.6 | *partner can edit and can cancel if it not pass the 48hours window* 
| Server rejects submit under a **hard-coded AED 200** minimum, but the app uses each partner's own minimum | `server/routes/partnerPortal.js` (~line 278) | Step 5.7 — a partner with min 100 and a total of 150 is blocked by the server |
| Editing a menu item's price once returned "Server error" | Admin Menu → Edit | Step 1.6 |
| Partner order totals use base price, not selling price | Partner order total | Compare totals in step 5.4 with the displayed price | *partner use the selling price*

---

## Results

| Section | Pass | Fail | Notes |
|---|---|---|---|
| 1 Master menu | | | |
| 2 Create partner | | | |
| 3 Sub-menu assignment | | | |
| 4 Partner login | | | |
| 5 Single-day order | | | |
| 6 Multiple-day order | | | |
| 7 Admin receives | | | |
| 8 Acknowledge | | | |
| 9 Lock & invoice | | | |
| 10 Partner view | | | |
| 11 Reports | | | |
| 12 Waste | | | |

Tester: ____________ Date: ____________ Environment: ____________
