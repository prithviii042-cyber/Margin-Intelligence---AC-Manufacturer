# MarginIQ — CFO Decision Bench

AI-powered margin decision support for AC manufacturers. Multi-agent architecture
with Claude Sonnet powering specialist agents across procurement, supply chain,
manufacturing, pricing, sales and marketing.

## Project structure

```
marginiq/
  src/
    App.jsx              ← Full React app (all views + co-pilot)
    main.jsx             ← Entry point
  netlify/
    functions/
      claude.js          ← API proxy (keeps your key server-side)
  public/
    pnl_template.csv     ← P&L upload template for clients
  index.html
  package.json
  vite.config.js
  netlify.toml
```

## Deploy to Netlify (5 steps)

### 1. Install dependencies (personal laptop, not EY machine)
```bash
npm install
```

### 2. Test locally (optional)
```bash
# Install Netlify CLI if you haven't
npm install -g netlify-cli

# Run locally with functions
netlify dev
```
This runs both the React app AND the Netlify function locally.
The app will be at http://localhost:8888

### 3. Push to GitHub
```bash
git init
git add .
git commit -m "MarginIQ v1"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/marginiq.git
git push -u origin main
```

### 4. Connect to Netlify
1. Go to app.netlify.com
2. Add new site → Import from Git → GitHub
3. Select your marginiq repo
4. Build settings auto-detected from netlify.toml:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Click Deploy site

### 5. Add your API key (CRITICAL)
1. Netlify dashboard → Site configuration → Environment variables
2. Add variable:
   - Key:   `ANTHROPIC_API_KEY`
   - Value: `sk-ant-api03-...` (your key from console.anthropic.com)
3. Trigger a redeploy: Deploys → Trigger deploy → Deploy site

Your site will be live at `https://marginiq-[random].netlify.app`

## P&L Upload format

The app accepts .xlsx, .xls, or .csv files.
Column A = label (see pnl_template.csv for exact label names)
Column B = value in ₹ Cr

Download the template from /pnl_template.csv and fill in client data.
The parser does fuzzy label matching so minor variations work fine.

## Updating the app

After initial deploy, every git push auto-deploys:
```bash
git add .
git commit -m "your change"
git push
```

## Agent architecture

8 agents total:
- CFO Co-pilot (Orchestrator) — synthesises all specialist views
- Procurement Lead — BOM, commodity, PLI, VAVE
- Supply Chain Lead — freight, inventory, S&OP
- Manufacturing Lead — OEE, conversion, energy
- Pricing Lead — discount leakage, mix, realisation
- Sales & Channel Lead — channel mix, e-com, AMC
- Marketing Lead — A&P productivity, promo ROI
- Finance & Risk (Sceptic) — reconciles, flags double-counting

All agents are aware of the uploaded P&L and the CFO's lever settings.

## EY context

Built as a Finance Transformation / FP&A AI adoption demonstrator.
Use for: CFO discovery sessions, art-of-possible demos, engagement kickoffs.
Not for: sharing client data externally, board-ready numbers without validation.
