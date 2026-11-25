# SaxoDash

A personal investing dashboard built on live brokerage data.

- **Backend:** Django REST Framework
- **Frontend:** Vite + React
- **Data sources:** Saxo OpenAPI (portfolio/positions), Finnhub (company fundamentals)

## Features

- Dashboard, Portfolio, Transactions, Research, Discover, Earnings and Analytics views
- Investors (13F filings) and Congress (House trades) trackers
- Live Saxo positions and P/L, with net worth as the portfolio plus Saxo cash
- Company research (valuation, earnings, fundamentals) via Finnhub

## Getting started

```bash
scripts/dev.sh
```

This starts Postgres (Docker), Redis, the Celery worker, Celery beat, Django and Vite together in one terminal. Details: [docs/running-the-stack.md](docs/running-the-stack.md).

## License

See [LICENSE.md](LICENSE.md).
