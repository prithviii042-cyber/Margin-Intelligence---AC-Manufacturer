import { useState, useMemo, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  TrendingDown, TrendingUp, Sparkles, X, Gauge, Package, Factory,
  Truck, Tag, Megaphone, ShoppingCart, Scale, AlertTriangle, Loader2,
  Activity, Target, Layers, Upload, CheckSquare, Square, ChevronDown,
  ChevronUp, FileSpreadsheet, RefreshCw
} from "lucide-react";

/* ============================================================
   MarginIQ — CFO Decision Bench · India AC Manufacturer
   Full production build · Netlify deployment ready
   Claude API via /api/claude proxy (Netlify Function)
   ============================================================ */

// ── SYNTHETIC SEED DATA (replaced when P&L uploaded) ──────────
const SEED = {
  companyName: "Himcool Appliances Ltd (illustrative)",
  period: "FY26 (TTM)",
  isUploaded: false,
  rev: { gross: 5120, scheme: 320, cd: 85, vr: 140, sp: 75, net: 4500 },
  units: 1450000,
  cogs: { bom: 2180, conv: 520, inf: 210, duty: 105, total: 3015 },
  below: { ofr: 165, war: 95, ins: 70, aap: 220, tmk: 115, soh: 180, coh: 230, rd: 45 },
  bom: {
    Compressor: 29, "Copper Tubing": 14, "Aluminium Fins": 10,
    "PCB/Controller": 11, Plastics: 8, "Steel Chassis": 6,
    Motor: 7, Packaging: 4, Refrigerant: 3, Other: 8,
  },
  ch: { "General Trade": 45, "Modern Trade": 20, "E-commerce": 25, "B2B/Projects": 10 },
};

const deriveMargins = (p) => {
  const nr = p.rev.net;
  const gm = nr - p.cogs.total;
  const ct = gm - p.below.ofr - p.below.war - p.below.ins;
  const br = ct - p.below.aap - p.below.tmk - p.below.soh;
  const eb = br - p.below.coh - p.below.rd;
  return {
    nr, gm, gmP: (gm / nr) * 100,
    ct, ctP: (ct / nr) * 100,
    br, brP: (br / nr) * 100,
    eb, ebP: (eb / nr) * 100,
    leakage: p.rev.gross - p.rev.net,
    leakagePct: ((p.rev.gross - p.rev.net) / p.rev.gross) * 100,
  };
};

// ── AGENTS ────────────────────────────────────────────────────
const AGENTS = {
  orch: { name: "CFO Co-pilot",      color: "#d4a574", role: "Integrator", icon: Gauge,        scope: "Routes questions to specialists, synthesises reconciled answers with CFO-grade trade-offs." },
  proc: { name: "Procurement Lead",  color: "#7eb8d4", role: "Specialist", icon: Package,      scope: "BOM costs, Cu/Al commodity, PLI localisation, VAVE, supplier terms, should-cost." },
  sc:   { name: "Supply Chain Lead", color: "#9dc4a8", role: "Specialist", icon: Truck,        scope: "Freight, inventory & WC, S&OP accuracy, network design, seasonal ramp." },
  mfg:  { name: "Mfg Lead",         color: "#c49d7e", role: "Specialist", icon: Factory,      scope: "OEE, first-pass yield, conversion cost, energy, make-vs-buy, labour productivity." },
  pri:  { name: "Pricing Lead",      color: "#d48ca5", role: "Specialist", icon: Tag,          scope: "Price architecture, discount leakage, product mix, realisation, competitor pricing." },
  sal:  { name: "Sales & Channel",   color: "#a89dc4", role: "Specialist", icon: ShoppingCart, scope: "Channel mix, trade terms, cost-to-serve, e-com vs GT economics, AMC revenue pool." },
  mkt:  { name: "Marketing Lead",    color: "#d4c574", role: "Specialist", icon: Megaphone,    scope: "A&P productivity, brand-spend-to-GM ratio, promo ROI, peak-season digital vs. brand." },
  fin:  { name: "Finance & Risk",    color: "#b8848c", role: "Sceptic",    icon: Scale,        scope: "Reconciles claims, flags double-counting, ROCE/WC impact, confidence bands, hedge risk." },
};

