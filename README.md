# Polymarket Trends (Unified Main Repository)

This is the single main repository for the Polymarket dashboard.

`polymarket-trends-v2` has been merged into this repository and should be considered deprecated.

## What It Does

- Pulls active markets from Polymarket Gamma API
- Uses multi-endpoint fallback for browser CORS compatibility
- Computes a custom market heat index (probability + volume + liquidity)
- Supports sorting, filtering, manual refresh, and auto-refresh
- Displays summary cards, ranked table, and chart view

## Run Locally

No build step is required.

```bash
git clone https://github.com/djzoom/polymarket-trends.git
cd polymarket-trends
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Project Structure

- `index.html`: page layout and controls
- `main.js`: unified data pipeline + rendering logic
- `style.css`: dashboard visual system

## Notes

- API schema can evolve; parsing logic is defensive against field shape changes.
- If direct API access is blocked by CORS, proxy fallback is used automatically.

## License

MIT
