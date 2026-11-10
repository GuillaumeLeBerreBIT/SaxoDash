# SaxoDash

A personal finance dashboard combining live brokerage and bank data in one place.

- **Backend:** Django REST Framework
- **Frontend:** Vite + React
- **Data sources:** Saxo OpenAPI (portfolio/positions), Finnhub (company fundamentals), Enable Banking (bank account aggregation)

## Features

- Dashboard, Portfolio, Transactions, Money, Research, Discover, Earnings and Analytics views
- Investors (13F filings) and Congress (House trades) trackers
- Live Saxo positions and P/L alongside hand-entered/aggregated bank accounts
- Company research (valuation, earnings, fundamentals) via Finnhub

## Getting started

```bash
scripts/dev.sh
```

This starts Postgres (Docker), Redis, the Celery worker, Celery beat, Django and Vite together in one terminal. Details: [docs/running-the-stack.md](docs/running-the-stack.md).

## License

See [LICENSE.md](LICENSE.md).