// ── LEVERS ────────────────────────────────────────────────────
const LEVERS = [
  {
    id: "l1", fn: "Procurement", color: "#7eb8d4",
    title: "Compressor localisation (PLI)", owner: "CPO",
    hyp: "Shift compressor volume from Thailand imports to domestic PLI-scheme suppliers.",
    sl: { lbl: "Volume shifted domestic", min: 0, max: 60, def: 40, unit: "% vol", el: 2.75 },
    deps: ["Qualify 2 Indian suppliers", "PLI certification", "Tooling capex ~₹18 Cr"],
    ags: ["proc", "fin"],
    confL: v => v > 50 ? ["Medium", "Supplier capacity risk"] : v > 30 ? ["Medium-High", "Shifts lower at >50%"] : ["High", "Conservative — 1 supplier"],
    effL: v => v > 50 ? ["18–24 months", "Extended qualification"] : ["12–18 months", "Standard PLI timeline"],
  },
  {
    id: "l2", fn: "Procurement", color: "#7eb8d4",
    title: "Copper hedge — forward cover", owner: "CPO + Treasury",
    hyp: "Hedge copper LME exposure forward to neutralise volatility across the pricing cycle.",
    sl: { lbl: "Hedge coverage", min: 0, max: 100, def: 50, unit: "% of exposure", el: 0.70 },
    deps: ["Board treasury policy sign-off", "Bank hedge lines"],
    ags: ["proc", "fin"],
    confL: v => v > 80 ? ["Medium", "Overhedge risk at >80%"] : ["High", "Standard treasury practice"],
    effL: () => ["Quick win · 3M", "Board approval needed"],
  },
  {
    id: "l3", fn: "Procurement", color: "#7eb8d4",
    title: "VAVE — heat exchanger", owner: "CPO + R&D",
    hyp: "Fin density optimisation + micro-channel redesign cuts Al+Cu content without BEE efficiency loss.",
    sl: { lbl: "Material cost reduction", min: 0, max: 10, def: 6, unit: "% of BOM", el: 9.20 },
    deps: ["R&D validation", "Warranty risk review", "BEE re-certification"],
    ags: ["proc", "mfg", "fin"],
    confL: v => v > 8 ? ["Low", "Warranty risk rises sharply"] : v > 5 ? ["Medium", "Needs R&D validation"] : ["Medium-High", "Conservative redesign"],
    effL: v => v > 7 ? ["12–18 months", "BEE re-cert timeline"] : ["9–12 months", "Standard VAVE cycle"],
  },
  {
    id: "l4", fn: "Supply Chain", color: "#9dc4a8",
    title: "S&OP accuracy improvement", owner: "COO",
    hyp: "Reduce forecast bias — cuts obsolescence write-off and peak-season airfreight cost.",
    sl: { lbl: "Forecast accuracy gain", min: 0, max: 20, def: 10, unit: "pp", el: 7.00 },
    deps: ["Demand planner tool", "Sales forecast discipline", "Monthly S&OP cadence"],
    ags: ["sc", "sal", "fin"],
    confL: v => v > 15 ? ["Low", "Full process overhaul needed"] : v > 8 ? ["Medium", "Process + tool change"] : ["Medium-High", "Achievable with discipline"],
    effL: v => v > 12 ? ["9–14 months", "Full transformation"] : ["6–9 months", "Focused improvement"],
  },
  {
    id: "l5", fn: "Supply Chain", color: "#9dc4a8",
    title: "Container utilisation — inbound", owner: "COO",
    hyp: "Lift inbound container fill-rate via supplier consolidation and mixed-load planning.",
    sl: { lbl: "Fill-rate improvement", min: 0, max: 20, def: 14, unit: "pp", el: 1.60 },
    deps: ["3PL renegotiation", "Supplier consolidation"],
    ags: ["sc", "proc"],
    confL: v => v > 18 ? ["Medium", "Near physical maximum"] : ["High", "Operationally straightforward"],
    effL: () => ["3–6 months", "Quick operational win"],
  },
  {
    id: "l6", fn: "Manufacturing", color: "#c49d7e",
    title: "OEE uplift — North plant", owner: "COO",
    hyp: "Debottleneck compressor line and reduce peak-season changeover time via TPM.",
    sl: { lbl: "OEE improvement", min: 0, max: 15, def: 10, unit: "pp", el: 4.50 },
    deps: ["Capex ₹22 Cr", "Shift pattern change", "Operator retraining"],
    ags: ["mfg", "fin"],
    confL: v => v > 12 ? ["Medium", "Capex + culture shift"] : ["Medium-High", "Achievable via TPM"],
    effL: v => v > 10 ? ["9–14 months", "Full TPM rollout"] : ["6–9 months", "Focused debottleneck"],
  },
  {
    id: "l7", fn: "Manufacturing", color: "#c49d7e",
    title: "Rooftop solar — 8 MW", owner: "COO",
    hyp: "Cut grid power dependence. Payback 4.2 yrs; PPA option for zero-capex entry.",
    sl: { lbl: "Grid power displaced", min: 0, max: 80, def: 45, unit: "%", el: 0.67 },
    deps: ["Capex ₹28 Cr or PPA model", "DISCOM approval"],
    ags: ["mfg", "fin"],
    confL: v => v > 65 ? ["Medium", "Roof area constraint"] : ["High", "Proven technology"],
    effL: () => ["12 months", "DISCOM approval is critical path"],
  },
  {
    id: "l8", fn: "Pricing", color: "#d48ca5",
    title: "Discount leakage recovery", owner: "CCO",
    hyp: "Gross-to-net 12.1% vs peers 9.5%. Tighten scheme governance to recover basis points.",
    sl: { lbl: "Leakage recovered", min: 0, max: 250, def: 150, unit: "bps", el: 0.63 },
    deps: ["Trade scheme governance", "Channel backlash risk", "RGM capability build"],
    ags: ["pri", "sal", "fin"],
    confL: v => v > 200 ? ["Low", "Channel conflict risk"] : v > 120 ? ["Medium", "Needs RGM governance"] : ["Medium-High", "Achievable via discipline"],
    effL: v => v > 180 ? ["9–12 months", "Full RGM transformation"] : ["6 months", "Governance tightening"],
  },
  {
    id: "l9", fn: "Pricing", color: "#d48ca5",
    title: "5★ inverter mix shift", owner: "CCO + CMO",
    hyp: "Push 5★ inverter — higher ₹/unit realisation despite +₹2,100/unit BOM uplift.",
    sl: { lbl: "Mix shift to 5★ inverter", min: 0, max: 20, def: 15, unit: "pp", el: 5.20 },
    deps: ["Range rationalisation", "Retailer SKU push", "Consumer financing"],
    ags: ["pri", "mkt", "proc", "fin"],
    confL: v => v > 15 ? ["Medium", "Consumer financing key enabler"] : ["Medium-High", "Range push viable"],
    effL: () => ["9–12 months", "Retailer alignment critical path"],
  },
  {
    id: "l10", fn: "Sales & Channel", color: "#a89dc4",
    title: "E-com cost-to-serve fix", owner: "CCO",
    hyp: "E-com margin 480 bps below GT. Renegotiate platform fees and reduce DOA/return rate.",
    sl: { lbl: "E-com margin gap closed", min: 0, max: 100, def: 50, unit: "% of gap", el: 1.10 },
    deps: ["Platform contract cycle", "Installation SLA", "Return policy redesign"],
    ags: ["sal", "sc", "fin"],
    confL: v => v > 80 ? ["Low", "Platform leverage limited"] : v > 50 ? ["Medium", "Contract cycle dependent"] : ["Medium-High", "Near-term achievable"],
    effL: () => ["6–9 months", "Platform contract cycle drives timing"],
  },
  {
    id: "l11", fn: "Sales & Channel", color: "#a89dc4",
    title: "AMC attach rate uplift", owner: "CCO",
    hyp: "Service revenue is highest-GM pool. Lift POS attach via dealer incentive redesign.",
    sl: { lbl: "AMC attach rate", min: 5, max: 30, def: 18, unit: "% of sales", el: 3.50 },
    deps: ["Dealer incentive design", "CRM integration", "Service capacity build"],
    ags: ["sal", "fin"],
    confL: v => v > 25 ? ["Medium", "Service capacity constraint"] : ["Medium-High", "Dealer incentive proven lever"],
    effL: v => v > 22 ? ["14–18 months", "Capacity build needed"] : ["12 months", "Standard attach programme"],
  },
  {
    id: "l12", fn: "Marketing", color: "#d4c574",
    title: "A&P zero-base reallocation", owner: "CMO",
    hyp: "Cut bottom-quartile brand spend; redeploy 40% to peak-season digital for better ROI.",
    sl: { lbl: "A&P zero-based cut", min: 0, max: 30, def: 20, unit: "% of A&P", el: 1.75 },
    deps: ["MMM refresh", "Agency re-brief"],
    ags: ["mkt", "fin"],
    confL: v => v > 25 ? ["Low", "Brand equity risk at >25%"] : ["Medium", "Needs MMM validation"],
    effL: () => ["3–6 months", "Agency cycle drives timeline"],
  },
  {
    id: "l13", fn: "Cross-functional", color: "#d4a574",
    title: "SKU rationalisation", owner: "CFO",
    hyp: "22% of SKUs = 3% of margin but 18% of working capital. Prune and migrate dealers.",
    sl: { lbl: "SKUs rationalised", min: 0, max: 35, def: 22, unit: "% of portfolio", el: 2.70 },
    deps: ["Range committee", "Dealer migration plan", "Obsolescence provision"],
    ags: ["pri", "sc", "mfg", "fin"],
    confL: v => v > 30 ? ["Medium", "Dealer disruption risk"] : ["High", "Data-driven, clear case"],
    effL: () => ["6 months", "Range committee cadence"],
  },
];

const SC_GROUPS = [
  { g: "Procurement",    c: "#7eb8d4", s: [{ k: "cu",  l: "Copper price Δ",       min: -30, max: 30,  u: "%",       el: -1.8  }, { k: "al",  l: "Aluminium Δ",          min: -30, max: 30,  u: "%",       el: -1.1  }, { k: "loc", l: "Compressor local.",     min: 0,   max: 60,  u: "% vol",   el: 2.75  }] },
  { g: "Manufacturing",  c: "#c49d7e", s: [{ k: "oee", l: "OEE uplift",            min: 0,   max: 15,  u: "pp",      el: 4.5   }] },
  { g: "Supply Chain",   c: "#9dc4a8", s: [{ k: "frt", l: "Freight Δ",             min: -15, max: 25,  u: "%",       el: -0.85 }, { k: "sop", l: "S&OP gain",             min: 0,   max: 15,  u: "pp",      el: 6.8   }] },
  { g: "Pricing & Mix",  c: "#d48ca5", s: [{ k: "dlk", l: "Discount recovery",     min: 0,   max: 200, u: "bps",     el: 0.63  }, { k: "fss", l: "5★ mix shift",          min: 0,   max: 20,  u: "pp",      el: 5.2   }] },
  { g: "Sales & Mktg",   c: "#a89dc4", s: [{ k: "ecm", l: "E-com shift",           min: -10, max: 15,  u: "pp",      el: -2.1  }, { k: "aap", l: "A&P cut",              min: 0,   max: 25,  u: "%",       el: 1.75  }] },
];

