# 04: Config and docs cleanup

**What to build:** nothing in the stack, the deploy or the docs still knows about Enable Banking.

- The server deploys without `ENABLE_BANKING_*` variables.
- CI stops setting the placeholders, and the frontend image stops taking a connect URL.
- `scripts/dev.sh` stops starting the ngrok tunnel that only bank redirects needed.
- The shared connect-ticket code keeps serving Saxo, with its bank callers removed.
- AGENTS.md describes the app without Money. `docs/decisions.md` gains an entry recording the removal and why (personal-use licence, Money Tracker as a separate app), and the older banking entries are marked superseded. GLOSSARY.md drops "Money and banking", and any term the investing side still uses, such as Saxo cash, moves to Portfolio.

**Blocked by:** 02 (the code that reads these settings is deleted there). Can run in parallel with 03.

**Status:** done

- [x] No `ENABLE_BANKING_*` setting, system check, `install.sh` requirement, CI env, `.env` example entry or frontend build argument remains
- [x] `scripts/dev.sh` starts without ngrok, and `docs/running-the-stack.md` matches
- [x] Saxo re-authentication works in dev without the tunnel (manual check, as the owner)
- [x] AGENTS.md, `docs/decisions.md` and GLOSSARY.md are updated as described
- [x] Backend tests, frontend tests and build green; CI green on the PR
