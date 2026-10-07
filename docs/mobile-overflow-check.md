# Mobile overflow check

`frontend/scripts/check-mobile-overflow.mjs` is the gate for the 390px layout.
It loads every shell route in headless Chromium at phone width and fails when
the page scrolls sideways: `documentElement.scrollWidth > innerWidth`.

It covers each route in `ROUTES` (`frontend/src/lib/mobileOverflow.js`), plus
`/accounts/<id>`, `/investors/<slug>` and the Analytics Risk and Projection
tabs, which only render after a click.

## Running it

Never point it at the real database. Start a throwaway stack on spare ports
with a copy of the dev DB:

```bash
cp backend/db.sqlite3 /tmp/overflow.sqlite3
# set the database path in a scratch env, then use WEB_PORT=8100 UI_PORT=5273
```

The app has two users, so a bare `get()` fails. Mint tokens for `demo`, using
the shell snippet from the `saxodash-design-system` skill with the lookup
changed to `get(username='demo')`, and save `{ "u": username, "a": access,
"r": refresh }` as `auth.json`.

Playwright is not a project dependency. If `import('playwright')` fails the
script exits `2` and prints how to find an existing install
(`find ~/.npm/_npx -maxdepth 3 -iname playwright -type d`). Copy the script to
`<install>/scripts/` and `src/lib/mobileOverflow.js` to `<install>/src/lib/`,
run it there, then delete the copies.

```bash
node check-mobile-overflow.mjs --base http://localhost:5273 --auth auth.json \
  [--width 390] [--account-id 1] [--investor-slug berkshire-hathaway]
```

Exit codes: `0` every route passes, `1` at least one overflows, `2` setup
problem (no Playwright, no `--auth`).

## Reading a row

```
/spending                          over    0  OK
/spending                          over   81  FAIL  button.x.y:471 | div.a.b:455
```

`over` is how many pixels the page is wider than the viewport. After FAIL come
up to four offending elements as `tag.first.three.classes:right-edge`, the
elements whose right edge sits past the viewport. Elements inside an
`overflow-x-auto` or `overflow-x-scroll` container and `position: fixed`
elements are ignored, since they cannot widen the page. The widest or
outermost offender is usually the culprit; fix it (wrap, truncate, or move the
table into a scroll container) and rerun.