// ── HELPERS ───────────────────────────────────────────────────
const fmtCr  = n => `₹${Math.round(n).toLocaleString("en-IN")} Cr`;
const fmtPct = n => `${Number(n).toFixed(1)}%`;
const fmtBps = n => `${n >= 0 ? "+" : ""}${Math.round(n)} bps`;
const confColor = c => c === "High" ? "#9dc4a8" : c === "Medium-High" ? "#c4ba6e" : c === "Medium" ? "#d4a574" : "#b8848c";

// ── CLAUDE API (calls Netlify Function proxy) ─────────────────
async function callClaude(messages, system) {
  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.content?.filter(c => c.type === "text").map(c => c.text).join("\n") || "No response.";
  } catch (e) {
    console.error("Claude API error:", e);
    return `⚠ Agent unavailable: ${e.message}. Check your ANTHROPIC_API_KEY in Netlify environment variables.`;
  }
}

// ── SYSTEM PROMPTS ────────────────────────────────────────────
const orchSystem = (pnl, m) =>
  `You are the CFO Co-pilot — orchestrator for ${pnl.companyName}.
Company: Net Rev ${fmtCr(pnl.rev.net)} · EBITDA ${fmtPct(m.ebP)} · Gross→Net leakage ${fmtPct(m.leakagePct)}.
You have 7 specialists: Procurement, Supply Chain, Manufacturing, Pricing, Sales & Channel, Marketing, Finance & Risk.
On every question:
1) Name which specialists are relevant.
2) Synthesise — resolve tensions between specialists, don't just list views.
3) Surface the CFO trade-off (cost of getting it wrong, interaction effects).
4) Quantify every claim in ₹Cr and bps on EBITDA.
5) Close with: EBITDA impact · #1 risk · Owner of the decision.
Under 240 words. Boardroom tone. India AC context (PLI, BEE ratings, LME, seasonal WC).`;

const agentSystem = (agId, l, v, pnl, m) => {
  const a = AGENTS[agId];
  const bps = Math.round(v * l.sl.el);
  const cr  = Math.round(pnl.rev.net * bps / 10000);
  return `You are ${a.name} on a CFO advisory bench for ${pnl.companyName}. Role: ${a.role}. Scope: ${a.scope}.
Company: Net Rev ${fmtCr(pnl.rev.net)} · EBITDA ${fmtPct(m.ebP)} · Compressor ${pnl.bom.Compressor}% of BOM · GT ${pnl.ch["General Trade"]}%, E-com ${pnl.ch["E-commerce"]}%.
Lever: "${l.title}". Hypothesis: ${l.hyp}.
CFO has set slider to: ${v} ${l.sl.unit} (default was ${l.sl.def} ${l.sl.unit}).
Expected EBITDA at this setting: +${bps} bps = ${fmtCr(cr)}.
Your job: Honest functional view at THIS specific setting (${v} ${l.sl.unit}).
- What changes vs the default assumption?
- What is the key risk at this ambition level?
- What does success look like in practice?
End with: IMPACT · CONFIDENCE · EFFORT · OWNER. Under 160 words. India AC context.`;
};

// ── P&L UPLOAD PARSER ─────────────────────────────────────────
function parsePnLFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        // Build a label → value map (case-insensitive, trim)
        const map = {};
        rows.forEach(row => {
          if (!row[0]) return;
          const key = String(row[0]).toLowerCase().trim();
          const val = Number(row[1]);
          if (!isNaN(val) && val !== 0) map[key] = val;
        });

        const get = (...keys) => {
          for (const k of keys) {
            const match = Object.entries(map).find(([mk]) => mk.includes(k));
            if (match) return match[1];
          }
          return null;
        };

        const parsed = JSON.parse(JSON.stringify(SEED)); // deep clone
        parsed.isUploaded = true;
        parsed.companyName = file.name.replace(/\.[^/.]+$/, "") + " (uploaded)";

        // Revenue
        if (get("gross revenue", "gross sales", "total revenue")) parsed.rev.gross = get("gross revenue", "gross sales", "total revenue");
        if (get("net revenue", "net sales")) parsed.rev.net = get("net revenue", "net sales");
        if (get("trade scheme", "trade discount")) parsed.rev.scheme = get("trade scheme", "trade discount");
        if (get("cash discount")) parsed.rev.cd = get("cash discount");
        if (get("volume rebate", "rebate")) parsed.rev.vr = get("volume rebate", "rebate");

        // COGS
        if (get("bom", "material cost", "raw material")) parsed.cogs.bom = get("bom", "material cost", "raw material");
        if (get("conversion cost", "conversion")) parsed.cogs.conv = get("conversion cost", "conversion");
        if (get("inbound freight", "inbound logistic")) parsed.cogs.inf = get("inbound freight", "inbound logistic");
        if (get("import duty", "duty")) parsed.cogs.duty = get("import duty", "duty");
        if (get("total cogs", "cogs", "cost of goods")) parsed.cogs.total = get("total cogs", "cogs", "cost of goods");
        else parsed.cogs.total = parsed.cogs.bom + parsed.cogs.conv + parsed.cogs.inf + parsed.cogs.duty;

        // Below-GM
        if (get("outbound freight", "outbound logistic")) parsed.below.ofr = get("outbound freight", "outbound logistic");
        if (get("warranty")) parsed.below.war = get("warranty");
        if (get("installation")) parsed.below.ins = get("installation");
        if (get("advertising", "a&p", "brand spend")) parsed.below.aap = get("advertising", "a&p", "brand spend");
        if (get("trade marketing")) parsed.below.tmk = get("trade marketing");
        if (get("selling overhead", "selling oh", "sales overhead")) parsed.below.soh = get("selling overhead", "selling oh", "sales overhead");
        if (get("corporate overhead", "corporate oh", "admin")) parsed.below.coh = get("corporate overhead", "corporate oh", "admin");
        if (get("r&d", "research")) parsed.below.rd = get("r&d", "research");

        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ── CSS TOKENS ────────────────────────────────────────────────
const T = {
  bg:  "#0f0e0b", bg2: "#131110",
  s3:  "rgba(255,255,255,0.025)",
  brd: "rgba(255,255,255,0.07)",
  tx:  "#e8e3d5", sub: "#8a8579", dim: "#5c5850",
  gld: "#d4a574", grn: "#9dc4a8", red: "#b8848c",
};

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=Inter+Tight:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${T.bg}; color: ${T.tx}; font-family: 'Inter Tight', -apple-system, sans-serif; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: ${T.bg}; }
  ::-webkit-scrollbar-thumb { background: #2a2720; border-radius: 3px; }
  input[type=range] { -webkit-appearance: none; width: 100%; background: transparent; }
  input[type=range]::-webkit-slider-runnable-track { height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 15px; height: 15px; background: ${T.gld}; border-radius: 50%; margin-top: -6px; cursor: pointer; transition: transform .15s; }
  input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.2); }
  .fade { animation: fadeIn .3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: none; } }
