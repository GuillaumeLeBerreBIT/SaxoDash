# SaxoDash

A personal finance dashboard combining live brokerage and bank data in one place.

- **Backend:** Django REST Framework
- **Frontend:** Vite + React
- **Data sources:** Saxo OpenAPI (portfolio/positions), Finnhub (company fundamentals), Enable Banking (bank account aggregation)

## Features

- Dashboard, Portfolio, Transactions, Accounts, Research, Earnings and Analytics views
- Live Saxo positions and P/L alongside hand-entered/aggregated bank accounts
- Company research (valuation, earnings, fundamentals) via Finnhub

## Getting started

```bash
scripts/dev.sh
```

This starts Redis, the Celery worker, Celery beat, Django and Vite together in one terminal.

## License

See [LICENSE.md](LICENSE.md).