`;

// ── SMALL UI COMPONENTS ───────────────────────────────────────
function Kpi({ label, value, sub, delta, small }) {
  const tc = delta === undefined ? T.gld : delta >= 0 ? T.grn : T.red;
  return (
    <div style={{ background: T.s3, border: `1px solid ${T.brd}`, padding: small ? "11px 14px" : "14px 16px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 2, height: "100%", background: tc, opacity: .75 }} />
      <div style={{ fontSize: 9, letterSpacing: ".17em", textTransform: "uppercase", color: T.sub, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: small ? 17 : 21, fontFamily: "'Fraunces', Georgia, serif", color: T.tx, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: T.sub, marginTop: 3 }}>{sub}</div>}
      {delta !== undefined && (
        <div style={{ fontSize: 10, color: tc, marginTop: 3, display: "flex", alignItems: "center", gap: 3 }}>
          {delta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {fmtBps(delta)}
        </div>
      )}
    </div>
  );
}

function WBar({ l: label, v: value, max, pos, s: sub }) {
  const w = Math.min(100, Math.abs(value) / max * 100);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2, color: "#c8c1af" }}>
        <span>{label}{sub && <span style={{ color: T.dim, marginLeft: 5, fontSize: 9 }}>{sub}</span>}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: T.tx }}>{value >= 0 ? "+" : ""}{fmtCr(value)}</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.03)" }}>
        <div style={{ width: `${w}%`, height: "100%", background: pos ? T.grn : T.red, opacity: .62 }} />
      </div>
    </div>
  );
}

function AgentVoice({ agId, content, setting, unit, bps }) {
  const a = AGENTS[agId];
  const Icon = a.icon;
  return (
    <div style={{ marginBottom: 13, padding: "11px 13px", background: "rgba(255,255,255,0.015)", borderLeft: `2px solid ${a.color}`, border: `1px solid ${a.color}22` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <Icon size={12} color={a.color} />
        <span style={{ fontSize: 12, color: a.color, fontWeight: 500 }}>{a.name}</span>
        <span style={{ fontSize: 8, color: T.dim, textTransform: "uppercase", letterSpacing: ".1em" }}>{a.role}</span>
      </div>
      <div style={{ fontSize: 10, padding: "2px 8px", background: "rgba(212,165,116,0.1)", border: "1px solid rgba(212,165,116,0.22)", color: T.gld, display: "inline-block", marginBottom: 6 }}>
        @ {setting} {unit} · +{bps} bps
      </div>
      <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.72, whiteSpace: "pre-wrap" }}>{content}</div>
    </div>
  );
}

// ── UPLOAD PANEL ──────────────────────────────────────────────
function UploadPanel({ onUpload, uploadStatus }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    onUpload(null, "Parsing file…");
    try {
      const parsed = await parsePnLFile(file);
      onUpload(parsed, `✓ Loaded: ${file.name}`);
    } catch (e) {
      onUpload(null, `✗ Parse error: ${e.message}. Check your file format.`);
    }
  };

  return (
    <div style={{ background: T.s3, border: `2px dashed ${dragging ? T.gld : T.brd}`, padding: "28px 24px", textAlign: "center", transition: "border-color .2s", cursor: "pointer" }}
      onClick={() => fileRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
        onChange={e => handleFile(e.target.files?.[0])} />
      <FileSpreadsheet size={28} color={T.gld} style={{ margin: "0 auto 10px" }} />
      <div style={{ fontSize: 13, color: T.tx, marginBottom: 6 }}>Drop your P&L file here or click to upload</div>
      <div style={{ fontSize: 11, color: T.sub }}>Excel (.xlsx, .xls) or CSV · Label-value format</div>
      {uploadStatus && (
        <div style={{ marginTop: 12, fontSize: 11, color: uploadStatus.startsWith("✓") ? T.grn : uploadStatus.startsWith("✗") ? T.red : T.gld }}>
          {uploadStatus}
        </div>
      )}
      <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(212,165,116,0.05)", border: "1px solid rgba(212,165,116,0.18)", textAlign: "left" }}>
        <div style={{ fontSize: 9, letterSpacing: ".16em", textTransform: "uppercase", color: T.gld, marginBottom: 7 }}>Expected row labels in column A (value in column B, ₹ Cr)</div>
        <div style={{ fontSize: 10, color: T.sub, lineHeight: 1.9, fontFamily: "'JetBrains Mono', monospace" }}>
          Gross Revenue · Net Revenue · Trade Scheme · Cash Discount<br />
          Volume Rebate · BOM · Conversion Cost · Inbound Freight<br />
          Import Duty · Total COGS · Outbound Freight · Warranty<br />
          Installation · Advertising / A&P · Trade Marketing<br />
          Selling Overhead · Corporate Overhead · R&D
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────
export default function App() {
  const [pnl, setPnl]         = useState(SEED);
  const [uploadStatus, setUS] = useState("");
  const [view, setView]       = useState("cmd");
  const [showUpload, setSU]   = useState(false);

  // Lever state
  const initSliders = () => Object.fromEntries(LEVERS.map(l => [l.id, l.sl.def]));
  const [levSliders, setLevSliders] = useState(initSliders);
  const [selected, setSelected]     = useState({});
  const [expanded, setExpanded]     = useState({});

  // Scenario state
  const initSc = () => Object.fromEntries(SC_GROUPS.flatMap(g => g.s.map(s => [s.k, 0])));
  const [sc, setSc] = useState(initSc);

  // Modal state
  const [activeLever, setActiveLever] = useState(null);
  const [leverAnalysis, setLevAn]     = useState({});
  const [benchRunning, setBR]         = useState(false);

  // Co-pilot state
  const [copOpen, setCopOpen]   = useState(false);
  const [chatHistory, setChat]  = useState([]);
  const [chatInput, setChatInp] = useState("");
  const [chatLoading, setChatLd]= useState(false);
  const chatBodyRef             = useRef(null);

  const base = useMemo(() => deriveMargins(pnl), [pnl]);

  // Scenario impact
  const scImpact = useMemo(() => {
    let tot = 0; const pts = [];
    SC_GROUPS.forEach(g => g.s.forEach(s => {
      const b = sc[s.k] * s.el; tot += b;
      if (Math.abs(b) > 0.4) pts.push({ l: s.l, b, v: sc[s.k], u: s.u });
    }));
    return { tot, pts };
  }, [sc]);

  // Per-lever bps helpers
  const bpsFor = useCallback((l, v) => Math.round((v ?? levSliders[l.id]) * l.sl.el), [levSliders]);
  const crFor  = useCallback((l, v) => Math.round(base.nr * bpsFor(l, v) / 10000), [base.nr, bpsFor]);

  // Portfolio
  const portfolio = useMemo(() => {
    const sel = LEVERS.filter(l => selected[l.id]);
    const totalBps = sel.reduce((a, l) => a + bpsFor(l), 0);
    return { sel, totalBps, totalCr: Math.round(base.nr * totalBps / 10000), newEP: base.ebP + totalBps / 100 };
  }, [selected, levSliders, base, bpsFor]);

  // ── HANDLERS ────────────────────────────────────────────────
  const handleUpload = (parsed, status) => {
    setUS(status);
    if (parsed) { setPnl(parsed); setSU(false); setLevAn({}); }
  };

  const onCardSlide = (id, v) => {
    setLevSliders(p => ({ ...p, [id]: v }));
  };

  const toggleSel = (id) => setSelected(p => ({ ...p, [id]: !p[id] }));
  const toggleExp = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const openModal = (id) => {
    setActiveLever(LEVERS.find(l => l.id === id));
  };

  const onModalSlide = (v) => {
    if (!activeLever) return;
    setLevSliders(p => ({ ...p, [activeLever.id]: v }));
  };

  const runBench = async () => {
    if (benchRunning || !activeLever) return;
    const l = activeLever;
    const v = levSliders[l.id];
    setBR(true);
    setLevAn(p => ({ ...p, [l.id]: { loading: true, voices: [] } }));
    const voices = [];
    for (const agId of l.ags) {
      const sys = agentSystem(agId, l, v, pnl, base);
      const reply = await callClaude(
        [{ role: "user", content: `Analyse "${l.title}" at CFO setting ${v} ${l.sl.unit}. Expected: +${bpsFor(l, v)} bps (${fmtCr(crFor(l, v))}). Give your functional assessment.` }],
        sys
      );
      voices.push({ agId, content: reply });
      setLevAn(p => ({ ...p, [l.id]: { loading: true, voices: [...voices] } }));
    }
    setLevAn(p => ({ ...p, [l.id]: { loading: false, voices } }));
    setBR(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = { role: "user", content: chatInput };
    const next = [...chatHistory, msg];
    setChat(next); setChatInp(""); setChatLd(true);
    const reply = await callClaude(
      next.map(m => ({ role: m.role, content: m.content })),
      orchSystem(pnl, base)
    );
    setChat([...next, { role: "assistant", content: reply, agents: ["orch"] }]);
    setChatLd(false);
    setTimeout(() => { if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight; }, 50);
  };

  const STARTERS = [
    "What happens to EBITDA if copper rises 15% and we pass only 40% to price?",
    "Rank my top 3 margin levers for FY27 by ROI × feasibility.",
    "If e-com grows to 35% of mix, what breaks first?",
    "Give me a 200 bps EBITDA expansion roadmap for 18 months.",
    "Which levers should CPO own vs COO vs CCO?",
  ];

  const NAV = [
    { id: "cmd", label: "Command Centre", icon: Activity },
    { id: "sc",  label: "Scenario Builder", icon: Target },
    { id: "lv",  label: "Lever Library", icon: Layers },
    { id: "up",  label: "Upload P&L", icon: Upload },
  ];

  const navBtn = (v) => ({
    padding: "6px 11px", border: `1px solid ${view === v ? "rgba(212,165,116,0.35)" : T.brd}`,
    background: view === v ? "rgba(212,165,116,0.1)" : "transparent",
    color: view === v ? T.gld : "#c8c1af", cursor: "pointer",
    fontSize: 10, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
  });

  const modalV = levSliders[activeLever?.id] ?? 0;
  const modalBps = activeLever ? bpsFor(activeLever, modalV) : 0;
  const [mConf, mConfNote] = activeLever ? activeLever.confL(modalV) : ["—", ""];
  const [mEff, mEffNote]   = activeLever ? activeLever.effL(modalV)  : ["—", ""];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.tx, fontFamily: "'Inter Tight', -apple-system, sans-serif", backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(212,165,116,0.06), transparent 55%)" }}>
      <style>{styles}</style>

      {/* ── HEADER ── */}
      <header style={{ borderBottom: `1px solid ${T.brd}`, padding: "11px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "rgba(15,14,11,0.94)", backdropFilter: "blur(12px)", zIndex: 20, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 22, height: 22, background: "linear-gradient(135deg,#d4a574,#b8848c)", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 14, fontFamily: "'Fraunces', Georgia, serif" }}>MarginIQ</div>
            <div style={{ fontSize: 8, color: T.sub, letterSpacing: ".16em", textTransform: "uppercase" }}>CFO Decision Bench · AC Manufacturing</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {NAV.map(v => { const I = v.icon; return (
            <button key={v.id} onClick={() => setView(v.id)} style={navBtn(v.id)}><I size={11} />{v.label}</button>
          ); })}
          <button onClick={() => setCopOpen(true)} style={{ padding: "6px 13px", background: "linear-gradient(135deg,rgba(212,165,116,0.18),rgba(184,132,140,0.12))", border: "1px solid rgba(212,165,116,0.4)", color: T.tx, cursor: "pointer", fontSize: 10, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
            <Sparkles size={11} /> CFO Co-pilot
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 22px 100px" }}>

        {/* Company strip */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div>
            <div style={{ fontSize: 8, letterSpacing: ".2em", textTransform: "uppercase", color: T.sub, marginBottom: 3 }}>
              {pnl.isUploaded ? "Client · Uploaded Data" : "Client · Illustrative Synthetic Data"}
            </div>
            <div style={{ fontSize: 20, fontFamily: "'Fraunces', Georgia, serif" }}>{pnl.companyName}</div>
            <div style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>{pnl.period} · India Residential AC · {(pnl.units / 1e6).toFixed(2)}M units</div>
          </div>
          {pnl.isUploaded && (
            <button onClick={() => { setPnl(SEED); setUS(""); setLevAn({}); }}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", background: "transparent", border: `1px solid ${T.brd}`, color: T.sub, cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>
              <RefreshCw size={10} /> Reset to demo data
            </button>
          )}
        </div>

        {/* ══════════════ COMMAND CENTRE ══════════════ */}
        {view === "cmd" && (
          <div className="fade">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 9, marginBottom: 20 }}>
              <Kpi label="Net Revenue"       value={fmtCr(base.nr)}          sub={`Gross ${fmtCr(pnl.rev.gross)}`} />
              <Kpi label="Gross Margin"      value={fmtPct(base.gmP)}         sub={fmtCr(base.gm)}   delta={0} />
              <Kpi label="Contribution"      value={fmtPct(base.ctP)}         sub={fmtCr(base.ct)}   delta={0} />
              <Kpi label="EBITDA"            value={fmtPct(base.ebP)}         sub={fmtCr(base.eb)}   delta={base.ebP > 8 ? 15 : -10} />
              <Kpi label="Gross→Net Leakage" value={fmtPct(base.leakagePct)} sub={fmtCr(base.leakage)} delta={-28} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 22 }}>
              <div>
                <div style={{ fontSize: 8, letterSpacing: ".2em", textTransform: "uppercase", color: T.sub, marginBottom: 9 }}>Margin Waterfall — {pnl.period}</div>
                <div style={{ background: T.s3, border: `1px solid ${T.brd}`, padding: "15px 17px" }}>
                  {[
                    { l: "Gross Revenue",             v: pnl.rev.gross, pos: true  },
                    { l: "Trade Schemes",              v: -pnl.rev.scheme, pos: false, s: "leakage lever" },
                    { l: "Cash Disc + Rebates",        v: -(pnl.rev.cd + pnl.rev.vr + pnl.rev.sp), pos: false },
                    { l: "Net Revenue",                v: pnl.rev.net, pos: true  },
                    { l: "BOM",                        v: -pnl.cogs.bom, pos: false, s: "Cu/Al/compressor" },
                    { l: "Conversion Cost",            v: -pnl.cogs.conv, pos: false },
                    { l: "Inbound Freight + Duty",     v: -(pnl.cogs.inf + pnl.cogs.duty), pos: false },
                    { l: "Gross Margin",               v: base.gm, pos: true  },
                    { l: "Outbound + Warranty + Install", v: -(pnl.below.ofr + pnl.below.war + pnl.below.ins), pos: false },
                    { l: "A&P + Trade Mktg + Selling", v: -(pnl.below.aap + pnl.below.tmk + pnl.below.soh), pos: false },
                    { l: "Corporate OH + R&D",         v: -(pnl.below.coh + pnl.below.rd), pos: false },
                    { l: "EBITDA",                     v: base.eb, pos: true  },
                  ].map(r => <WBar key={r.l} {...r} max={pnl.rev.gross} />)}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <div style={{ fontSize: 8, letterSpacing: ".2em", textTransform: "uppercase", color: T.sub, marginBottom: 9 }}>Advisory Bench — 8 Agents</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {Object.entries(AGENTS).map(([id, a]) => { const I = a.icon; return (
                      <div key={id} style={{ background: T.s3, border: `1px solid ${T.brd}`, padding: "9px 11px", display: "flex", gap: 9, alignItems: "flex-start" }}>
                        <div style={{ width: 24, height: 24, background: `${a.color}14`, border: `1px solid ${a.color}38`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <I size={12} color={a.color} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 500, color: T.tx }}>{a.name}<span style={{ fontSize: 7, color: T.dim, marginLeft: 5, textTransform: "uppercase", letterSpacing: ".1em" }}>{a.role}</span></div>
                          <div style={{ fontSize: 10, color: T.sub, marginTop: 2, lineHeight: 1.45 }}>{a.scope}</div>
                        </div>
                      </div>
                    ); })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 8, letterSpacing: ".2em", textTransform: "uppercase", color: T.sub, marginBottom: 9 }}>BOM Shape — 1.5TR 5★ Inverter</div>
                  <div style={{ background: T.s3, border: `1px solid ${T.brd}`, padding: "13px 15px" }}>
                    {Object.entries(pnl.bom).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                      <div key={k} style={{ marginBottom: 7 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                          <span style={{ color: "#c8c1af" }}>{k}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: T.tx }}>{v}%</span>
                        </div>
                        <div style={{ height: 3, background: "rgba(255,255,255,0.03)" }}>
                          <div style={{ width: `${v * 2.5}%`, height: "100%", background: "#7eb8d4", opacity: .52 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ SCENARIO BUILDER ══════════════ */}
        {view === "sc" && (
          <div className="fade" style={{ display: "grid", gridTemplateColumns: "290px 1fr", gap: 22 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
                <div style={{ fontSize: 8, letterSpacing: ".2em", textTransform: "uppercase", color: T.sub }}>Lever Controls</div>
                <button onClick={() => setSc(initSc())} style={{ background: "none", border: "none", color: T.dim, fontSize: 9, cursor: "pointer", fontFamily: "inherit" }}>RESET</button>
              </div>
              {SC_GROUPS.map(g => (
                <div key={g.g} style={{ background: T.s3, border: `1px solid ${T.brd}`, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ fontSize: 8, letterSpacing: ".17em", textTransform: "uppercase", color: g.c, marginBottom: 9, paddingBottom: 5, borderBottom: `1px solid ${g.c}22` }}>{g.g}</div>
                  {g.s.map(s => (
                    <div key={s.k} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                        <span style={{ color: "#c8c1af" }}>{s.l}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: T.gld, fontSize: 12 }}>{sc[s.k] >= 0 ? "+" : ""}{sc[s.k]}{s.u}</span>
                      </div>
                      <input type="range" min={s.min} max={s.max} step={1} value={sc[s.k]}
                        onChange={e => setSc(p => ({ ...p, [s.k]: Number(e.target.value) }))} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 8, letterSpacing: ".2em", textTransform: "uppercase", color: T.sub, marginBottom: 9 }}>Integrated Impact — Live</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9, marginBottom: 16 }}>
                <Kpi label="Baseline EBITDA" value={fmtPct(base.ebP)} sub={fmtCr(base.eb)} />
                <Kpi label="Scenario Delta"  value={fmtBps(scImpact.tot)} delta={scImpact.tot} />
                <Kpi label="New EBITDA"      value={fmtPct(base.ebP + scImpact.tot / 100)} sub={fmtCr(base.nr * (base.ebP + scImpact.tot / 100) / 100)} delta={scImpact.tot} />
                <Kpi label="Value at Stake"  value={fmtCr(base.nr * scImpact.tot / 10000)} delta={scImpact.tot} />
              </div>
              <div style={{ background: T.s3, border: `1px solid ${T.brd}`, padding: "14px 16px", marginBottom: 13 }}>
                <div style={{ fontSize: 8, letterSpacing: ".2em", textTransform: "uppercase", color: T.sub, marginBottom: 11 }}>Lever Contribution Bridge</div>
                {scImpact.pts.length === 0
                  ? <div style={{ fontSize: 11, color: T.dim, fontStyle: "italic", textAlign: "center", padding: "14px 0" }}>Move any slider to build the bridge.</div>
                  : scImpact.pts.sort((a, b) => Math.abs(b.b) - Math.abs(a.b)).map(p => {
                    const mx = Math.max(...scImpact.pts.map(x => Math.abs(x.b)));
                    return (
                      <div key={p.l} style={{ marginBottom: 9 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                          <span style={{ color: "#c8c1af" }}>{p.l} <span style={{ color: T.dim, fontSize: 9 }}>{p.v >= 0 ? "+" : ""}{p.v}{p.u}</span></span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: p.b >= 0 ? T.grn : T.red, fontSize: 12 }}>{fmtBps(p.b)}</span>
                        </div>
                        <div style={{ height: 4, background: "rgba(255,255,255,0.03)" }}>
                          <div style={{ width: `${Math.abs(p.b) / mx * 100}%`, height: "100%", background: p.b >= 0 ? T.grn : T.red, opacity: .62 }} />
                        </div>
                      </div>
                    );
                  })
                }
              </div>
              <div style={{ padding: "10px 13px", background: "rgba(212,165,116,0.04)", border: "1px solid rgba(212,165,116,0.18)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <AlertTriangle size={11} color={T.gld} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ fontSize: 11, color: "#c8c1af", lineHeight: 1.65 }}>
                  <strong style={{ color: T.gld }}>Finance & Risk:</strong> Lever interactions can dampen combined impact 10–20%. Use Lever Library for precision deep-dives, then ask the Co-pilot to reconcile.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ LEVER LIBRARY ══════════════ */}
        {view === "lv" && (
          <div className="fade">
            {/* Portfolio bar */}
            {portfolio.sel.length > 0 && (
              <div style={{ background: "rgba(157,196,168,0.07)", border: "1px solid rgba(157,196,168,0.28)", padding: "14px 18px", marginBottom: 18 }}>
                <div style={{ fontSize: 8, letterSpacing: ".14em", textTransform: "uppercase", color: T.grn, marginBottom: 10, fontWeight: 500 }}>CFO Selected Portfolio — {portfolio.sel.length} lever{portfolio.sel.length > 1 ? "s" : ""}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,auto)", gap: 22, marginBottom: 10 }}>
                  {[
                    { l: "EBITDA delta",    v: `+${portfolio.totalBps} bps` },
                    { l: "Value at stake",  v: fmtCr(portfolio.totalCr) },
                    { l: "New EBITDA %",    v: fmtPct(portfolio.newEP) },
                  ].map(s => (
                    <div key={s.l}>
                      <div style={{ fontSize: 22, fontFamily: "'Fraunces', Georgia, serif", color: T.grn }}>{s.v}</div>
                      <div style={{ fontSize: 8, letterSpacing: ".13em", textTransform: "uppercase", color: T.sub, marginTop: 2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {portfolio.sel.map(l => (
                    <span key={l.id} style={{ fontSize: 10, padding: "2px 8px", background: "rgba(255,255,255,0.03)", border: `1px solid ${T.brd}`, color: "#c8c1af" }}>
                      {l.title.slice(0, 22)}… <strong>+{bpsFor(l)} bps</strong> @ {levSliders[l.id]}{l.sl.unit}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 10, padding: "7px 11px", background: "rgba(184,132,140,0.07)", border: "1px solid rgba(184,132,140,0.2)", fontSize: 10, color: "#c8c1af", lineHeight: 1.6 }}>
                  Finance & Risk: combined impact may be 10–20% lower than sum due to lever interactions. Ask Co-pilot to reconcile before board.
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13, flexWrap: "wrap", gap: 6 }}>
              <div style={{ fontSize: 11, color: T.sub }}>13 plays — dial each lever · Select to build portfolio · <strong style={{ color: "#c8c1af" }}>✦ Bench</strong> for live agent reasoning</div>
              <div style={{ fontSize: 10, color: T.dim, background: T.s3, padding: "3px 9px", border: `1px solid ${T.brd}` }}>
                Σ current settings: {LEVERS.reduce((a, l) => a + bpsFor(l), 0)} bps
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(295px, 1fr))", gap: 11 }}>
              {LEVERS.map(l => {
                const v = levSliders[l.id];
                const b = bpsFor(l, v);
                const c = crFor(l, v);
                const isSel = !!selected[l.id];
                const isExp = !!expanded[l.id];
                return (
                  <div key={l.id} style={{ background: isSel ? "rgba(157,196,168,0.06)" : T.s3, border: `1px solid ${isSel ? "rgba(157,196,168,0.35)" : T.brd}`, padding: "13px 15px", display: "flex", flexDirection: "column", gap: 8, transition: "all .18s", position: "relative" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, width: 2, height: "100%", background: isSel ? T.grn : l.color, opacity: isSel ? .9 : .45 }} />

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 8, letterSpacing: ".14em", textTransform: "uppercase", color: l.color }}>{l.fn}</div>
                        <div style={{ fontSize: 13, fontFamily: "'Fraunces', Georgia, serif", color: T.tx, marginTop: 3, lineHeight: 1.35 }}>{l.title}</div>
                      </div>
                      <button onClick={() => toggleSel(l.id)}
                        style={{ fontSize: 9, padding: "3px 8px", border: `1px solid ${isSel ? "rgba(157,196,168,0.5)" : T.brd}`, background: isSel ? "rgba(157,196,168,0.14)" : "transparent", color: isSel ? T.grn : T.dim, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                        {isSel ? <CheckSquare size={9} /> : <Square size={9} />}
                        {isSel ? "Selected" : "Select"}
                      </button>
                    </div>

                    <div style={{ fontSize: 10, color: T.sub, lineHeight: 1.55 }}>{l.hyp}</div>

                    {/* Card slider */}
                    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.05)`, padding: "9px 11px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                        <span style={{ fontSize: 10, color: "#c8c1af" }}>{l.sl.lbl}</span>
                        <span>
                          <span style={{ fontSize: 17, fontFamily: "'Fraunces', Georgia, serif", color: l.color }}>{v}</span>
                          <span style={{ fontSize: 9, color: T.sub, marginLeft: 2 }}>{l.sl.unit}</span>
                        </span>
                      </div>
                      <input type="range" min={l.sl.min} max={l.sl.max} step={1} value={v}
                        onChange={e => onCardSlide(l.id, Number(e.target.value))} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: T.dim, marginTop: 3 }}>
                        <span>{l.sl.min}{l.sl.unit}</span>
                        <span style={{ color: T.sub }}>def: {l.sl.def}</span>
                        <span>{l.sl.max}{l.sl.unit}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 7, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <div>
                        <div style={{ fontSize: 19, fontFamily: "'Fraunces', Georgia, serif", color: T.grn }}>+{b} <span style={{ fontSize: 11 }}>bps</span></div>
                        <div style={{ fontSize: 9, color: T.dim }}>{fmtCr(c)}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                        <div style={{ textAlign: "right", fontSize: 10 }}>
                          <span style={{ color: confColor(l.conf) }}>{l.conf}</span>
                          <div style={{ fontSize: 8, color: T.dim }}>{l.eff}</div>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => toggleExp(l.id)}
                            style={{ fontSize: 9, padding: "3px 7px", border: `1px solid ${T.brd}`, background: "transparent", color: T.sub, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 2 }}>
                            {isExp ? <ChevronUp size={9} /> : <ChevronDown size={9} />} Deps
                          </button>
                          <button onClick={() => openModal(l.id)}
                            style={{ fontSize: 9, padding: "3px 9px", border: "1px solid rgba(212,165,116,0.35)", background: "rgba(212,165,116,0.08)", color: T.gld, cursor: "pointer", fontFamily: "inherit" }}>
                            ✦ Bench
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExp && (
                      <div style={{ borderTop: `1px solid rgba(255,255,255,0.05)`, paddingTop: 8 }}>
                        <div style={{ fontSize: 8, letterSpacing: ".13em", textTransform: "uppercase", color: T.dim, marginBottom: 5 }}>Dependencies</div>
                        <ul style={{ paddingLeft: 13, fontSize: 10, color: "#c8c1af", lineHeight: 1.9 }}>
                          {l.deps.map(d => <li key={d}>{d}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════ UPLOAD P&L ══════════════ */}
        {view === "up" && (
          <div className="fade" style={{ maxWidth: 680 }}>
            <div style={{ fontSize: 8, letterSpacing: ".2em", textTransform: "uppercase", color: T.sub, marginBottom: 14 }}>Upload Client P&L</div>
            <UploadPanel onUpload={handleUpload} uploadStatus={uploadStatus} />
            {pnl.isUploaded && (
              <div style={{ marginTop: 16, padding: "13px 16px", background: "rgba(157,196,168,0.06)", border: "1px solid rgba(157,196,168,0.28)" }}>
                <div style={{ fontSize: 10, color: T.grn, marginBottom: 8 }}>✓ P&L loaded — key figures parsed:</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  {[
                    { l: "Net Revenue",   v: fmtCr(pnl.rev.net) },
                    { l: "Total COGS",    v: fmtCr(pnl.cogs.total) },
                    { l: "Below-GM cost", v: fmtCr(Object.values(pnl.below).reduce((a, x) => a + x, 0)) },
                    { l: "Gross Margin",  v: fmtPct(base.gmP) },
                    { l: "EBITDA",        v: fmtPct(base.ebP) },
                    { l: "G→N Leakage",   v: fmtPct(base.leakagePct) },
                  ].map(s => (
                    <div key={s.l} style={{ background: T.s3, padding: "9px 12px" }}>
                      <div style={{ fontSize: 8, letterSpacing: ".13em", textTransform: "uppercase", color: T.sub, marginBottom: 3 }}>{s.l}</div>
                      <div style={{ fontSize: 15, fontFamily: "'Fraunces', Georgia, serif", color: T.tx }}>{s.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: T.sub, lineHeight: 1.65 }}>
                  Navigate to Command Centre to see the full waterfall, then Lever Library for the agent bench. The co-pilot is aware of your uploaded financials.
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══════════════ LEVER DEEP-DIVE MODAL ══════════════ */}
      {activeLever && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 40, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "22px 14px", overflowY: "auto" }}
          onClick={e => { if (e.target === e.currentTarget) { setActiveLever(null); setBR(false); } }}>
          <div style={{ background: T.bg2, border: `1px solid rgba(255,255,255,0.09)`, width: "100%", maxWidth: 740, flexShrink: 0 }}>
            {/* Header */}
            <div style={{ padding: "17px 21px 13px", borderBottom: `1px solid ${T.brd}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 8, letterSpacing: ".17em", textTransform: "uppercase", color: T.sub, marginBottom: 4 }}>{activeLever.fn.toUpperCase()} · OWNER: {activeLever.owner}</div>
                <div style={{ fontSize: 18, fontFamily: "'Fraunces', Georgia, serif", marginBottom: 5 }}>{activeLever.title}</div>
                <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.55 }}>{activeLever.hyp}</div>
              </div>
              <button onClick={() => { setActiveLever(null); setBR(false); }}
                style={{ background: "none", border: "none", color: T.sub, fontSize: 18, cursor: "pointer", flexShrink: 0, marginLeft: 10, padding: 0 }}>×</button>
            </div>

            {/* Modal slider */}
            <div style={{ padding: "15px 21px", borderBottom: `1px solid ${T.brd}`, background: "rgba(212,165,116,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                <span style={{ fontSize: 11, color: "#c8c1af" }}>{activeLever.sl.lbl}</span>
                <span>
                  <span style={{ fontSize: 26, fontFamily: "'Fraunces', Georgia, serif", color: T.gld, lineHeight: 1 }}>{modalV}</span>
                  <span style={{ fontSize: 11, color: T.sub, marginLeft: 3 }}>{activeLever.sl.unit}</span>
                </span>
              </div>
              <input type="range" min={activeLever.sl.min} max={activeLever.sl.max} step={1} value={modalV}
                onChange={e => onModalSlide(Number(e.target.value))} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.dim, marginTop: 4 }}>
                <span>{activeLever.sl.min}{activeLever.sl.unit}</span>
                <span style={{ color: T.sub }}>Default: {activeLever.sl.def}{activeLever.sl.unit}</span>
                <span>{activeLever.sl.max}{activeLever.sl.unit}</span>
              </div>
            </div>

            {/* Modal KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: `1px solid ${T.brd}` }}>
              {[
                { l: "EBITDA impact", v: `+${modalBps} bps`,  s: `+${modalBps} bps vs baseline`,     col: T.grn },
                { l: "₹ Value",       v: fmtCr(crFor(activeLever, modalV)), s: `at ${fmtCr(base.nr)} net rev`, col: T.grn },
                { l: "Confidence",    v: mConf,  s: mConfNote, col: T.gld },
                { l: "Effort",        v: mEff,   s: mEffNote,  col: "#c49d7e" },
              ].map(k => (
                <div key={k.l} style={{ padding: "13px 15px", borderRight: `1px solid ${T.brd}`, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: 2, height: "100%", background: k.col, opacity: .75 }} />
                  <div style={{ fontSize: 8, letterSpacing: ".16em", textTransform: "uppercase", color: T.sub, marginBottom: 5 }}>{k.l}</div>
                  <div style={{ fontSize: k.l === "EBITDA impact" || k.l === "₹ Value" ? 19 : 14, fontFamily: "'Fraunces', Georgia, serif", color: k.col, lineHeight: 1.1 }}>{k.v}</div>
                  <div style={{ fontSize: 9, color: T.sub, marginTop: 3 }}>{k.s}</div>
                </div>
              ))}
            </div>

            {/* Bench */}
            <div style={{ padding: "16px 21px" }}>
              <div style={{ fontSize: 8, letterSpacing: ".17em", textTransform: "uppercase", color: T.sub, marginBottom: 12 }}>Bench view — specialists reason at your chosen setting</div>
              <button onClick={runBench} disabled={benchRunning}
                style={{ width: "100%", padding: 10, background: "linear-gradient(135deg,rgba(212,165,116,0.18),rgba(184,132,140,0.12))", border: "1px solid rgba(212,165,116,0.4)", color: T.gld, fontSize: 11, fontFamily: "inherit", cursor: benchRunning ? "not-allowed" : "pointer", letterSpacing: ".07em", marginBottom: 13, opacity: benchRunning ? .5 : 1 }}>
                {benchRunning ? "Running bench analysis…" : `✦ Run bench at ${modalV} ${activeLever.sl.unit}`}
              </button>

              {(leverAnalysis[activeLever.id]?.voices || []).map((v, i) => (
                <AgentVoice key={i} agId={v.agId} content={v.content} setting={modalV} unit={activeLever.sl.unit} bps={modalBps} />
              ))}
              {leverAnalysis[activeLever.id]?.loading && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.sub, fontSize: 11, marginBottom: 10 }}>
                  <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> Next specialist reasoning…
                </div>
              )}
              {!leverAnalysis[activeLever.id] && (
                <div style={{ fontSize: 11, color: T.dim, fontStyle: "italic" }}>Hit "Run bench" to trigger specialist agents at your chosen setting.</div>
              )}

              <div style={{ marginTop: 14, padding: "10px 13px", background: "rgba(212,165,116,0.04)", border: "1px solid rgba(212,165,116,0.17)" }}>
                <div style={{ fontSize: 8, letterSpacing: ".14em", textTransform: "uppercase", color: T.gld, marginBottom: 6 }}>Dependencies & pre-requisites</div>
                <ul style={{ paddingLeft: 14, fontSize: 11, color: "#c8c1af", lineHeight: 1.9 }}>
                  {activeLever.deps.map(d => <li key={d}>{d}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ CFO CO-PILOT DRAWER ══════════════ */}
      {copOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50 }}
          onClick={e => { if (e.target === e.currentTarget) setCopOpen(false); }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 480, height: "100%", background: T.bg2, borderLeft: `1px solid ${T.brd}`, display: "flex", flexDirection: "column", animation: "slideIn .25s ease" }}>
            {/* Drawer header */}
            <div style={{ padding: "15px 19px", borderBottom: `1px solid ${T.brd}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 14, fontFamily: "'Fraunces', Georgia, serif" }}>CFO Co-pilot</div>
                <div style={{ fontSize: 8, color: T.sub, letterSpacing: ".14em", textTransform: "uppercase", marginTop: 2 }}>Orchestrating 7 specialist agents</div>
              </div>
              <button onClick={() => setCopOpen(false)} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", padding: 0 }}>
                <X size={16} />
              </button>
            </div>

            {/* Drawer body */}
            <div ref={chatBodyRef} style={{ flex: 1, overflowY: "auto", padding: "15px 19px" }}>
              {chatHistory.length === 0 && (
                <div>
                  <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.7, marginBottom: 12 }}>
                    Ask anything about margin, levers, or trade-offs. I'll route to the right specialists and return a reconciled CFO-grade answer.
                  </div>
                  <div style={{ fontSize: 8, letterSpacing: ".15em", textTransform: "uppercase", color: T.dim, marginBottom: 8 }}>Try asking</div>
                  {STARTERS.map(q => (
                    <button key={q} onClick={() => setChatInp(q)}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 4, background: "rgba(255,255,255,0.02)", border: `1px solid rgba(255,255,255,0.05)`, color: "#c8c1af", fontSize: 10, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.55 }}>
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {chatHistory.map((m, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 8, letterSpacing: ".18em", textTransform: "uppercase", color: m.role === "user" ? T.gld : T.grn, marginBottom: 4 }}>
                    {m.role === "user" ? "CFO" : "Co-pilot · synthesis"}
                  </div>
                  <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.72, whiteSpace: "pre-wrap" }}>{m.content}</div>
                  {/* Agent trace */}
                  {m.agents && (
                    <div style={{ marginTop: 8, padding: "8px 11px", background: "rgba(255,255,255,0.015)", borderLeft: `2px solid ${T.gld}` }}>
                      <div style={{ fontSize: 8, letterSpacing: ".14em", textTransform: "uppercase", color: T.gld, marginBottom: 5 }}>Agents involved</div>
                      {m.agents.map(agId => {
                        const a = AGENTS[agId]; const I = a.icon;
                        return (
                          <div key={agId} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 10, color: a.color }}>
                            <I size={10} color={a.color} /> {a.name}
                            <span style={{ fontSize: 7, color: T.dim, textTransform: "uppercase", letterSpacing: ".1em" }}>{a.role}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.sub, fontSize: 11 }}>
                  <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> Routing to specialists…
                </div>
              )}
            </div>

            {/* Drawer footer */}
            <div style={{ padding: "10px 13px", borderTop: `1px solid ${T.brd}`, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 7 }}>
                <input value={chatInput} onChange={e => setChatInp(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendChat()}
                  placeholder="Ask the bench…"
                  style={{ flex: 1, padding: "8px 10px", background: "rgba(255,255,255,0.02)", border: `1px solid rgba(255,255,255,0.07)`, color: T.tx, fontSize: 11, fontFamily: "inherit", outline: "none" }} />
                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                  style={{ padding: "8px 12px", background: "rgba(212,165,116,0.13)", border: "1px solid rgba(212,165,116,0.38)", color: T.gld, cursor: chatLoading ? "not-allowed" : "pointer", fontSize: 11, fontFamily: "inherit", opacity: (chatLoading || !chatInput.trim()) ? .5 : 1 }}>
                  Ask
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer style={{ textAlign: "center", padding: "30px 20px", fontSize: 8, letterSpacing: ".2em", color: "#2e2c27", textTransform: "uppercase" }}>
        MarginIQ · Multi-agent CFO Decision Bench · EY Advisory · {pnl.isUploaded ? "Live Client Data" : "Illustrative Synthetic Data"}
      </footer>
    </div>
  );
}
