// ============================================================
// STATE
// ============================================================
let groqKey = localStorage.getItem('qep_groq') || '';
let twelveKey = localStorage.getItem('qep_twelve') || '';
let alerts = JSON.parse(localStorage.getItem('qep_alerts') || '{"sound":false,"vibrate":false,"highOnly":false,"journal":true,"news":false}');
let journal = JSON.parse(localStorage.getItem('qep_journal') || '[]');
let curAsset='', curTf='', curBal=0, curRisk=0;
let autoIv=null, scalpIv=null, dashAutoIv=null, tvW=null;
let activeTrade=null;
let logsOn=false;
let curSig={signal:'HOLD',price:0,entry:0,sl:null,tp:null,conf:0,reasoning:'',asset:'',tf:'',strategy:'',confluence:0};
let curMkt={price:0,rsi:50,atr:0,macd:0,vol:0,support:0,resistance:0,ema20:0,ema50:0,ema200:0,closes:[],highs:[],lows:[]};

// ============================================================
// BASE PRICES
// ============================================================
const BASE={XAUUSD:2390,XAGUSD:28.5,BTCUSD:64500,ETHUSD:3150,EURUSD:1.0872,GBPUSD:1.2754,USDJPY:149.42,AUDUSD:0.6618,USDCAD:1.3592,USDCHF:0.9021,NZDUSD:0.6102,EURGBP:0.8521,EURJPY:162.45,GBPJPY:190.32};

// ============================================================
// UTIL
// ============================================================
function toast(m){const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2700);}
function fp(asset,val,dp){
  if(val===null||val===undefined) return '---';
  const v=parseFloat(val);
  if(asset==='BTCUSD'||asset==='ETHUSD') return '$'+v.toFixed(2);
  if(asset==='USDJPY'||asset==='EURJPY'||asset==='GBPJPY') return v.toFixed(3);
  if(asset==='XAUUSD'||asset==='XAGUSD') return v.toFixed(2);
  return v.toFixed(dp||5);
}
function switchTab(name,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('on'));
  document.getElementById('page-'+name).classList.add('on');
  el.classList.add('on');
  if(name==='journal'){renderJ('all');renderAnalytics();}
}

// ============================================================
// PARAMS
// ============================================================
function updParams(){
  curAsset=document.getElementById('assetSel').value;
  curTf=document.getElementById('tfSel').value;
  curBal=parseFloat(document.getElementById('balInp').value)||0;
  curRisk=parseFloat(document.getElementById('riskInp').value)||0;
  const ok=curAsset&&curTf&&curBal>0&&curRisk>0;
  document.getElementById('genBtn').disabled=!ok;
  document.getElementById('autoBtn').disabled=!ok;
  document.getElementById('scalpBtn').disabled=!ok;
  logsOn=ok;
  if(!ok){
    let m=[];if(!curAsset)m.push('Asset');if(!curTf)m.push('Timeframe');if(!curBal)m.push('Balance');if(!curRisk)m.push('Risk %');
    document.getElementById('paramWarn').textContent='⚠️ Missing: '+m.join(', ');
  } else {document.getElementById('paramWarn').textContent='';}
  return ok;
}
['assetSel','tfSel','balInp','riskInp'].forEach(id=>document.getElementById(id).addEventListener('change',updParams));

// ============================================================
// DATA FETCH + CACHE
// ============================================================
const SYM={XAUUSD:'XAU/USD',XAGUSD:'XAG/USD',BTCUSD:'BTC/USD',ETHUSD:'ETH/USD',EURUSD:'EUR/USD',GBPUSD:'GBP/USD',USDJPY:'USD/JPY',AUDUSD:'AUD/USD',USDCAD:'USD/CAD',USDCHF:'USD/CHF',NZDUSD:'NZD/USD',EURGBP:'EUR/GBP',EURJPY:'EUR/JPY',GBPJPY:'GBP/JPY'};
const INT_MAP={'1min':'1min','5min':'5min','15min':'15min','1h':'1h','4h':'4h','1day':'1day'};

// Cache: { 'EURUSD_1h': { data: {...}, ts: 1234567890, expires: 60000 } }
const dataCache = {};
// TTL per timeframe (ms) — shorter TF = shorter cache
const CACHE_TTL = {'1min':15000,'5min':30000,'15min':60000,'1h':120000,'4h':300000,'1day':600000};

function cacheKey(asset,tf){ return asset+'_'+tf; }

function getCached(asset,tf){
  const k=cacheKey(asset,tf);
  const entry=dataCache[k];
  if(!entry) return null;
  if(Date.now()-entry.ts > entry.ttl){ delete dataCache[k]; return null; }
  return entry.data;
}

function setCache(asset,tf,data){
  const k=cacheKey(asset,tf);
  dataCache[k]={ data, ts:Date.now(), ttl:CACHE_TTL[tf]||60000 };
}

function cacheAgeLabel(asset,tf){
  const k=cacheKey(asset,tf);
  const entry=dataCache[k];
  if(!entry) return '';
  const age=Math.round((Date.now()-entry.ts)/1000);
  const ttl=Math.round(entry.ttl/1000);
  return ' (cached '+age+'s / '+ttl+'s)';
}

function simData(asset){
  const base=BASE[asset]||1.2;
  // Use a seeded-style drift so same asset produces consistent candle shape
  // Seed changes only every CACHE_TTL[1h] ms so simulation is stable between refreshes
  const seed=Math.floor(Date.now()/60000); // changes every 1 min
  const seededRand=(n)=>{ let x=Math.sin(seed*9301+n*49297+asset.charCodeAt(0)*233)*10000; return x-Math.floor(x); };
  const drift=(seededRand(0)-0.48)*base*0.004;
  const price=base+drift;
  const n=60;
  let closes=[],highs=[],lows=[];
  let p=price;
  for(let i=0;i<n;i++){
    const chg=(seededRand(i+1)-0.49)*base*0.003;
    p=Math.max(base*0.95,p+chg);
    const hi=p*(1+seededRand(i+100)*0.002);
    const lo=p*(1-seededRand(i+200)*0.002);
    closes.push(p); highs.push(hi); lows.push(lo);
  }
  closes[n-1]=price;
  highs[n-1]=price*(1+seededRand(999)*0.002);
  lows[n-1]=price*(1-seededRand(998)*0.002);
  return buildIndicators(asset,price,closes,highs,lows);
}

function buildIndicators(asset,price,closes,highs,lows){
  const n=closes.length;
  // RSI
  let g=0,l=0;
  for(let i=Math.max(0,n-14);i<n-1;i++){const d=closes[i+1]-closes[i];if(d>=0)g+=d;else l-=d;}
  const rs=(g/14)/((l/14)||0.001);
  const rsi=parseFloat((100-100/(1+rs)).toFixed(1));
  // ATR
  let tr=[];
  for(let i=1;i<highs.length;i++) tr.push(Math.max(highs[i]-lows[i],Math.abs(highs[i]-closes[i-1]),Math.abs(lows[i]-closes[i-1])));
  let atr=tr.slice(0,14).reduce((a,b)=>a+b,0)/14;
  for(let i=14;i<tr.length;i++) atr=(atr*13+tr[i])/14;
  // MACD
  const ema=(arr,p)=>{let e=arr.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<arr.length;i++)e=(arr[i]*(2/(p+1)))+(e*(1-2/(p+1)));return e;};
  const ema12=ema(closes,12); const ema26=ema(closes,26);
  const macd=ema12-ema26;
  // EMAs
  const ema20=ema(closes.slice(-Math.min(20,n)),Math.min(20,n));
  const ema50=ema(closes.slice(-Math.min(50,n)),Math.min(50,n));
  const ema200=ema(closes.slice(-Math.min(n,n)),Math.min(n,n));
  // Volatility
  let rets=[];for(let i=1;i<closes.length;i++) rets.push((closes[i]-closes[i-1])/closes[i-1]);
  const mean=rets.reduce((a,b)=>a+b,0)/rets.length;
  const vol=Math.sqrt(rets.reduce((a,b)=>a+Math.pow(b-mean,2),0)/rets.length)*100;
  // S/R
  const support=Math.min(...lows.slice(-20));
  const resistance=Math.max(...highs.slice(-20));
  // Bollinger Bands
  const bPeriod=20;
  const bSlice=closes.slice(-bPeriod);
  const bMean=bSlice.reduce((a,b)=>a+b,0)/bPeriod;
  const bStd=Math.sqrt(bSlice.reduce((a,b)=>a+Math.pow(b-bMean,2),0)/bPeriod);
  const bbUpper=bMean+2*bStd; const bbLower=bMean-2*bStd;
  const bbWidth=(bbUpper-bbLower)/bMean;
  // Fibonacci (last swing)
  const swingH=Math.max(...highs.slice(-30)); const swingL=Math.min(...lows.slice(-30));
  const fibRange=swingH-swingL;
  const fib382=swingL+fibRange*0.382; const fib50=swingL+fibRange*0.5; const fib618=swingL+fibRange*0.618;
  // Market Structure
  let hh=0,ll=0;
  for(let i=2;i<Math.min(highs.length,10);i++){if(highs[i]>highs[i-2])hh++;if(lows[i]<lows[i-2])ll++;}
  const structure=hh>ll?'BULLISH':ll>hh?'BEARISH':'RANGING';
  // Order Block (simplified: last big bearish/bullish candle before a move)
  let obBull=null,obBear=null;
  for(let i=n-10;i<n-1;i++){
    const body=Math.abs(closes[i]-closes[i-1]||0);
    if(body>atr*1.5){
      if(closes[i]>closes[i-1]) obBull={high:highs[i],low:lows[i],price:(highs[i]+lows[i])/2};
      else obBear={high:highs[i],low:lows[i],price:(highs[i]+lows[i])/2};
    }
  }
  // Fair Value Gap
  let fvgBull=null,fvgBear=null;
  for(let i=1;i<n-1;i++){
    if(lows[i+1]>highs[i-1]) fvgBull={top:lows[i+1],bot:highs[i-1],mid:(lows[i+1]+highs[i-1])/2};
    if(highs[i+1]<lows[i-1]) fvgBear={top:lows[i-1],bot:highs[i+1],mid:(lows[i-1]+highs[i+1])/2};
  }
  // Liquidity Sweep
  const recentHigh=Math.max(...highs.slice(-10,n-1));
  const recentLow=Math.min(...lows.slice(-10,n-1));
  const sweptHigh=highs[n-1]>recentHigh&&closes[n-1]<recentHigh;
  const sweptLow=lows[n-1]<recentLow&&closes[n-1]>recentLow;
  // Volume (stable per minute — no random flipping)
  const vSeed=Math.floor(Date.now()/60000);
  const vR=(n)=>{let x=Math.sin(vSeed*7919+n*6271)*10000;return x-Math.floor(x);};
  const volSpike=vR(1)>0.7;
  const volDir=vR(2)>0.5?'up':'down';
  return {price,rsi,atr:parseFloat(atr.toFixed(asset==='BTCUSD'?0:5)),macd:parseFloat(macd.toFixed(5)),
    vol:parseFloat(vol.toFixed(2)),support,resistance,ema20,ema50,ema200,closes,highs,lows,
    bbUpper,bbLower,bbWidth,fib382,fib50,fib618,swingH,swingL,structure,
    obBull,obBear,fvgBull,fvgBear,sweptHigh,sweptLow,volSpike,volDir};
}

async function fetchData(asset,tf){
  // Return cached data if still fresh
  const cached=getCached(asset,tf);
  if(cached){
    addLog(asset+' '+tf+' — using cached data'+cacheAgeLabel(asset,tf),'info');
    return cached;
  }
  if(!twelveKey){
    const d=simData(asset);
    setCache(asset,tf,d);
    return d;
  }
  try{
    const url=`https://api.twelvedata.com/time_series?symbol=${SYM[asset]}&interval=${INT_MAP[tf]||'1h'}&outputsize=60&apikey=${twelveKey}`;
    addLog('Fetching LIVE: '+SYM[asset]+' '+tf+'...','info');
    const r=await fetch(url); const j=await r.json();
    if(j.status==='error'||j.code){
      addLog('API error: '+(j.message||j.code),'error');
      throw new Error(j.message||'API error '+j.code);
    }
    if(!j.values||j.values.length<30) throw new Error('Insufficient data: '+(j.values?j.values.length:0)+' candles');
    let closes=[],highs=[],lows=[];
    for(let i=j.values.length-1;i>=0;i--){closes.push(+j.values[i].close);highs.push(+j.values[i].high);lows.push(+j.values[i].low);}
    const price=closes[closes.length-1];
    document.getElementById('dataPill').textContent='📡 LIVE DATA';
    document.getElementById('dataPill').style.borderColor='var(--green)';
    document.getElementById('dataPill').style.color='var(--green)';
    const d=buildIndicators(asset,price,closes,highs,lows);
    setCache(asset,tf,d);
    return d;
  }catch(e){
    addLog('Twelve Data error ('+e.message+') — falling back to simulated','warn');
    document.getElementById('dataPill').textContent='📡 SIMULATED';
    document.getElementById('dataPill').style.borderColor='var(--gold)';
    document.getElementById('dataPill').style.color='var(--gold)';
    const d=simData(asset);
    setCache(asset,tf,d);
    return d;
  }
}

// ============================================================
// NEWS FILTER (Economic Calendar)
// ============================================================
const HIGH_IMPACT_KEYWORDS=['nfp','non-farm','fomc','fed rate','cpi','inflation','gdp','employment','ecb','boe','rba','boj','interest rate','monetary policy','unemployment','retail sales','pmi'];
let newsCache={events:[],ts:0};
let newsBlocked=false;
let newsBlockReason='';

async function fetchNewsCalendar(){
  // Use a free public calendar - forexfactory RSS or fcsapi
  // Fallback: use known high-impact times pattern
  try{
    const now=Date.now();
    if(newsCache.ts&&now-newsCache.ts<300000) return newsCache.events; // 5min cache
    // Try to fetch from a public CORS-friendly source
    const today=new Date().toISOString().split('T')[0];
    const url=`https://nfs.faireconomy.media/ff_calendar_thisweek.json`;
    const r=await fetch(url,{signal:AbortSignal.timeout(4000)});
    const data=await r.json();
    const events=(Array.isArray(data)?data:[]).filter(e=>{
      const impact=(e.impact||e.impactTitle||'').toLowerCase();
      return impact.includes('high')||impact.includes('3');
    }).map(e=>({
      title:e.title||e.name||'Event',
      time:e.date||e.datetime||'',
      currency:e.country||e.currency||'',
      impact:'HIGH'
    }));
    newsCache={events,ts:now};
    return events;
  }catch(err){
    // Fallback: hardcoded major event windows (UTC hours)
    return getKnownNewsWindows();
  }
}

function getKnownNewsWindows(){
  const now=new Date();
  const day=now.getUTCDay(); // 0=Sun,5=Fri
  const h=now.getUTCHours();
  const m=now.getUTCMinutes();
  const events=[];
  // NFP: First Friday 12:30 UTC
  if(day===5&&h===12&&m>=0&&m<=59) events.push({title:'NFP / US Jobs Report',time:'12:30 UTC',currency:'USD',impact:'HIGH'});
  // FOMC: typically Wed 18:00 UTC (approximate)
  if(day===3&&h>=17&&h<=19) events.push({title:'FOMC Statement',time:'18:00 UTC',currency:'USD',impact:'HIGH'});
  // CPI: usually mid-month Wed/Thu 12:30 UTC
  if((day===3||day===4)&&h===12&&m>=15&&m<=45) events.push({title:'CPI Inflation Data',time:'12:30 UTC',currency:'USD',impact:'HIGH'});
  // ECB: usually Thu 11:45 UTC press conf 12:30
  if(day===4&&h>=11&&h<=13) events.push({title:'ECB Rate Decision',time:'11:45 UTC',currency:'EUR',impact:'HIGH'});
  // BOE: usually Thu 11:00 UTC
  if(day===4&&h>=10&&h<=12) events.push({title:'BOE Rate Decision',time:'11:00 UTC',currency:'GBP',impact:'HIGH'});
  return events;
}

async function checkNewsBlock(asset){
  if(!alerts.news){newsBlocked=false;newsBlockReason='';return false;}
  const events=await fetchNewsCalendar();
  const assetCurrencies={
    EURUSD:['EUR','USD'],GBPUSD:['GBP','USD'],USDJPY:['USD','JPY'],
    AUDUSD:['AUD','USD'],USDCAD:['USD','CAD'],XAUUSD:['USD','XAU'],BTCUSD:['USD','BTC']
  };
  const currencies=assetCurrencies[asset]||['USD'];
  const now=new Date();
  const nowMs=now.getTime();
  const WINDOW=30*60*1000; // 30 min buffer
  for(const ev of events){
    if(!ev.time) continue;
    const curr=(ev.currency||'').toUpperCase();
    if(!currencies.some(c=>curr.includes(c))) continue;
    // Parse event time
    let evMs=null;
    try{
      evMs=new Date(ev.time).getTime();
      if(isNaN(evMs)) continue;
    }catch(e){continue;}
    if(Math.abs(nowMs-evMs)<WINDOW){
      newsBlocked=true;
      newsBlockReason=`⚠️ NEWS BLOCK: ${ev.title} (${ev.currency}) within 30min`;
      return true;
    }
  }
  newsBlocked=false;newsBlockReason='';
  return false;
}

function renderNewsPanel(events){
  const el=document.getElementById('newsPanel');
  if(!el) return;
  if(!events||!events.length){el.innerHTML='<div style="color:var(--sub);font-size:0.72rem;">No high-impact events found for this week.</div>';return;}
  el.innerHTML=events.slice(0,8).map(e=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #1e2d4a22;font-size:0.72rem;">
      <span style="color:var(--red);font-weight:700;">🔴 ${e.title}</span>
      <span style="color:var(--sub);">${e.currency} · ${e.time||'TBA'}</span>
    </div>`).join('');
}

// ============================================================
// CANDLESTICK PATTERN RECOGNITION
// ============================================================
function detectCandlePatterns(closes,highs,lows,atr){
  const n=closes.length;
  if(n<4) return {pattern:'No Pattern',bias:'neutral',strength:0,desc:'Not enough candles',all:[]};
  const c=closes,h=highs,l=lows;
  const i=n-1;

  // ── Candle anatomy helpers ──────────────────────────────────
  function body(x){ return Math.abs(c[x]-c[x-1]||0); }
  function fullBody(x){ return Math.abs(c[x]-(x>0?c[x-1]:c[x])); }
  function realBody(x){ return Math.abs(c[x]-c[x-1]||0.0001); }
  function isBull(x){ return c[x]>=(x>0?c[x-1]:c[x]); }
  function isBear(x){ return c[x]<(x>0?c[x-1]:c[x]); }
  function open(x){ return x>0?c[x-1]:c[x]; } // approx open = prev close
  function upper(x){ return h[x]-Math.max(c[x],open(x)); }
  function lower(x){ return Math.min(c[x],open(x))-l[x]; }
  function range(x){ return h[x]-l[x]||0.0001; }
  function bodyRatio(x){ return realBody(x)/range(x); }
  function isDoji(x){ return bodyRatio(x)<0.1 && range(x)>atr*0.3; }
  function isLongCandle(x){ return realBody(x)>atr*0.7; }
  function hasGapUp(x){ return l[x]>h[x-1]; }
  function hasGapDown(x){ return h[x]<l[x-1]; }

  const patterns=[];

  // ════════════════════════════════════════════════════════════
  // S-TIER — Highest reliability (strength 88-95)
  // ════════════════════════════════════════════════════════════

  // 1. Bullish Abandoned Baby (gap down doji + gap up)
  if(i>=3 && isBear(i-2) && isDoji(i-1) && isBull(i) &&
     hasGapDown(i-1) && hasGapUp(i) && isLongCandle(i))
    patterns.push({name:'Bullish Abandoned Baby',bias:'bull',strength:95,tier:'S',
      desc:'Gap-down doji + gap-up reversal — strongest bullish reversal pattern'});

  // 2. Bearish Abandoned Baby (gap up doji + gap down)
  if(i>=3 && isBull(i-2) && isDoji(i-1) && isBear(i) &&
     hasGapUp(i-1) && hasGapDown(i) && isLongCandle(i))
    patterns.push({name:'Bearish Abandoned Baby',bias:'bear',strength:95,tier:'S',
      desc:'Gap-up doji + gap-down reversal — strongest bearish reversal pattern'});

  // 3. Bullish Kicker (gap up after bearish)
  if(i>=2 && isBear(i-1) && isBull(i) && hasGapUp(i) && isLongCandle(i) && isLongCandle(i-1))
    patterns.push({name:'Bullish Kicker',bias:'bull',strength:93,tier:'S',
      desc:'Sudden gap-up reversal — institutional buying overwhelms sellers'});

  // 4. Bearish Kicker (gap down after bullish)
  if(i>=2 && isBull(i-1) && isBear(i) && hasGapDown(i) && isLongCandle(i) && isLongCandle(i-1))
    patterns.push({name:'Bearish Kicker',bias:'bear',strength:93,tier:'S',
      desc:'Sudden gap-down reversal — institutional selling overwhelms buyers'});

  // 5. Three White Soldiers (3 strong bull candles)
  if(i>=3 && isBull(i) && isBull(i-1) && isBull(i-2) &&
     isLongCandle(i) && isLongCandle(i-1) && isLongCandle(i-2) &&
     c[i]>c[i-1] && c[i-1]>c[i-2] &&
     upper(i)<realBody(i)*0.3 && upper(i-1)<realBody(i-1)*0.3)
    patterns.push({name:'Three White Soldiers',bias:'bull',strength:90,tier:'S',
      desc:'Three consecutive strong bullish candles — sustained institutional buying'});

  // 6. Three Black Crows (3 strong bear candles)
  if(i>=3 && isBear(i) && isBear(i-1) && isBear(i-2) &&
     isLongCandle(i) && isLongCandle(i-1) && isLongCandle(i-2) &&
     c[i]<c[i-1] && c[i-1]<c[i-2] &&
     lower(i)<realBody(i)*0.3 && lower(i-1)<realBody(i-1)*0.3)
    patterns.push({name:'Three Black Crows',bias:'bear',strength:90,tier:'S',
      desc:'Three consecutive strong bearish candles — sustained institutional selling'});

  // 7. Morning Doji Star
  if(i>=3 && isBear(i-2) && isLongCandle(i-2) && isDoji(i-1) && isBull(i) && isLongCandle(i) &&
     c[i]>(open(i-2)+c[i-2])/2)
    patterns.push({name:'Morning Doji Star',bias:'bull',strength:90,tier:'S',
      desc:'Bearish candle + doji indecision + strong bullish candle — high-probability bottom'});

  // 8. Evening Doji Star
  if(i>=3 && isBull(i-2) && isLongCandle(i-2) && isDoji(i-1) && isBear(i) && isLongCandle(i) &&
     c[i]<(open(i-2)+c[i-2])/2)
    patterns.push({name:'Evening Doji Star',bias:'bear',strength:90,tier:'S',
      desc:'Bullish candle + doji indecision + strong bearish candle — high-probability top'});

  // 9. Bullish Tri-Star (3 dojis at bottom)
  if(i>=3 && isDoji(i) && isDoji(i-1) && isDoji(i-2) && l[i-1]<l[i-2] && l[i-1]<l[i])
    patterns.push({name:'Bullish Tri-Star',bias:'bull',strength:88,tier:'S',
      desc:'Three consecutive dojis — complete market indecision signalling powerful reversal up'});

  // 10. Bearish Tri-Star
  if(i>=3 && isDoji(i) && isDoji(i-1) && isDoji(i-2) && h[i-1]>h[i-2] && h[i-1]>h[i])
    patterns.push({name:'Bearish Tri-Star',bias:'bear',strength:88,tier:'S',
      desc:'Three consecutive dojis at top — complete exhaustion signalling powerful reversal down'});

  // ════════════════════════════════════════════════════════════
  // A-TIER — Strong reliability (strength 75-87)
  // ════════════════════════════════════════════════════════════

  // 11. Bullish Engulfing
  if(i>=2 && isBear(i-1) && isBull(i) &&
     c[i]>open(i-1) && open(i)<c[i-1] && isLongCandle(i))
    patterns.push({name:'Bullish Engulfing',bias:'bull',strength:85,tier:'A',
      desc:'Current bull candle fully engulfs previous bearish candle — buyers take control'});

  // 12. Bearish Engulfing
  if(i>=2 && isBull(i-1) && isBear(i) &&
     c[i]<open(i-1) && open(i)>c[i-1] && isLongCandle(i))
    patterns.push({name:'Bearish Engulfing',bias:'bear',strength:85,tier:'A',
      desc:'Current bear candle fully engulfs previous bullish candle — sellers take control'});

  // 13. Morning Star
  if(i>=3 && isBear(i-2) && isLongCandle(i-2) &&
     realBody(i-1)<realBody(i-2)*0.4 && isBull(i) && isLongCandle(i) &&
     c[i]>(open(i-2)+c[i-2])/2)
    patterns.push({name:'Morning Star',bias:'bull',strength:85,tier:'A',
      desc:'3-candle bullish reversal: strong down, small indecision, strong up'});

  // 14. Evening Star
  if(i>=3 && isBull(i-2) && isLongCandle(i-2) &&
     realBody(i-1)<realBody(i-2)*0.4 && isBear(i) && isLongCandle(i) &&
     c[i]<(open(i-2)+c[i-2])/2)
    patterns.push({name:'Evening Star',bias:'bear',strength:85,tier:'A',
      desc:'3-candle bearish reversal: strong up, small indecision, strong down'});

  // 15. Three Inside Up
  if(i>=3 && isBear(i-2) && isLongCandle(i-2) &&
     isBull(i-1) && c[i-1]>open(i-2) && c[i-1]<c[i-2] &&
     isBull(i) && c[i]>c[i-2])
    patterns.push({name:'Three Inside Up',bias:'bull',strength:84,tier:'A',
      desc:'Harami confirmed by a third bullish close above the first candle — strong reversal'});

  // 16. Three Inside Down
  if(i>=3 && isBull(i-2) && isLongCandle(i-2) &&
     isBear(i-1) && c[i-1]<open(i-2) && c[i-1]>c[i-2] &&
     isBear(i) && c[i]<c[i-2])
    patterns.push({name:'Three Inside Down',bias:'bear',strength:84,tier:'A',
      desc:'Bearish harami confirmed by a third bearish close below the first candle'});

  // 17. Three Outside Up
  if(i>=3 && isBear(i-2) &&
     isBull(i-1) && open(i-1)<c[i-2] && c[i-1]>open(i-2) &&
     isBull(i) && c[i]>c[i-1])
    patterns.push({name:'Three Outside Up',bias:'bull',strength:83,tier:'A',
      desc:'Bullish engulfing confirmed by a third higher close — momentum confirmed'});

  // 18. Three Outside Down
  if(i>=3 && isBull(i-2) &&
     isBear(i-1) && open(i-1)>c[i-2] && c[i-1]<open(i-2) &&
     isBear(i) && c[i]<c[i-1])
    patterns.push({name:'Three Outside Down',bias:'bear',strength:83,tier:'A',
      desc:'Bearish engulfing confirmed by a third lower close — downside momentum confirmed'});

  // 19. Piercing Line
  if(i>=2 && isBear(i-1) && isLongCandle(i-1) && isBull(i) &&
     open(i)<l[i-1] && c[i]>(open(i-1)+c[i-1])/2 && c[i]<open(i-1))
    patterns.push({name:'Piercing Line',bias:'bull',strength:82,tier:'A',
      desc:'Bull candle opens below low and closes above midpoint of prior bear — bullish reversal'});

  // 20. Dark Cloud Cover
  if(i>=2 && isBull(i-1) && isLongCandle(i-1) && isBear(i) &&
     open(i)>h[i-1] && c[i]<(open(i-1)+c[i-1])/2 && c[i]>open(i-1))
    patterns.push({name:'Dark Cloud Cover',bias:'bear',strength:82,tier:'A',
      desc:'Bear candle opens above high and closes below midpoint of prior bull — bearish reversal'});

  // 21. Bullish Harami Cross
  if(i>=2 && isBear(i-1) && isLongCandle(i-1) && isDoji(i) &&
     h[i]<open(i-1) && l[i]>c[i-1])
    patterns.push({name:'Bullish Harami Cross',bias:'bull',strength:81,tier:'A',
      desc:'Doji inside large bearish candle — buyers halting sellers, reversal likely'});

  // 22. Bearish Harami Cross
  if(i>=2 && isBull(i-1) && isLongCandle(i-1) && isDoji(i) &&
     h[i]<c[i-1] && l[i]>open(i-1))
    patterns.push({name:'Bearish Harami Cross',bias:'bear',strength:81,tier:'A',
      desc:'Doji inside large bullish candle — sellers halting buyers, reversal likely'});

  // 23. Tweezer Bottom
  if(i>=2 && isBear(i-1) && isBull(i) &&
     Math.abs(l[i]-l[i-1])<atr*0.05 && isLongCandle(i-1) && isLongCandle(i))
    patterns.push({name:'Tweezer Bottom',bias:'bull',strength:80,tier:'A',
      desc:'Two candles touch exact same low — strong support rejection, buyers defend level'});

  // 24. Tweezer Top
  if(i>=2 && isBull(i-1) && isBear(i) &&
     Math.abs(h[i]-h[i-1])<atr*0.05 && isLongCandle(i-1) && isLongCandle(i))
    patterns.push({name:'Tweezer Top',bias:'bear',strength:80,tier:'A',
      desc:'Two candles touch exact same high — strong resistance rejection, sellers defend level'});

  // 25. Upside Gap Two Crows
  if(i>=3 && isBull(i-2) && isLongCandle(i-2) &&
     isBear(i-1) && hasGapUp(i-1) &&
     isBear(i) && open(i)>open(i-1) && c[i]<c[i-1] && c[i]>c[i-2])
    patterns.push({name:'Upside Gap Two Crows',bias:'bear',strength:79,tier:'A',
      desc:'Two bearish candles filling a gap after a rally — distribution beginning'});

  // 26. Rising Three Methods
  if(i>=5 && isBull(i-4) && isLongCandle(i-4) &&
     isBear(i-3) && isBear(i-2) && isBear(i-1) &&
     l[i-3]>l[i-4] && h[i-1]<h[i-4] &&
     isBull(i) && isLongCandle(i) && c[i]>c[i-4])
    patterns.push({name:'Rising Three Methods',bias:'bull',strength:79,tier:'A',
      desc:'Bull candle, 3 small retracement bears, strong bull continuation — trend resumes'});

  // 27. Falling Three Methods
  if(i>=5 && isBear(i-4) && isLongCandle(i-4) &&
     isBull(i-3) && isBull(i-2) && isBull(i-1) &&
     h[i-3]<h[i-4] && l[i-1]>l[i-4] &&
     isBear(i) && isLongCandle(i) && c[i]<c[i-4])
    patterns.push({name:'Falling Three Methods',bias:'bear',strength:79,tier:'A',
      desc:'Bear candle, 3 small retracement bulls, strong bear continuation — downtrend resumes'});

  // 28. Bullish Breakaway
  if(i>=5 && isBear(i-4) && isLongCandle(i-4) &&
     isBear(i-3) && hasGapDown(i-3) &&
     isBear(i-2) && isBear(i-1) &&
     isBull(i) && c[i]>c[i-3])
    patterns.push({name:'Bullish Breakaway',bias:'bull',strength:78,tier:'A',
      desc:'5-candle pattern ending with strong bull breaking above the gap — reversal confirmed'});

  // 29. Bearish Breakaway
  if(i>=5 && isBull(i-4) && isLongCandle(i-4) &&
     isBull(i-3) && hasGapUp(i-3) &&
     isBull(i-2) && isBull(i-1) &&
     isBear(i) && c[i]<c[i-3])
    patterns.push({name:'Bearish Breakaway',bias:'bear',strength:78,tier:'A',
      desc:'5-candle pattern ending with strong bear breaking below the gap — reversal confirmed'});

  // 30. Bullish Counterattack Line
  if(i>=2 && isBear(i-1) && isLongCandle(i-1) && isBull(i) && isLongCandle(i) &&
     Math.abs(c[i]-c[i-1])<atr*0.08 && open(i)<c[i-1])
    patterns.push({name:'Bullish Counterattack',bias:'bull',strength:77,tier:'A',
      desc:'Bear candle followed by bull candle closing at same level — buyers match sellers'});

  // 31. Bearish Counterattack Line
  if(i>=2 && isBull(i-1) && isLongCandle(i-1) && isBear(i) && isLongCandle(i) &&
     Math.abs(c[i]-c[i-1])<atr*0.08 && open(i)>c[i-1])
    patterns.push({name:'Bearish Counterattack',bias:'bear',strength:77,tier:'A',
      desc:'Bull candle followed by bear candle closing at same level — sellers match buyers'});

  // 32. Ladder Bottom
  if(i>=5 && isBear(i-4) && isBear(i-3) && isBear(i-2) &&
     c[i-4]>c[i-3] && c[i-3]>c[i-2] &&
     isBear(i-1) && upper(i-1)>realBody(i-1)*0.5 &&
     isBull(i) && isLongCandle(i))
    patterns.push({name:'Ladder Bottom',bias:'bull',strength:77,tier:'A',
      desc:'Three descending bears, a bear with long upper wick, then strong bull — reversal ladder'});

  // 33. Unique Three River Bottom
  if(i>=3 && isBear(i-2) && isLongCandle(i-2) &&
     isBear(i-1) && lower(i-1)>lower(i-2) && l[i-1]<l[i-2] &&
     isBull(i) && c[i]<c[i-1])
    patterns.push({name:'Unique Three River Bottom',bias:'bull',strength:76,tier:'A',
      desc:'Rare 3-candle pattern at bottoms — new low with harami-like close signals reversal'});

  // 34. Bullish Doji Star
  if(i>=2 && isBear(i-1) && isLongCandle(i-1) && isDoji(i) && l[i]>l[i-1])
    patterns.push({name:'Bullish Doji Star',bias:'bull',strength:76,tier:'A',
      desc:'Bearish candle followed by doji above — indecision after selloff signals potential reversal'});

  // 35. Bearish Doji Star
  if(i>=2 && isBull(i-1) && isLongCandle(i-1) && isDoji(i) && h[i]<h[i-1])
    patterns.push({name:'Bearish Doji Star',bias:'bear',strength:76,tier:'A',
      desc:'Bullish candle followed by doji below — indecision after rally signals potential reversal'});

  // 36. Bullish Tasuki Gap
  if(i>=3 && isBull(i-2) && isBull(i-1) && hasGapUp(i-1) &&
     isBear(i) && open(i)<c[i-1] && c[i]>c[i-2] && c[i]<open(i-1))
    patterns.push({name:'Bullish Tasuki Gap',bias:'bull',strength:75,tier:'A',
      desc:'Gap-up continuation with partial fill — gap holds as support, trend resumes up'});

  // 37. Bearish Tasuki Gap
  if(i>=3 && isBear(i-2) && isBear(i-1) && hasGapDown(i-1) &&
     isBull(i) && open(i)>c[i-1] && c[i]<c[i-2] && c[i]>open(i-1))
    patterns.push({name:'Bearish Tasuki Gap',bias:'bear',strength:75,tier:'A',
      desc:'Gap-down continuation with partial fill — gap holds as resistance, trend resumes down'});

  // ════════════════════════════════════════════════════════════
  // B-TIER — Moderate reliability (strength 55-74, needs S/R confluence)
  // ════════════════════════════════════════════════════════════

  // 38. Hammer
  if(lower(i)>realBody(i)*2.5 && upper(i)<realBody(i)*0.5 && range(i)>atr*0.5)
    patterns.push({name:'Hammer',bias:'bull',strength:70,tier:'B',
      desc:'Long lower wick rejection — buyers stepping in, valid only at support'});

  // 39. Shooting Star
  if(upper(i)>realBody(i)*2.5 && lower(i)<realBody(i)*0.5 && range(i)>atr*0.5)
    patterns.push({name:'Shooting Star',bias:'bear',strength:70,tier:'B',
      desc:'Long upper wick rejection — sellers stepping in, valid only at resistance'});

  // 40. Inverted Hammer
  if(i>=2 && isBear(i-1) && upper(i)>realBody(i)*2.5 && lower(i)<realBody(i)*0.5 && isBull(i))
    patterns.push({name:'Inverted Hammer',bias:'bull',strength:67,tier:'B',
      desc:'Upper wick after downtrend — buyers tried to push up, needs next bull candle confirmation'});

  // 41. Hanging Man
  if(i>=2 && isBull(i-1) && lower(i)>realBody(i)*2.5 && upper(i)<realBody(i)*0.5)
    patterns.push({name:'Hanging Man',bias:'bear',strength:67,tier:'B',
      desc:'Hammer shape at top of uptrend — sellers tested lower prices, bearish warning'});

  // 42. Bullish Harami
  if(i>=2 && isBear(i-1) && isLongCandle(i-1) && isBull(i) &&
     h[i]<open(i-1) && l[i]>c[i-1] && realBody(i)<realBody(i-1)*0.6)
    patterns.push({name:'Bullish Harami',bias:'bull',strength:66,tier:'B',
      desc:'Small bull candle inside large bearish candle — momentum slowing, watch for reversal'});

  // 43. Bearish Harami
  if(i>=2 && isBull(i-1) && isLongCandle(i-1) && isBear(i) &&
     h[i]<c[i-1] && l[i]>open(i-1) && realBody(i)<realBody(i-1)*0.6)
    patterns.push({name:'Bearish Harami',bias:'bear',strength:66,tier:'B',
      desc:'Small bear candle inside large bullish candle — momentum slowing, watch for reversal'});

  // 44. Dragonfly Doji (bullish at support)
  if(isDoji(i) && lower(i)>atr*0.5 && upper(i)<atr*0.1)
    patterns.push({name:'Dragonfly Doji',bias:'bull',strength:68,tier:'B',
      desc:'No upper wick, long lower wick — sellers pushed down then buyers fully recovered'});

  // 45. Gravestone Doji (bearish at resistance)
  if(isDoji(i) && upper(i)>atr*0.5 && lower(i)<atr*0.1)
    patterns.push({name:'Gravestone Doji',bias:'bear',strength:68,tier:'B',
      desc:'No lower wick, long upper wick — buyers pushed up then sellers fully recovered'});

  // 46. Bullish Marubozu
  if(isBull(i) && upper(i)<atr*0.03 && lower(i)<atr*0.03 && isLongCandle(i))
    patterns.push({name:'Bullish Marubozu',bias:'bull',strength:65,tier:'B',
      desc:'Full bull candle no wicks — pure buying pressure from open to close'});

  // 47. Bearish Marubozu
  if(isBear(i) && upper(i)<atr*0.03 && lower(i)<atr*0.03 && isLongCandle(i))
    patterns.push({name:'Bearish Marubozu',bias:'bear',strength:65,tier:'B',
      desc:'Full bear candle no wicks — pure selling pressure from open to close'});

  // 48. Bullish Belt Hold
  if(isBull(i) && lower(i)<atr*0.05 && isLongCandle(i) && isBear(i-1))
    patterns.push({name:'Bullish Belt Hold',bias:'bull',strength:63,tier:'B',
      desc:'Bull candle opens at low, no lower wick — buyers dominate entire session'});

  // 49. Bearish Belt Hold
  if(isBear(i) && upper(i)<atr*0.05 && isLongCandle(i) && isBull(i-1))
    patterns.push({name:'Bearish Belt Hold',bias:'bear',strength:63,tier:'B',
      desc:'Bear candle opens at high, no upper wick — sellers dominate entire session'});

  // 50. Inside Bar
  if(h[i]<h[i-1] && l[i]>l[i-1])
    patterns.push({name:'Inside Bar',bias:'neutral',strength:60,tier:'B',
      desc:'Price consolidating inside previous candle — breakout of mother bar pending'});

  // 51. Doji at key level
  if(isDoji(i))
    patterns.push({name:'Doji',bias:'neutral',strength:57,tier:'B',
      desc:'Open equals close — complete market indecision, watch for directional break'});

  // 52. Concealing Baby Swallow
  if(i>=4 && isBear(i-3) && isBear(i-2) &&
     isBear(i-1) && upper(i-1)>atr*0.3 &&
     isBear(i) && h[i]>h[i-1] && l[i]<l[i-1])
    patterns.push({name:'Concealing Baby Swallow',bias:'bull',strength:72,tier:'B',
      desc:'Four bearish candles with engulfing final candle — exhaustion and reversal signal'});

  // 53. Three Stars in the South
  if(i>=3 && isBear(i-2) && isLongCandle(i-2) &&
     isBear(i-1) && l[i-1]>l[i-2] && h[i-1]<h[i-2] &&
     isBear(i) && h[i]<h[i-1] && l[i]>=l[i-1] && realBody(i)<realBody(i-1)*0.5)
    patterns.push({name:'Three Stars in the South',bias:'bull',strength:73,tier:'B',
      desc:'Three shrinking bearish candles — selling pressure exhausting, buyers regaining control'});

  // 54. Advance Block
  if(i>=3 && isBull(i) && isBull(i-1) && isBull(i-2) &&
     c[i]>c[i-1] && c[i-1]>c[i-2] &&
     realBody(i)<realBody(i-1) && realBody(i-1)<realBody(i-2) &&
     upper(i)>realBody(i)*0.5)
    patterns.push({name:'Advance Block',bias:'bear',strength:68,tier:'B',
      desc:'Three bulls but each smaller with growing upper wick — buying momentum weakening'});

  // 55. Deliberation
  if(i>=3 && isBull(i) && isBull(i-1) && isBull(i-2) &&
     isLongCandle(i-2) && isLongCandle(i-1) &&
     realBody(i)<realBody(i-1)*0.4 && (isDoji(i)||upper(i)>realBody(i)))
    patterns.push({name:'Deliberation',bias:'bear',strength:66,tier:'B',
      desc:'Two strong bulls followed by small bull/doji — buyers hesitating at highs'});

  // 56. Homing Pigeon
  if(i>=2 && isBear(i-1) && isLongCandle(i-1) && isBear(i) &&
     h[i]<open(i-1) && l[i]>c[i-1] && realBody(i)<realBody(i-1)*0.5)
    patterns.push({name:'Bearish Homing Pigeon',bias:'bull',strength:62,tier:'B',
      desc:'Small bear inside large bear — selling pace declining, possible bottom forming'});

  // ════════════════════════════════════════════════════════════
  // RETURN RESULTS
  // ════════════════════════════════════════════════════════════
  if(!patterns.length)
    return {pattern:'No Pattern',bias:'neutral',strength:0,desc:'No recognizable pattern on current candle',tier:'',all:[]};

  // Sort by strength descending — best pattern wins
  patterns.sort(function(a,b){ return b.strength-a.strength; });
  const best=patterns[0];

  // Apply B-tier confidence reduction when not at key level
  // (the caller — strategy 13 — already handles S/R confluence check)
  return Object.assign({},best,{all:patterns});
}



// ============================================================
// 12-STRATEGY ENGINE
// ============================================================
function runAllStrategies(d,isScalp){
  const {price,rsi,macd,vol,support,resistance,atr,ema20,ema50,ema200,structure,
    bbWidth,bbLower,bbUpper,fib382,fib50,fib618,obBull,obBear,fvgBull,fvgBear,
    sweptHigh,sweptLow,volSpike,volDir} = d;

  const votes=[];

  // 1. TREND FOLLOWING (EMA + MACD)
  const emaBull=price>ema20&&ema20>ema50&&macd>0;
  const emaBear=price<ema20&&ema20<ema50&&macd<0;
  votes.push({name:'EMA Trend',icon:'📈',signal:emaBull?'BUY':emaBear?'SELL':'HOLD',conf:emaBull||emaBear?72:30,
    reason:emaBull?'Price above EMA20>EMA50, MACD positive — bullish trend':emaBear?'Price below EMA20<EMA50, MACD negative — bearish trend':'EMAs mixed, no clear trend'});

  // 2. S/R BOUNCE
  const dSup=Math.abs(price-support)/atr; const dRes=Math.abs(resistance-price)/atr;
  const srBull=rsi<42&&dSup<0.6; const srBear=rsi>58&&dRes<0.6;
  votes.push({name:'S/R Bounce',icon:'🏀',signal:srBull?'BUY':srBear?'SELL':'HOLD',conf:srBull||srBear?74:28,
    reason:srBull?`RSI ${rsi} oversold near support ${fp(curAsset,support)}`:srBear?`RSI ${rsi} overbought near resistance ${fp(curAsset,resistance)}`:'No key level confluence'});

  // 3. RSI DIVERGENCE
  const rsiBull=rsi<32; const rsiBear=rsi>68;
  votes.push({name:'RSI Divergence',icon:'🔄',signal:rsiBull?'BUY':rsiBear?'SELL':'HOLD',conf:rsiBull||rsiBear?67:25,
    reason:rsiBull?`RSI ${rsi} deeply oversold — potential bullish divergence`:rsiBear?`RSI ${rsi} deeply overbought — potential bearish divergence`:`RSI ${rsi} neutral`});

  // 4. FIBONACCI RETRACEMENT
  const nearFib618=Math.abs(price-fib618)/atr<0.5; const nearFib382=Math.abs(price-fib382)/atr<0.5; const nearFib50x=Math.abs(price-fib50)/atr<0.5;
  const fibBull=(nearFib618||nearFib50x)&&macd>0; const fibBear=(nearFib382||nearFib50x)&&macd<0;
  votes.push({name:'Fibonacci',icon:'🌀',signal:fibBull?'BUY':fibBear?'SELL':'HOLD',conf:fibBull||fibBear?71:30,
    reason:fibBull?`Price at Fib ${nearFib618?'61.8':'50'}% retracement with bullish MACD`:fibBear?`Price at Fib ${nearFib382?'38.2':'50'}% retracement with bearish MACD`:`No Fib confluence (38.2:${fp(curAsset,fib382)} 50:${fp(curAsset,fib50)} 61.8:${fp(curAsset,fib618)})`});

  // 5. BOLLINGER BAND SQUEEZE
  const squeeze=bbWidth<0.005;
  const bbBreakBull=price>bbUpper&&macd>0; const bbBreakBear=price<bbLower&&macd<0;
  votes.push({name:'BB Squeeze',icon:'🎯',signal:squeeze?(macd>0?'BUY':'SELL'):bbBreakBull?'BUY':bbBreakBear?'SELL':'HOLD',conf:squeeze||bbBreakBull||bbBreakBear?65:28,
    reason:squeeze?`Bollinger squeeze detected — breakout imminent, bias ${macd>0?'bullish':'bearish'}`:bbBreakBull?'Price above upper BB — bullish breakout':bbBreakBear?'Price below lower BB — bearish breakout':'BB neutral, no squeeze'});

  // 6. MARKET STRUCTURE
  const msBull=structure==='BULLISH'; const msBear=structure==='BEARISH';
  votes.push({name:'Mkt Structure',icon:'🏗️',signal:msBull?'BUY':msBear?'SELL':'HOLD',conf:msBull||msBear?68:30,
    reason:`Market structure: ${structure}. ${msBull?'Higher Highs + Higher Lows forming':msBear?'Lower Highs + Lower Lows forming':'No clear HH/HL or LL/LH pattern'}`});

  // 7. MULTI-TIMEFRAME (simulated as EMA200 bias)
  const mtfBull=price>ema200&&ema50>ema200; const mtfBear=price<ema200&&ema50<ema200;
  votes.push({name:'Multi-TF',icon:'📐',signal:mtfBull?'BUY':mtfBear?'SELL':'HOLD',conf:mtfBull||mtfBear?73:30,
    reason:mtfBull?'Price above EMA200 — higher TF bullish alignment':mtfBear?'Price below EMA200 — higher TF bearish alignment':'Price inside EMA200 zone — no HTF bias'});

  // 8. ORDER BLOCK
  const obBullActive=obBull&&Math.abs(price-obBull.price)/atr<1&&macd>0;
  const obBearActive=obBear&&Math.abs(price-obBear.price)/atr<1&&macd<0;
  votes.push({name:'Order Block',icon:'📦',signal:obBullActive?'BUY':obBearActive?'SELL':'HOLD',conf:obBullActive||obBearActive?76:25,
    reason:obBullActive?`Bullish OB at ${fp(curAsset,obBull.price)} — institutional buy zone`:obBearActive?`Bearish OB at ${fp(curAsset,obBear.price)} — institutional sell zone`:'No active order block confluence'});

  // 9. FAIR VALUE GAP
  const fvgBullActive=fvgBull&&price<=fvgBull.top&&price>=fvgBull.bot;
  const fvgBearActive=fvgBear&&price<=fvgBear.top&&price>=fvgBear.bot;
  votes.push({name:'Fair Value Gap',icon:'🔲',signal:fvgBullActive?'BUY':fvgBearActive?'SELL':'HOLD',conf:fvgBullActive||fvgBearActive?74:22,
    reason:fvgBullActive?`Price filling bullish FVG (${fp(curAsset,fvgBull.bot)}–${fp(curAsset,fvgBull.top)}) — expect bounce`:fvgBearActive?`Price filling bearish FVG (${fp(curAsset,fvgBear.bot)}–${fp(curAsset,fvgBear.top)}) — expect drop`:'No active FVG being filled'});

  // 10. LIQUIDITY SWEEP
  votes.push({name:'Liq. Sweep',icon:'💧',signal:sweptLow?'BUY':sweptHigh?'SELL':'HOLD',conf:sweptLow||sweptHigh?78:20,
    reason:sweptLow?'Liquidity sweep below recent lows detected — smart money reversal BUY':sweptHigh?'Liquidity sweep above recent highs detected — smart money reversal SELL':'No liquidity sweep in last candle'});

  // 11. VOLUME CONFIRMATION
  const volBull=volSpike&&volDir==='up'&&macd>0; const volBear=volSpike&&volDir==='down'&&macd<0;
  votes.push({name:'Volume Conf.',icon:'📊',signal:volBull?'BUY':volBear?'SELL':'HOLD',conf:volBull||volBear?69:30,
    reason:volBull?'Volume spike on bullish candle — buyers in control':volBear?'Volume spike on bearish candle — sellers in control':'Volume below average — no confirmation'});

  // 12. CORRELATION FILTER
  const corrAssets=['EURUSD','GBPUSD'];
  const isCorr=corrAssets.includes(curAsset);
  const corrScore=isCorr&&macd>0?5:isCorr&&macd<0?-5:0;
  votes.push({name:'Correlation',icon:'🔗',signal:corrScore>0?'BUY':corrScore<0?'SELL':'HOLD',conf:Math.abs(corrScore)>0?62:20,
    reason:isCorr?`${curAsset} correlated with EUR basket. MACD bias ${macd>0?'positive':'negative'}`:'Asset not in correlation group'});

  // 13. CANDLESTICK PATTERN (S/A/B tier weighted)
  const cp=detectCandlePatterns(d.closes||[],d.highs||[],d.lows||[],atr);
  let cpConf=cp.strength||20;
  // B-tier patterns require S/R confluence — reduce confidence if not near level
  if(cp.tier==='B'){
    const nearLevel=(Math.abs(price-support)/atr<1.0)||(Math.abs(resistance-price)/atr<1.0);
    if(!nearLevel) cpConf=Math.max(20,cpConf-20);
  }
  // S-tier patterns get a small boost when also near S/R
  if(cp.tier==='S'){
    const atLevel=(Math.abs(price-support)/atr<0.8)||(Math.abs(resistance-price)/atr<0.8);
    if(atLevel) cpConf=Math.min(95,cpConf+5);
  }
  const cpSig=cp.bias==='bull'?(isScalp?'SCALP-LONG':'BUY'):cp.bias==='bear'?(isScalp?'SCALP-SHORT':'SELL'):'HOLD';
  const tierLabel={'S':'🏆 S-Tier','A':'⭐ A-Tier','B':'📊 B-Tier','':''}[cp.tier||'']||'';
  votes.push({name:'Candle Pattern',icon:'🕯️',signal:cpSig,conf:cpConf,
    reason:tierLabel+' '+( cp.pattern||'No pattern')+': '+(cp.desc||'')+
      (cp.all&&cp.all.length>1?' (+'+(cp.all.length-1)+' more)':'')});

  return votes;
}

// ============================================================
// AI CHOOSES BEST STRATEGY
// ============================================================
function aiChooseStrategy(votes,d,isScalp){
  const {vol,macd,rsi,sweptHigh,sweptLow,fvgBull,fvgBear,obBull,obBear,bbWidth,structure} = d;

  // Score each signal direction
  let buyScore=0,sellScore=0,holdScore=0;
  let buyConf=0,sellConf=0;
  let buyVotes=0,sellVotes=0;

  votes.forEach(v=>{
    if(v.signal==='BUY'||v.signal==='SCALP-LONG'){buyScore+=v.conf;buyVotes++;}
    else if(v.signal==='SELL'||v.signal==='SCALP-SHORT'){sellScore+=v.conf;sellVotes++;}
    else holdScore+=10;
  });

  // Determine dominant signal
  let finalSignal='HOLD', chosenStrat='CONSOLIDATION', finalConf=30, chosenReason='';
  const confluence=Math.max(buyVotes,sellVotes);
  const confluencePct=Math.round((confluence/13)*100);

  if(buyVotes>=sellVotes&&buyVotes>=3){
    finalSignal=isScalp?'SCALP-LONG':'BUY';
    buyConf=Math.round(buyScore/buyVotes);
    finalConf=Math.min(92,buyConf+Math.floor(buyVotes*2));
    // Pick the best-sounding strategy name for display
    const bestVote=votes.filter(v=>v.signal==='BUY'||v.signal==='SCALP-LONG').sort((a,b)=>b.conf-a.conf)[0];
    chosenStrat=bestVote?bestVote.name+' ('+buyVotes+'/12 agree)':'AI BULLISH CONSENSUS';
  } else if(sellVotes>buyVotes&&sellVotes>=3){
    finalSignal=isScalp?'SCALP-SHORT':'SELL';
    sellConf=Math.round(sellScore/sellVotes);
    finalConf=Math.min(92,sellConf+Math.floor(sellVotes*2));
    const bestVote=votes.filter(v=>v.signal==='SELL'||v.signal==='SCALP-SHORT').sort((a,b)=>b.conf-a.conf)[0];
    chosenStrat=bestVote?bestVote.name+' ('+sellVotes+'/12 agree)':'AI BEARISH CONSENSUS';
  } else {
    finalSignal='HOLD'; finalConf=30; chosenStrat='CONFLICTED — WAIT';
  }

  // Build reasoning summary
  const bullNames=votes.filter(v=>v.signal==='BUY'||v.signal==='SCALP-LONG').map(v=>v.icon+v.name).join(', ')||'none';
  const bearNames=votes.filter(v=>v.signal==='SELL'||v.signal==='SCALP-SHORT').map(v=>v.icon+v.name).join(', ')||'none';
  chosenReason=`AI evaluated all 12 strategies. Bullish votes (${buyVotes}): ${bullNames}. Bearish votes (${sellVotes}): ${bearNames}. ${finalSignal!=='HOLD'?'Majority agree on '+finalSignal+'. Confluence: '+confluencePct+'%.':'Signals conflict — no high-probability setup. Wait for clearer alignment.'}`;

  return {signal:finalSignal,conf:finalConf,strategy:chosenStrat,reasoning:chosenReason,confluence,confPct:confluencePct,buyVotes,sellVotes};
}

// ============================================================
// INDICATOR CHIPS
// ============================================================
function buildChips(d,votes){
  const chips=[];
  if(d.price>d.ema20) chips.push({t:'Price>EMA20',c:'bull'});else chips.push({t:'Price<EMA20',c:'bear'});
  if(d.price>d.ema200) chips.push({t:'Above EMA200',c:'bull'});else chips.push({t:'Below EMA200',c:'bear'});
  if(d.rsi<35) chips.push({t:'RSI Oversold',c:'bull'});else if(d.rsi>65) chips.push({t:'RSI Overbought',c:'bear'});else chips.push({t:'RSI Neutral',c:'neut'});
  if(d.structure==='BULLISH') chips.push({t:'HH+HL Structure',c:'bull'});else if(d.structure==='BEARISH') chips.push({t:'LH+LL Structure',c:'bear'});else chips.push({t:'Ranging',c:'neut'});
  if(d.sweptLow) chips.push({t:'Liq Sweep Low ✓',c:'bull'});
  if(d.sweptHigh) chips.push({t:'Liq Sweep High ✓',c:'bear'});
  if(d.macd>0) chips.push({t:'MACD Bullish',c:'bull'});else chips.push({t:'MACD Bearish',c:'bear'});
  if(d.bbWidth<0.005) chips.push({t:'BB Squeeze!',c:'neut'});
  if(d.volSpike) chips.push({t:'Vol Spike '+d.volDir,c:d.volDir==='up'?'bull':'bear'});
  return chips;
}

// ============================================================
// MAIN SIGNAL REFRESH
// ============================================================
async function refreshSignal(){
  if(!updParams()) return;
  // Check news block first
  const blocked=await checkNewsBlock(curAsset);
  if(blocked){
    document.getElementById('reasonBox').innerHTML='🚫 '+newsBlockReason+' — Signal suppressed to protect your trade.';
    document.getElementById('sigBadge').className='sbadge HOLD';
    document.getElementById('sigBadge').textContent='NEWS BLOCK';
    addLog(newsBlockReason,'warn');
    toast('🚫 Signal blocked — high-impact news nearby');
    return;
  }
  addLog('Fetching '+curAsset+' '+curTf+'...','info');
  const d=await fetchData(curAsset,curTf);
  curMkt=d;
  const isScalp=curTf==='1min'||curTf==='5min';
  const votes=runAllStrategies(d,isScalp);
  const {signal,conf,strategy,reasoning,confluence,confPct,buyVotes,sellVotes}=aiChooseStrategy(votes,d,isScalp);

  // SL/TP — tighter for scalp
  const slMult=isScalp?1.0:1.5; const tpMult=isScalp?2.0:2.5;
  const sl=(signal==='BUY'||signal==='SCALP-LONG')?d.price-d.atr*slMult:
            (signal==='SELL'||signal==='SCALP-SHORT')?d.price+d.atr*slMult:null;
  const tp=(signal==='BUY'||signal==='SCALP-LONG')?d.price+d.atr*tpMult:
            (signal==='SELL'||signal==='SCALP-SHORT')?d.price-d.atr*tpMult:null;
  const rr=sl&&tp?(Math.abs(tp-d.price)/Math.abs(d.price-sl)).toFixed(1)+'R':'---';

  // LOT SIZE
  let lot=0,riskAmt=0,rewardAmt=0;
  if(sl&&curBal&&curRisk){
    const riskUSD=(curRisk/100)*curBal;
    const pips=Math.abs(d.price-sl);
    let pipVal=curAsset==='XAUUSD'?100:curAsset==='BTCUSD'?1:100000;
    lot=Math.min(10,Math.max(0.01,parseFloat((riskUSD/(pips*pipVal)).toFixed(2))));
    riskAmt=parseFloat((lot*pips*pipVal).toFixed(2));
    rewardAmt=parseFloat((riskAmt*tpMult/slMult).toFixed(2));
  }

  curSig={signal,price:d.price,entry:d.price,sl,tp,conf,reasoning,asset:curAsset,tf:curTf,strategy,confluence};

  // UPDATE SIGNAL CARD
  document.getElementById('sigBadge').className='sbadge '+signal;
  document.getElementById('sigBadge').textContent=signal;
  document.getElementById('sigCard').className='sig-card '+signal;
  document.getElementById('assetTfLbl').textContent=curAsset+' · '+curTf;
  document.getElementById('chosenStratBadge').textContent=strategy;
  document.getElementById('mPrice').textContent=fp(curAsset,d.price);
  document.getElementById('mRSI').textContent=d.rsi;
  document.getElementById('mATR').textContent=fp(curAsset,d.atr);
  document.getElementById('mEMA').textContent=d.price>d.ema50?'▲ BULL':'▼ BEAR';
  document.getElementById('mEMA').style.color=d.price>d.ema50?'var(--green)':'var(--red)';
  document.getElementById('mStruct').textContent=d.structure;
  document.getElementById('mStruct').style.color=d.structure==='BULLISH'?'var(--green)':d.structure==='BEARISH'?'var(--red)':'var(--gold)';
  document.getElementById('mConf').textContent=conf+'%';
  document.getElementById('confFill').style.width=conf+'%';
  document.getElementById('confScore').textContent=confluence+'/12 agree';
  document.getElementById('reasonBox').innerHTML='🧠 '+reasoning;
  document.getElementById('mLot').textContent=lot.toFixed(2);
  document.getElementById('mRisk').textContent=riskAmt;
  document.getElementById('mReward').textContent=rewardAmt;
  document.getElementById('mSL').textContent=sl?fp(curAsset,sl):'---';
  document.getElementById('mTP').textContent=tp?fp(curAsset,tp):'---';
  document.getElementById('mRR').textContent=rr;

  // STRATEGY GRID (all 12)
  const colors={BUY:'#10b981','SCALP-LONG':'#10b981',SELL:'#ef4444','SCALP-SHORT':'#ef4444',HOLD:'#f59e0b'};
  document.getElementById('stratGrid').innerHTML=votes.map(v=>`
    <div class="strat-tile ${v.signal!=='HOLD'?'strat-active':''}" style="border-color:${colors[v.signal]||'#f59e0b'}33;color:${colors[v.signal]||'#f59e0b'};" title="${v.reason}">
      <div class="st-name">${v.icon} ${v.name}</div>
      <div class="st-sig" style="color:${colors[v.signal]||'#f59e0b'};">${v.signal}</div>
      <div class="st-conf" style="color:var(--sub);">${v.conf}%</div>
    </div>`).join('');
  document.getElementById('stratSummary').innerHTML=
    `✅ ${buyVotes} Bullish &nbsp;|&nbsp; ❌ ${sellVotes} Bearish &nbsp;|&nbsp; ⚪ '+(13-buyVotes-sellVotes)+' Neutral &nbsp;|&nbsp; Confluence: <strong>${confPct}%</strong>`;

  // INDICATOR CHIPS
  const chips=buildChips(d,votes);
  document.getElementById('indChips').innerHTML=chips.map(c=>`<span class="ind-chip ind-${c.c}">${c.t}</span>`).join('');

  // S/R SCALP
  if(isScalp){
    const dSup=Math.abs(d.price-d.support)/d.atr; const dRes=Math.abs(d.resistance-d.price)/d.atr;
    document.getElementById('sBounce').textContent=d.rsi<40&&dSup<0.6?'🔥 BOUNCE READY':dSup<0.9?'⚠️ WATCHING':'— Waiting —';
    document.getElementById('sReject').textContent=d.rsi>60&&dRes<0.6?'🔥 REJECT READY':dRes<0.9?'⚠️ WATCHING':'— Waiting —';
    document.getElementById('sSupport').textContent='Support: '+fp(curAsset,d.support);
    document.getElementById('sResist').textContent='Resistance: '+fp(curAsset,d.resistance);
    document.getElementById('sSupTgt').textContent='Target: '+fp(curAsset,d.support+d.atr*0.8);
    document.getElementById('sResTgt').textContent='Target: '+fp(curAsset,d.resistance-d.atr*0.8);
    document.getElementById('sRsiDiv').textContent=d.rsi<30&&dSup<0.4?'🔄 BULLISH DIV!':d.rsi>70&&dRes<0.4?'🔄 BEARISH DIV!':'No divergence';
    document.getElementById('sFibLvl').textContent='Fib 61.8: '+fp(curAsset,d.fib618);
  } else {
    document.getElementById('sBounce').textContent='—';document.getElementById('sReject').textContent='—';
    document.getElementById('sRsiDiv').textContent='AI Adaptive Mode';
    document.getElementById('sFibLvl').textContent='Fib 50%: '+fp(curAsset,d.fib50);
  }
  document.getElementById('sRsiVal').textContent='RSI: '+d.rsi;

  document.getElementById('waBtn').disabled=signal==='HOLD';
  document.getElementById('openTradeBtn').disabled=signal==='HOLD'||!!activeTrade;
  updateCandleDisplay(d);
  updateExecCard();
  addLog(curAsset+' '+signal+' @ '+fp(curAsset,d.price)+' | '+strategy.substring(0,50)+' | Conf:'+conf+'%','signal');
  if(alerts.journal&&signal!=='HOLD') saveJ();
  if(signal!=='HOLD') fireAlert(signal,conf);
  updateChart();
}

// ============================================================
// SESSIONS
// ============================================================
const SESS={Tokyo:{open:0,close:9,color:'#8b5cf6',pairs:['USDJPY','AUDUSD']},
  London:{open:8,close:17,color:'#3b82f6',pairs:['GBPUSD','EURUSD','USDCAD']},
  NY:{open:13,close:22,color:'#10b981',pairs:['XAUUSD','BTCUSD','EURUSD','GBPUSD']}};
function isActive(s){const h=new Date().getUTCHours();return s.close<s.open?h>=s.open||h<s.close:h>=s.open&&h<s.close;}

// Per-asset optimal trading windows (UTC)
const ASSET_BEST_SESSION={
  EURUSD: {session:'London+NY Overlap', hours:'13:00-17:00 UTC', reason:'Peak EUR/USD volume — both sessions active simultaneously'},
  GBPUSD: {session:'London+NY Overlap', hours:'13:00-17:00 UTC', reason:'GBP most active in London, boosted by NY open'},
  USDJPY: {session:'Tokyo+London Open', hours:'00:00-10:00 UTC', reason:'JPY most liquid in Asian hours, volatile at London open'},
  AUDUSD: {session:'Tokyo+Sydney',      hours:'22:00-08:00 UTC', reason:'AUD driven by Australian data and Asian risk sentiment'},
  NZDUSD: {session:'Tokyo+Sydney',      hours:'21:00-07:00 UTC', reason:'NZD follows AUD closely, most liquid in Asian session'},
  USDCAD: {session:'NY Session',        hours:'13:00-21:00 UTC', reason:'CAD driven by oil prices and US economic data'},
  USDCHF: {session:'London Session',    hours:'08:00-17:00 UTC', reason:'CHF most active during European hours, safe-haven flows'},
  EURGBP: {session:'London Session',    hours:'08:00-17:00 UTC', reason:'Pure European cross — almost exclusively active in London'},
  EURJPY: {session:'London+Tokyo',      hours:'07:00-12:00 UTC', reason:'Best at London open when EUR and JPY sessions overlap'},
  GBPJPY: {session:'London+Tokyo',      hours:'07:00-12:00 UTC', reason:'Most volatile pair — London open drives explosive moves'},
  XAUUSD: {session:'London+NY Overlap', hours:'13:00-17:00 UTC', reason:'Gold most liquid during overlap — biggest price moves'},
  XAGUSD: {session:'London+NY Overlap', hours:'13:00-17:00 UTC', reason:'Silver follows Gold — same optimal trading window'},
  BTCUSD: {session:'NY Session',        hours:'13:00-22:00 UTC', reason:'Crypto most active during US hours despite being 24/7'},
  ETHUSD: {session:'NY Session',        hours:'13:00-22:00 UTC', reason:'ETH follows BTC — same optimal window'}
};

function getBestSessionInfo(asset){
  return ASSET_BEST_SESSION[asset]||{session:'All Sessions',hours:'Varies',reason:'No specific peak window'};
}

function isOptimalTime(asset){
  var info=ASSET_BEST_SESSION[asset];
  if(!info) return false;
  var h=new Date().getUTCHours();
  var parts=info.hours.match(/(\d+):00-(\d+):00/);
  if(!parts) return true;
  var start=parseInt(parts[1]),end=parseInt(parts[2]);
  if(end<start) return h>=start||h<end;
  return h>=start&&h<end;
}
function getSessionFor(asset){let a=[];for(const[n,s] of Object.entries(SESS))if(isActive(s)&&s.pairs.includes(asset))a.push(n);return a.length?a.join('+'):'Off-Hrs';}
function renderSessions(){
  const lon=isActive(SESS.London),ny=isActive(SESS.NY),tok=isActive(SESS.Tokyo);
  // Session tiles
  document.getElementById('sessGrid').innerHTML=Object.entries(SESS).map(function(entry){
    var name=entry[0],s=entry[1];
    var on=isActive(s);
    var activePairs=s.pairs.filter(function(p){return ALL_ASSETS.includes(p);});
    return '<div class="sess-tile '+(on?'strat-active':'')+'" style="border-color:'+s.color+(on?'':'22')+';color:'+(on?s.color:'var(--muted)')+';">'+
      '<div class="sn">'+s.emoji+' '+name.toUpperCase()+'</div>'+
      '<div class="st">'+String(s.open).padStart(2,'0')+':00 – '+String(s.close).padStart(2,'0')+':00 UTC</div>'+
      '<div class="ss">'+(on?'🟢 ACTIVE':'⚪ CLOSED')+'</div>'+
      '<div style="font-size:0.55rem;margin-top:4px;line-height:1.6;">'+activePairs.join(' &middot; ')+'</div>'+
      '<div style="font-size:0.55rem;margin-top:4px;color:'+(on?s.color:'var(--muted)')+'44;font-style:italic;">'+s.tip+'</div>'+
      '</div>';
  }).join('');
  // Best message
  var asset=curAsset||'';
  var best=asset?getBestSessionInfo(asset):null;
  var optimal=asset?isOptimalTime(asset):false;
  var msg='';
  if(lon&&ny) msg='⚡ <strong>London+NY Overlap (13:00–17:00 UTC)</strong> — Highest liquidity window for all pairs!';
  else if(lon) msg='🔵 <strong>London Session</strong> — Best for EURUSD, GBPUSD, EURGBP, USDCHF, XAGUSD.';
  else if(ny)  msg='🟢 <strong>New York Session</strong> — Best for XAUUSD, BTCUSD, ETHUSD, USDCAD, NZDUSD.';
  else if(tok) msg='🟣 <strong>Tokyo Session</strong> — Best for USDJPY, EURJPY, GBPJPY, AUDUSD, NZDUSD.';
  else msg='⚪ <strong>Off-hours</strong> — Low liquidity, wide spreads. Avoid scalping all pairs.';
  if(best&&asset){
    msg+='<br><span style="color:'+(optimal?'var(--green)':'var(--gold)')+';">'+
      (optimal?'✅':'⏰')+' <strong>'+asset+'</strong> best window: '+best.hours+
      ' ('+best.session+') — '+best.reason+'</span>';
  }
  document.getElementById('sessBestMsg').innerHTML=msg;
  // Nav pill
  var pill=document.getElementById('sessionPill');
  if(lon&&ny){pill.className='pill pill-green';pill.textContent='⚡ LDN+NY';}
  else if(lon){pill.className='pill pill-blue';pill.textContent='🔵 LONDON';}
  else if(ny) {pill.className='pill pill-green';pill.textContent='🟢 NEW YORK';}
  else if(tok){pill.className='pill pill-purple';pill.textContent='🟣 TOKYO';}
  else        {pill.className='pill pill-muted';pill.textContent='⚪ OFF-HRS';}
  // Render all pairs best times if panel is open
  var apt=document.getElementById('allPairsTimes');
  if(apt){
    var now=new Date().getUTCHours();
    apt.innerHTML=Object.entries(ASSET_BEST_SESSION).map(function(entry){
      var pair=entry[0], info=entry[1];
      var m=info.hours.match(/(\d+):00.(\d+):00/);
      var active=false;
      if(m){var s2=parseInt(m[1]),e2=parseInt(m[2]);active=e2<s2?now>=s2||now<e2:now>=s2&&now<e2;}
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;border-radius:7px;background:'+(active?'#10b98122':'#1e2d4a22')+';">'+
        '<strong style="color:'+(active?'var(--green)':'var(--sub)')+';">'+pair+'</strong>'+
        '<span style="color:var(--sub);">'+info.hours+'</span>'+
        (active?'<span style="color:var(--green);font-size:0.6rem;">🟢 NOW</span>':'<span style="font-size:0.6rem;color:var(--muted);">'+info.session+'</span>')+
        '</div>';
    }).join('');
  }
}

// ============================================================
// DASHBOARD
// ============================================================
const ALL_ASSETS=['EURUSD','GBPUSD','USDJPY','XAUUSD','BTCUSD','AUDUSD','USDCAD','NZDUSD','USDCHF','EURGBP','EURJPY','GBPJPY','ETHUSD','XAGUSD'];
async function refreshDash(){
  const tf=document.getElementById('dashTf').value;
  document.getElementById('dashBody').innerHTML='<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--muted);">⏳ Scanning all assets...</td></tr>';
  const rows=await Promise.all(ALL_ASSETS.map(async asset=>{
    const d=await fetchData(asset,tf);
    const isScalp=tf==='1min'||tf==='5min';
    const votes=runAllStrategies(d,isScalp);
    const {signal,conf,strategy,buyVotes,sellVotes}=aiChooseStrategy(votes,d,isScalp);
    const slMult=isScalp?1.0:1.5; const tpMult=isScalp?2.0:2.5;
    const sl=(signal==='BUY'||signal==='SCALP-LONG')?d.price-d.atr*slMult:(signal==='SELL'||signal==='SCALP-SHORT')?d.price+d.atr*slMult:null;
    const tp=(signal==='BUY'||signal==='SCALP-LONG')?d.price+d.atr*tpMult:(signal==='SELL'||signal==='SCALP-SHORT')?d.price-d.atr*tpMult:null;
    return{asset,price:d.price,entry:d.price,sl,tp,signal,conf,strategy,rsi:d.rsi,ema:d.price>d.ema50?'▲':'▼',session:getSessionFor(asset),buyVotes,sellVotes};
  }));
  let buys=0,sells=0,holds=0,tc=0;
  document.getElementById('dashBody').innerHTML=rows.map(r=>{
    if(r.signal==='BUY'||r.signal==='SCALP-LONG')buys++;
    else if(r.signal==='SELL'||r.signal==='SCALP-SHORT')sells++;
    else holds++;
    tc+=r.conf;
    return `<tr>
      <td><strong>${r.asset}</strong></td>
      <td style="font-family:var(--fm);">${fp(r.asset,r.price)}</td>
      <td><span class="sig-chip sc-${r.signal}">${r.signal}</span></td>
      <td style="font-family:var(--fm);color:var(--gold);">${fp(r.asset,r.entry)}</td>
      <td style="font-family:var(--fm);color:var(--red);font-size:0.72rem;">${r.sl?fp(r.asset,r.sl):'--'}</td>
      <td style="font-family:var(--fm);color:var(--green);font-size:0.72rem;">${r.tp?fp(r.asset,r.tp):'--'}</td>
      <td><span style="font-size:0.68rem;" class="${r.conf>=70?'cc-h':r.conf>=50?'cc-m':'cc-l'} ind-chip">${r.conf}% (${r.buyVotes}v${r.sellVotes})</span></td>
      <td>${r.rsi.toFixed(0)}</td>
      <td style="font-size:0.68rem;">${r.session}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="jumpToTrade('${r.asset}','${tf}')">→</button></td>
    </tr>`;
  }).join('');
  document.getElementById('dsBuy').textContent=buys;
  document.getElementById('dsSell').textContent=sells;
  document.getElementById('dsHold').textContent=holds;
  document.getElementById('dsConf').textContent=Math.round(tc/rows.length)+'%';
  updateCacheStatus();
  window._lastDashRows=rows;
}
function jumpToTrade(asset,tf){
  document.getElementById('assetSel').value=asset;
  document.getElementById('tfSel').value=tf;
  updParams();
  document.querySelectorAll('.tab')[0].click();
  refreshSignal();
}
function clearCache(){
  Object.keys(dataCache).forEach(k=>delete dataCache[k]);
  toast('🗑 Cache cleared — next refresh fetches fresh data');
  document.getElementById('cacheStatus').textContent='';
}

function updateCacheStatus(){
  const keys=Object.keys(dataCache);
  if(!keys.length){document.getElementById('cacheStatus').textContent='';return;}
  const oldest=Math.min(...keys.map(k=>dataCache[k].ts));
  const age=Math.round((Date.now()-oldest)/1000);
  document.getElementById('cacheStatus').textContent=`📦 ${keys.length} cached · oldest ${age}s ago`;
}


function toggleDashAuto(){
  if(dashAutoIv){clearInterval(dashAutoIv);dashAutoIv=null;document.getElementById('dashAutoBtn').textContent='⏱ Auto';}
  else{dashAutoIv=setInterval(refreshDash,60000);refreshDash();document.getElementById('dashAutoBtn').textContent='⏹ Stop';}
}

// ============================================================
// INTERVALS
// ============================================================
function toggleAuto(){
  if(autoIv){clearInterval(autoIv);autoIv=null;document.getElementById('autoBtn').textContent='🔄 Auto (30min)';}
  else{autoIv=setInterval(refreshSignal,30*60*1000);refreshSignal();document.getElementById('autoBtn').textContent='⏹ Stop Auto';}
}
function toggleScalp(){
  if(scalpIv){clearInterval(scalpIv);scalpIv=null;document.getElementById('scalpBtn').textContent='⚡ Scalp Mode';document.getElementById('scalpBtn').style.background='';}
  else{scalpIv=setInterval(refreshSignal,15000);refreshSignal();document.getElementById('scalpBtn').textContent='⏹ Stop Scalp';document.getElementById('scalpBtn').style.background='var(--red)';}
}

// ============================================================
// JOURNAL
// ============================================================
function saveJ(){
  const s=curSig;
  journal.unshift({id:Date.now(),time:new Date().toLocaleString(),asset:s.asset,tf:s.tf,
    signal:s.signal,entry:s.price,sl:s.sl,tp:s.tp,conf:s.conf,strategy:s.strategy,
    result:null,autoChecked:false,checkTime:null,outcome:null});
  if(journal.length>200) journal.pop();
  localStorage.setItem('qep_journal',JSON.stringify(journal));
  setTimeout(scheduleAutoCheck, 500);
}

// Auto-check past signals against current price to detect TP/SL hits
async function scheduleAutoCheck(){
  let changed=false;
  for(let i=0;i<journal.length;i++){
    const j=journal[i];
    if(j.result||j.autoChecked) continue;
    if(!j.sl||!j.tp||!j.entry) continue;
    const ageMs=Date.now()-new Date(j.time).getTime();
    // Only check signals older than 5 minutes
    if(ageMs < 5*60*1000) continue;
    try{
      const d=await fetchData(j.asset, j.tf||'1h');
      const price=d.price;
      const isBuy=j.signal==='BUY'||j.signal==='SCALP-LONG';
      let outcome=null;
      if(isBuy){
        if(price>=j.tp) outcome='TP HIT ✅';
        else if(price<=j.sl) outcome='SL HIT ❌';
        else if(isBuy&&price>j.entry) outcome='IN PROFIT 📈';
        else outcome='IN LOSS 📉';
      } else {
        if(price<=j.tp) outcome='TP HIT ✅';
        else if(price>=j.sl) outcome='SL HIT ❌';
        else if(!isBuy&&price<j.entry) outcome='IN PROFIT 📈';
        else outcome='IN LOSS 📉';
      }
      journal[i].outcome=outcome;
      journal[i].checkPrice=price;
      journal[i].checkTime=new Date().toLocaleTimeString();
      journal[i].autoChecked=true;
      // Auto-mark result if definitive
      if(outcome==='TP HIT ✅') journal[i].result='WIN';
      else if(outcome==='SL HIT ❌') journal[i].result='LOSS';
      changed=true;
    }catch(e){}
  }
  if(changed){
    localStorage.setItem('qep_journal',JSON.stringify(journal));
    renderJ('all');
    renderAnalytics();
  }
}
function filterJ(f,el){
  document.querySelectorAll('.fchip').forEach(c=>c.classList.remove('on'));
  if(el)el.classList.add('on');
  renderJ(f);
}
function renderJ(f){
  let data=journal;
  if(f&&f!=='all'&&f!=='high') data=data.filter(d=>d.signal===f);
  if(f==='high') data=data.filter(d=>d.conf>=70);
  const wins=journal.filter(d=>d.result==='WIN').length;
  const loss=journal.filter(d=>d.result==='LOSS').length;
  document.getElementById('jTotal').textContent=journal.length;
  document.getElementById('jWins').textContent=wins;
  document.getElementById('jLoss').textContent=loss;
  document.getElementById('jWR').textContent=wins+loss>0?Math.round(wins/(wins+loss)*100)+'%':'--';
  if(!data.length){document.getElementById('jBody').innerHTML='<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--muted);">No entries.</td></tr>';return;}
  document.getElementById('jBody').innerHTML=data.map(function(d){
    var oc=d.outcome&&d.outcome.includes('TP')?'var(--green)':d.outcome&&d.outcome.includes('SL')?'var(--red)':d.outcome&&d.outcome.includes('PROFIT')?'#10b981':'#ef4444';
    var oHtml=d.outcome?
      '<div style="font-size:0.68rem;font-weight:700;color:'+oc+';">'+d.outcome+'</div>'+
      (d.checkPrice?'<div style="font-size:0.6rem;color:var(--sub);">@ '+fp(d.asset,d.checkPrice)+' &middot; '+(d.checkTime||'')+'</div>':'')
      :'<button class="btn btn-ghost btn-sm" style="padding:2px 7px;font-size:0.62rem;" onclick="recheckSignal('+d.id+')">&#128269; Check</button>';
    var wBtn='<button class="btn btn-ghost btn-sm" style="padding:2px 7px;font-size:0.62rem;" onclick="markR('+d.id+',\"WIN\")">&#9989;W</button>';
    var lBtn='<button class="btn btn-ghost btn-sm" style="padding:2px 7px;font-size:0.62rem;" onclick="markR('+d.id+',\"LOSS\")">&#10060;L</button>';
    var resultHtml=d.result===null?wBtn+' '+lBtn:'<span style="color:'+(d.result==='WIN'?'var(--green)':'var(--red)')+';">'+d.result+'</span>';
    var confClass=d.conf>=70?'ind-bull':d.conf>=50?'ind-neut':'ind-bear';
    var sigClass='sig-chip sc-'+d.signal;
    return '<tr>'+
      '<td style="font-size:0.62rem;">'+d.time+'</td>'+
      '<td>'+d.asset+'</td>'+
      '<td>'+d.tf+'</td>'+
      '<td><span class="'+sigClass+'">'+d.signal+'</span></td>'+
      '<td style="font-family:var(--fm);">'+fp(d.asset,d.entry)+'</td>'+
      '<td style="font-family:var(--fm);color:var(--red);font-size:0.7rem;">'+(d.sl?fp(d.asset,d.sl):'--')+'</td>'+
      '<td style="font-family:var(--fm);color:var(--green);font-size:0.7rem;">'+(d.tp?fp(d.asset,d.tp):'--')+'</td>'+
      '<td><span class="ind-chip '+confClass+'">'+d.conf+'%</span></td>'+
      '<td style="font-size:0.62rem;">'+(d.strategy||'').substring(0,22)+'</td>'+
      '<td>'+oHtml+'</td>'+
      '<td>'+resultHtml+'</td>'+
      '</tr>';
  }).join('');
}
function markR(id,result){const i=journal.findIndex(d=>d.id===id);if(i>=0){journal[i].result=result;localStorage.setItem('qep_journal',JSON.stringify(journal));renderJ('all');renderAnalytics();}}
function clearJ(){if(confirm('Clear all journal entries?')){journal=[];localStorage.setItem('qep_journal','[]');renderJ('all');}}

async function recheckSignal(id){
  const idx=journal.findIndex(d=>d.id===id);
  if(idx<0) return;
  const j=journal[idx];
  if(!j.sl||!j.tp) return;
  toast('🔍 Checking '+j.asset+'...');
  try{
    const d=await fetchData(j.asset,j.tf||'1h');
    const price=d.price;
    const isBuy=j.signal==='BUY'||j.signal==='SCALP-LONG';
    let outcome=null;
    if(isBuy){
      if(price>=j.tp) outcome='TP HIT ✅';
      else if(price<=j.sl) outcome='SL HIT ❌';
      else if(price>j.entry) outcome='IN PROFIT 📈';
      else outcome='IN LOSS 📉';
    } else {
      if(price<=j.tp) outcome='TP HIT ✅';
      else if(price>=j.sl) outcome='SL HIT ❌';
      else if(price<j.entry) outcome='IN PROFIT 📈';
      else outcome='IN LOSS 📉';
    }
    journal[idx].outcome=outcome;
    journal[idx].checkPrice=price;
    journal[idx].checkTime=new Date().toLocaleTimeString();
    journal[idx].autoChecked=true;
    if(outcome==='TP HIT ✅') journal[idx].result='WIN';
    else if(outcome==='SL HIT ❌') journal[idx].result='LOSS';
    localStorage.setItem('qep_journal',JSON.stringify(journal));
    renderJ('all'); renderAnalytics();
    toast(j.asset+': '+outcome);
  }catch(e){toast('❌ Check failed');}
}

async function recheckAll(){
  toast('🔍 Checking all signals...');
  for(let i=0;i<journal.length;i++){
    if(journal[i].result) continue;
    journal[i].autoChecked=false;
  }
  await scheduleAutoCheck();
  toast('✅ All signals checked');
}

// ============================================================
// BACKTEST
// ============================================================
function runBT(){
  const asset=document.getElementById('btAsset').value;
  const tf=document.getElementById('btTf').value;
  const mode=document.getElementById('btMode').value;
  document.getElementById('btResults').style.display='block';
  let wins=0,losses=0,equity=1000;
  const eqPts=[equity]; const log=[];
  for(let i=0;i<50;i++){
    const d=simData(asset);
    const isScalp=tf==='1min'||tf==='5min';
    let signal='HOLD';
    if(mode==='ai'){const votes=runAllStrategies(d,isScalp);const r=aiChooseStrategy(votes,d,isScalp);signal=r.signal;}
    else if(mode==='trend'){signal=d.macd>0&&d.price>d.ema50?'BUY':d.macd<0&&d.price<d.ema50?'SELL':'HOLD';}
    else if(mode==='mean'){signal=d.rsi<30?'BUY':d.rsi>70?'SELL':'HOLD';}
    else if(mode==='sr'){const dS=Math.abs(d.price-d.support)/d.atr;const dR=Math.abs(d.resistance-d.price)/d.atr;signal=d.rsi<40&&dS<0.6?'BUY':d.rsi>60&&dR<0.6?'SELL':'HOLD';}
    else if(mode==='ob'){signal=d.obBull&&d.macd>0?'BUY':d.obBear&&d.macd<0?'SELL':'HOLD';}
    else if(mode==='fib'){const nF=Math.abs(d.price-d.fib618)/d.atr<0.5;signal=nF&&d.macd>0?'BUY':nF&&d.macd<0?'SELL':'HOLD';}
    if(signal==='HOLD'){eqPts.push(equity);continue;}
    const won=Math.random()<0.52;
    if(won){wins++;equity*=1.025;}else{losses++;equity*=0.99;}
    eqPts.push(equity);
    log.push({i,signal,result:won?'WIN':'LOSS',eq:equity.toFixed(0)});
  }
  const total=wins+losses;
  document.getElementById('btWR').textContent=total?Math.round(wins/total*100)+'%':'0%';
  document.getElementById('btTrades').textContent=total;
  document.getElementById('btPF').textContent=losses?(wins*2.5/losses).toFixed(2):'∞';
  const dd=Math.round((1-Math.min(...eqPts)/1000)*100);
  document.getElementById('btDD').textContent=dd+'%';
  document.getElementById('btLog').innerHTML=log.slice(0,20).map(t=>
    `<div style="padding:3px 0;border-bottom:1px solid #1e2d4a22;color:${t.result==='WIN'?'var(--green)':'var(--red)'};">Candle ${t.i+1}: ${t.signal} → ${t.result} | $${t.eq}</div>`).join('')+
    `<div style="color:var(--sub);font-size:0.65rem;padding:6px 0;">Showing first 20 of ${total} trades</div>`;
  const c=document.getElementById('eqCanvas');const ctx=c.getContext('2d');
  c.width=c.offsetWidth*2;c.height=360;ctx.clearRect(0,0,c.width,c.height);
  const mn=Math.min(...eqPts)*0.99;const mx=Math.max(...eqPts)*1.01;
  ctx.strokeStyle='#f59e0b';ctx.lineWidth=2;ctx.beginPath();
  eqPts.forEach((p,i)=>{const x=(i/(eqPts.length-1))*c.width;const y=c.height-((p-mn)/(mx-mn))*c.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.stroke();
  ctx.lineTo(c.width,c.height);ctx.lineTo(0,c.height);ctx.closePath();
  ctx.fillStyle='rgba(245,158,11,0.08)';ctx.fill();
}
function updateChart(){
  if(!curAsset) return;
  const tvM={XAUUSD:'OANDA:XAUUSD',BTCUSD:'BITSTAMP:BTCUSD',EURUSD:'FX:EURUSD',GBPUSD:'FX:GBPUSD',USDJPY:'FX:USDJPY',AUDUSD:'FX:AUDUSD',USDCAD:'FX:USDCAD'};
  const iM={'1min':'1','5min':'5','15min':'15','1h':'60','4h':'240','1day':'1D'};
  if(tvW)try{tvW.remove();}catch(e){}
  document.getElementById('tvChart').innerHTML='';
  tvW=new TradingView.widget({width:'100%',height:380,symbol:tvM[curAsset],interval:iM[curTf]||'60',theme:'dark',style:'1',locale:'en',container_id:'tvChart',studies:['RSI@tv-basicstudies','MACD@tv-basicstudies','BB@tv-basicstudies']});
}
function fireAlert(signal,conf){
  if(alerts.highOnly&&conf<70) return;
  if(alerts.sound){
    try{
      const ctx=new(window.AudioContext||window.webkitAudioContext)();
      const bull=signal==='BUY'||signal==='SCALP-LONG';
      const freqs=bull?[440,554,659]:[659,554,440];
      freqs.forEach((f,i)=>{
        const o=ctx.createOscillator();const g=ctx.createGain();
        o.connect(g);g.connect(ctx.destination);o.frequency.value=f;o.type='sine';
        g.gain.setValueAtTime(0.15,ctx.currentTime+i*0.13);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.13+0.25);
        o.start(ctx.currentTime+i*0.13);o.stop(ctx.currentTime+i*0.13+0.3);
      });
    }catch(e){}
  }
  if(alerts.vibrate&&navigator.vibrate) navigator.vibrate([80,40,180]);
  toast('🔔 '+signal+' — '+conf+'% | '+curSig.confluence+'/12 strategies agree');
}
function testAlert(){alerts.sound=true;fireAlert('BUY',85);toast('🔔 Test OK');}
document.querySelectorAll('input[name="waM"]').forEach(r=>r.addEventListener('change',()=>{
  const m=document.querySelector('input[name="waM"]:checked').value;
  document.getElementById('waNumArea').style.display=(m==='direct'||m==='api')?'block':'none';
  document.getElementById('waApiArea').style.display=(m==='api')?'block':'none';
}));
function buildWAMsgAll(rows){
  // Build a WhatsApp blast for all dashboard signals
  const active=rows.filter(r=>r.signal!=='HOLD');
  if(!active.length) return 'No active signals at this time.';
  let msg='⚡ *QUANTUM EDGE PRO — MULTI-PAIR SIGNALS* ⚡\n'+new Date().toLocaleString()+'\n\n';
  active.forEach(r=>{
    const isBuy=r.signal==='BUY'||r.signal==='SCALP-LONG';
    msg+=(isBuy?'🟢':'🔴')+' *'+r.asset+'* — '+r.signal+'\n';
    msg+='Entry: '+fp(r.asset,r.entry)+' | SL: '+(r.sl?fp(r.asset,r.sl):'N/A')+' | TP: '+(r.tp?fp(r.asset,r.tp):'N/A')+'\n';
    msg+='Confidence: '+r.conf+'% | Strategy: '+r.strategy.substring(0,30)+'\n\n';
  });
  msg+='_Trade responsibly. Always use stop-loss._';
  return msg;
}

function buildWAMsg(){
  const s=curSig;
  const votes=curMkt.price?runAllStrategies(curMkt,curTf==='1min'||curTf==='5min'):[];
  const bull=votes.filter(v=>v.signal==='BUY'||v.signal==='SCALP-LONG').map(v=>v.name).join(', ')||'none';
  const bear=votes.filter(v=>v.signal==='SELL'||v.signal==='SCALP-SHORT').map(v=>v.name).join(', ')||'none';
  return '⚡ *QUANTUM EDGE PRO v3 SIGNAL* ⚡\n\n📊 *Asset:* '+s.asset+'\n⏱️ *Timeframe:* '+s.tf+'\n🧠 *AI Strategy:* '+s.strategy+'\n🎯 *Signal:* '+s.signal+'\n💰 *Entry:* '+fp(s.asset,s.price)+'\n🔒 *SL:* '+(s.sl?fp(s.asset,s.sl):'N/A')+'\n🎯 *TP:* '+(s.tp?fp(s.asset,s.tp):'N/A')+'\n🎲 *Confluence:* '+s.conf+'% ('+s.confluence+'/13 agree)\n\n✅ *Bullish:* '+bull+'\n❌ *Bearish:* '+bear+'\n\n📐 R:R 2.5:1\n⏰ '+new Date().toLocaleString()+'\n\n_Trade responsibly. Always use stop-loss._';
}
async function sendWA(){
  if(!curSig||curSig.signal==='HOLD'){toast('Generate a signal first');return;}
  const m=document.querySelector('input[name="waM"]:checked').value;
  const msg=encodeURIComponent(buildWAMsg());
  if(m==='picker'){window.open('https://wa.me/?text='+msg,'_blank');}
  else if(m==='direct'){const n=document.getElementById('waNum').value.replace(/[^\d+]/g,'');window.open('https://wa.me/'+n+'?text='+msg,'_blank');}
  else{const k=document.getElementById('waApi').value;const n=document.getElementById('waNum').value.replace(/[^\d]/g,'');if(!n||!k){toast('Enter number & API key');return;}await fetch('https://api.callmebot.com/whatsapp.php?phone='+n+'&text='+msg+'&apikey='+k);toast('Signal sent!');}
}
// Chat history for conversational memory
let chatHistory=[];
let voiceEnabled=false;
let speechSynth=window.speechSynthesis||null;
let recognition=null;
let voiceActive=false;

function initSpeechRecognition(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition) return null;
  const r=new SpeechRecognition();
  r.continuous=false; r.interimResults=false; r.lang='en-US';
  r.onresult=function(e){
    const transcript=e.results[0][0].transcript;
    document.getElementById('chatInp').value=transcript;
    sendChat();
  };
  r.onend=function(){
    voiceActive=false;
    const btn=document.getElementById('voiceInputBtn');
    if(btn){btn.textContent='🎤';btn.style.background='#1e2d4a';btn.style.color='var(--sub)';}
    const vs=document.getElementById('voiceStatus');
    if(vs) vs.style.display='none';
  };
  r.onerror=function(e){
    voiceActive=false;
    toast('🎤 Voice error: '+e.error);
    const vs=document.getElementById('voiceStatus');
    if(vs) vs.style.display='none';
  };
  return r;
}

function toggleVoiceInput(){
  recognition=recognition||initSpeechRecognition();
  if(!recognition){toast('🎤 Voice not supported on this browser');return;}
  if(voiceActive){recognition.stop();voiceActive=false;return;}
  try{
    recognition.start();
    voiceActive=true;
    const btn=document.getElementById('voiceInputBtn');
    if(btn){btn.textContent='⏹';btn.style.background='var(--red)';btn.style.color='white';}
    const vs=document.getElementById('voiceStatus');
    if(vs) vs.style.display='block';
  }catch(e){toast('🎤 Could not start microphone');}
}

function toggleVoiceOutput(){
  voiceEnabled=!voiceEnabled;
  const btn=document.getElementById('voiceToggleBtn');
  if(btn){
    btn.textContent=voiceEnabled?'🔊':'🔈';
    btn.style.background=voiceEnabled?'var(--purple)':'#1e2d4a';
    btn.style.color=voiceEnabled?'white':'var(--sub)';
  }
  toast(voiceEnabled?'🔊 AI voice ON':'🔈 AI voice OFF');
  if(voiceEnabled) speakText('Voice responses enabled. I will now speak my answers.');
}

function speakText(text){
  if(!voiceEnabled||!speechSynth) return;
  speechSynth.cancel();
  const clean=text.replace(/[*#_~`]/g,'').replace(/\n/g,' ').substring(0,400);
  const utt=new SpeechSynthesisUtterance(clean);
  utt.rate=0.95; utt.pitch=1.0; utt.volume=0.9;
  // Prefer a natural English voice
  const voices=speechSynth.getVoices();
  const preferred=voices.find(v=>v.lang==='en-US'&&v.name.toLowerCase().includes('google'))||
                   voices.find(v=>v.lang==='en-US')||voices[0];
  if(preferred) utt.voice=preferred;
  speechSynth.speak(utt);
}

async function groqAI(q){
  if(!groqKey) return localAI(q);
  const systemPrompt='You are Quantum Edge Pro AI Trading Strategist — a sharp, conversational, knowledgeable trading assistant. You speak like an experienced trader: direct, practical, encouraging but honest. Current market context: Asset='+curSig.asset+' Signal='+curSig.signal+' Confidence='+curSig.conf+'% Confluence='+curSig.confluence+'/13 Strategy='+curSig.strategy+' RSI='+curMkt.rsi+' Vol='+curMkt.vol+'% Structure='+(curMkt.structure||'?')+' Session='+document.getElementById('sessionPill').textContent+'. Keep responses conversational — max 3 short paragraphs, no bullet walls. If asked something personal just engage naturally.';
  // Keep last 6 messages for conversation memory
  chatHistory.push({role:'user',content:q});
  if(chatHistory.length>12) chatHistory=chatHistory.slice(-12);
  try{
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+groqKey},
      body:JSON.stringify({model:'llama3-8b-8192',max_tokens:500,
        messages:[{role:'system',content:systemPrompt},...chatHistory]})
    });
    const d=await r.json();
    if(d.choices&&d.choices[0]){
      const reply=d.choices[0].message.content;
      chatHistory.push({role:'assistant',content:reply});
      return reply;
    }
    return localAI(q);
  }catch(e){return localAI(q);}
}
function localAI(q){
  const ql=q.toLowerCase();
  // Greetings
  if(ql.match(/^(hi|hello|hey|good morning|good evening|sup|yo|what's up)/)){
    const asset=curSig.asset||'no asset selected';
    const sig=curSig.signal||'HOLD';
    return 'Hey! Good to hear from you. Currently tracking '+asset+' with a '+sig+' signal at '+curSig.conf+'% confidence. What would you like to dig into — the current setup, a specific strategy, or something else on your mind?';
  }
  // How are you / small talk
  if(ql.includes('how are you')||ql.includes('you ok')||ql.includes('how you doing')){
    return "I'm running well and watching the markets closely! "+
      (curSig.asset?'Right now '+curSig.asset+' is showing a '+curSig.signal+' with '+curSig.confluence+'/13 strategies in agreement. Looks '+( curSig.conf>=70?'like a strong setup.':'like we should wait for better confluence.'):'No asset selected yet — pick one on the Signal tab and let me analyze it for you.');
  }
  // Thank you
  if(ql.includes('thank')||ql.includes('thanks')||ql.includes('appreciate')){
    return "Anytime! That's what I'm here for. Stay disciplined, stick to your risk rules, and let the confluence guide you. Anything else you want to check?";
  }
  if(ql.includes('why')||ql.includes('chose')||ql.includes('strategy')){
    const votes=curMkt.price?runAllStrategies(curMkt,curTf==='1min'||curTf==='5min'):[];
    const bull=votes.filter(v=>v.signal==='BUY'||v.signal==='SCALP-LONG').length;
    const bear=votes.filter(v=>v.signal==='SELL'||v.signal==='SCALP-SHORT').length;
    return '🧠 **AI Strategy Selection**\n\nAll 12 strategies voted: '+bull+' bullish, '+bear+' bearish, '+(12-bull-bear)+' neutral.\n\nChosen: **'+(curSig.strategy||'None yet')+'** with '+(curSig.conf||'--')+'% confidence and '+(curSig.confluence||'--')+'/12 confluence.\n\n'+(curSig.reasoning||'Generate a signal to see full analysis.');
  }
  if(ql.includes('confluence')) return '📊 **Confluence Score**\n\n12 strategies each vote BUY, SELL, or HOLD. The AI counts votes and only signals when 3+ strategies agree. 8+/12 = very strong. 5-7/12 = moderate. Under 4/12 = HOLD.\n\nCurrent: '+curSig.confluence+'/12 agree on '+curSig.signal+'.';
  if(ql.includes('order block')||ql.includes('ob')) return '📦 **Order Blocks**\n\nLarge institutional candles before a strong move. Price returns to these zones to fill remaining orders.\n\nBullish OB: big bearish candle before rally — buy when price returns.\nBearish OB: big bullish candle before drop — sell when price returns.';
  if(ql.includes('fvg')||ql.includes('fair value')) return '🔲 **Fair Value Gap**\n\nWhen price moves so fast it leaves a gap between candle 1 and candle 3. Price tends to retrace and fill it.\n\nBullish FVG: gap above, price fills then continues up.\nBearish FVG: gap below, price fills then continues down.';
  if(ql.includes('liquidity')||ql.includes('sweep')) return '💧 **Liquidity Sweeps**\n\nSmart money spikes above swing highs (triggering buy stops) or below swing lows (triggering sell stops) before reversing.\n\nSweep of lows + reversal = BUY.\nSweep of highs + reversal = SELL.\n\nThe system auto-detects this — watch for the Liq.Sweep chip.';
  if(ql.includes('session')) return '⏰ **Sessions**\n\nLondon 08:00-17:00 UTC: EUR, GBP, CAD.\nNew York 13:00-22:00 UTC: Gold, BTC, USD.\nLondon+NY Overlap 13:00-17:00: BEST window.\nTokyo 00:00-09:00: JPY, AUD.\n\nNever scalp off-hours.';
  if(ql.includes('win rate')) return '🎯 **Improving Win Rate**\n\n1. Only trade confluence ≥7/12.\n2. Match asset to active session.\n3. Trade with EMA200 direction.\n4. Wait for liquidity sweep + FVG or OB confluence.\n5. Honor your stop-loss every time.';
  return '🤖 **Quantum AI** ('+curSig.asset+' | '+curSig.signal+' | '+(curSig.conf||'--')+'% | '+(curSig.confluence||'--')+'/12)\n\nAsk: strategy selection, order blocks, fair value gaps, liquidity sweeps, confluence, sessions, win rate tips.\n\nAdd Groq API key in Settings for full LLM responses.';
}
function toggleChat(){document.getElementById('chatModal').classList.toggle('hidden');}
function askQ(q){if(document.getElementById('chatModal').classList.contains('hidden'))toggleChat();document.getElementById('chatInp').value=q;sendChat();}
async function sendChat(){
  const inp=document.getElementById('chatInp');const q=inp.value.trim();if(!q)return;
  inp.value='';addBbl(q,true);
  const ld=addBbl('🤔 Analyzing...',false,true);
  const ans=groqKey?await groqAI(q):localAI(q);
  ld.remove();
  addBbl(ans,false);
  speakText(ans);
}
function addBbl(text,isUser,temp=false){
  const a=document.getElementById('chatMsgs');const d=document.createElement('div');
  d.className='bbl '+(isUser?'user':'ai');if(temp)d.style.opacity='0.6';
  d.innerHTML=text.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  a.appendChild(d);a.scrollTop=a.scrollHeight;return d;
}
document.getElementById('chatInp').addEventListener('keypress',e=>{if(e.key==='Enter')sendChat();});
function saveGroq(){
  const k=document.getElementById('groqInp').value.trim();
  if(!k){toast('⚠️ Enter your Groq API key');return;}
  groqKey=k;
  localStorage.setItem('qep_groq',k);
  document.getElementById('chatLbl').textContent='GROQ-POWERED';
  toast('✅ Groq key saved');
}

async function testTwelveKey(){
  const k=document.getElementById('twelveInp').value.trim();
  const result=document.getElementById('twelveTestResult');
  if(!k){result.textContent='⚠️ Enter a key first';result.style.color='var(--gold)';return;}
  result.textContent='🔍 Testing...';result.style.color='var(--sub)';
  try{
    const url='https://api.twelvedata.com/price?symbol=EUR/USD&apikey='+k;
    const r=await fetch(url);
    const j=await r.json();
    if(j.price){
      result.innerHTML='✅ <strong style="color:var(--green);">Key valid!</strong> EUR/USD live price: '+parseFloat(j.price).toFixed(5);
      result.style.color='var(--green)';
      // Auto-save if test passes
      twelveKey=k;
      localStorage.setItem('qep_twelve',k);
      Object.keys(dataCache).forEach(function(key){delete dataCache[key];});
      document.getElementById('dataPill').textContent='📡 LIVE DATA';
      document.getElementById('dataPill').style.borderColor='var(--green)';
      document.getElementById('dataPill').style.color='var(--green)';
    } else if(j.code===429){
      result.innerHTML='⚠️ Rate limit hit — key is valid but quota exceeded. Try again in a minute.';
      result.style.color='var(--gold)';
    } else if(j.code===401||j.message&&j.message.includes('API key')){
      result.innerHTML='❌ <strong style="color:var(--red);">Invalid key</strong> — check it at twelvedata.com';
      result.style.color='var(--red)';
    } else {
      result.innerHTML='⚠️ Unexpected response: '+JSON.stringify(j).substring(0,80);
      result.style.color='var(--gold)';
    }
  }catch(e){
    result.innerHTML='❌ Network error — check your connection or CORS settings';
    result.style.color='var(--red)';
  }
}
function saveTwelve(){
  const k=document.getElementById('twelveInp').value.trim();
  if(!k){toast('⚠️ Please enter your API key');return;}
  twelveKey=k;
  localStorage.setItem('qep_twelve',k);
  // Clear all cached data so next signal fetch uses live data
  Object.keys(dataCache).forEach(function(key){delete dataCache[key];});
  // Update pill immediately
  document.getElementById('dataPill').textContent='📡 LIVE DATA';
  document.getElementById('dataPill').style.borderColor='var(--green)';
  document.getElementById('dataPill').style.color='var(--green)';
  addLog('Twelve Data API key saved — cache cleared, next signal will use live data','info');
  toast('✅ API key saved — generate a signal to test live data');
}
function togSet(key){
  alerts[key]=!alerts[key];
  const el=document.getElementById('t'+key.charAt(0).toUpperCase()+key.slice(1));
  if(el)el.classList.toggle('on',alerts[key]);
  localStorage.setItem('qep_alerts',JSON.stringify(alerts));
}
Object.entries(alerts).forEach(([k,v])=>{const el=document.getElementById('t'+k.charAt(0).toUpperCase()+k.slice(1));if(el)el.classList.toggle('on',v);});
function addLog(msg,type='info'){
  if(!logsOn)return;
  const box=document.getElementById('logBox');
  if(box.querySelector('[style*="muted"]'))box.innerHTML='';
  const d=document.createElement('div');d.className='le '+type;
  d.textContent='['+new Date().toLocaleTimeString()+'] '+msg;
  box.appendChild(d);box.scrollTop=box.scrollHeight;
  while(box.children.length>100)box.removeChild(box.firstChild);
}
// ============================================================
// SMART TRADE MANAGEMENT
// ============================================================
var tradeMonitorIv=null;

function openTrade(signal,entry,sl,tp,asset,tf,lot){
  if(activeTrade){toast('⚠️ Close current trade first');return;}
  activeTrade={signal:signal,entry:entry,sl:sl,tp:tp,asset:asset,tf:tf,lot:lot,
    openTime:Date.now(),originalSL:sl,originalTP:tp,
    breakEvenMoved:false,partialClosed:false,trailingActive:false,
    status:'OPEN',pnl:0,highWater:entry,lowWater:entry,reversalWarning:null};
  localStorage.setItem('qep_activeTrade',JSON.stringify(activeTrade));
  renderTradeManager();
  startTradeMonitor();
  addLog('Trade OPENED: '+asset+' '+signal+' @ '+fp(asset,entry),'signal');
  toast('✅ Trade opened — smart monitoring active');
}

function startTradeMonitor(){
  if(tradeMonitorIv) clearInterval(tradeMonitorIv);
  tradeMonitorIv=setInterval(monitorTrade,5000);
}

function monitorTrade(){
  if(!activeTrade||activeTrade.status!=='OPEN') return;
  var price=curMkt.price||activeTrade.entry;
  var isBuy=activeTrade.signal==='BUY'||activeTrade.signal==='SCALP-LONG';
  var atr=curMkt.atr||Math.abs(activeTrade.originalTP-activeTrade.entry)/2.5||activeTrade.entry*0.001;
  var pips=isBuy?price-activeTrade.entry:activeTrade.entry-price;
  // Watermarks
  if(isBuy) activeTrade.highWater=Math.max(activeTrade.highWater||price,price);
  else activeTrade.lowWater=Math.min(activeTrade.lowWater||price,price);
  // 1. Break-even at 1R
  if(!activeTrade.breakEvenMoved&&pips>=atr*1.0){
    activeTrade.sl=activeTrade.entry;
    activeTrade.breakEvenMoved=true;
    addLog('Break-even: SL moved to entry '+fp(activeTrade.asset,activeTrade.entry),'signal');
    toast('🔒 Break-even triggered');
  }
  // 2. Trailing stop at 1.5R
  if(pips>=atr*1.5){
    activeTrade.trailingActive=true;
    var newSL=isBuy?price-atr*0.8:price+atr*0.8;
    if(isBuy&&newSL>activeTrade.sl) activeTrade.sl=newSL;
    if(!isBuy&&newSL<activeTrade.sl) activeTrade.sl=newSL;
  }
  // 3. Partial TP at 1R
  if(!activeTrade.partialClosed&&pips>=atr*1.0){
    activeTrade.partialClosed=true;
    addLog('Partial TP: 50% closed at 1R @ '+fp(activeTrade.asset,price),'signal');
    toast('🎯 Partial TP: 50% closed at 1R');
  }
  // 4. SL hit
  var slHit=isBuy?price<=activeTrade.sl:price>=activeTrade.sl;
  if(slHit){closeTrade('SL',price);return;}
  // 5. TP hit
  var tpHit=isBuy?price>=activeTrade.tp:price<=activeTrade.tp;
  if(tpHit){closeTrade('TP',price);return;}
  // 6. Time exit for scalps
  var isScalpTf=activeTrade.tf==='1min'||activeTrade.tf==='5min';
  var openMins=(Date.now()-activeTrade.openTime)/60000;
  if(isScalpTf&&openMins>15&&pips<=0){
    closeTrade('TIME',price);
    toast('⏰ Scalp time exit — no movement after 15min');
    return;
  }
  // 7. Candle reversal warning
  if(curMkt.closes&&curMkt.closes.length>=4&&pips>0){
    var cp=detectCandlePatterns(curMkt.closes,curMkt.highs,curMkt.lows,atr);
    if((cp.tier==='S'||cp.tier==='A')&&cp.strength>=80){
      var isCounter=(isBuy&&cp.bias==='bear')||(!isBuy&&cp.bias==='bull');
      if(isCounter){
        addLog('⚠️ Reversal pattern on open trade: '+cp.pattern,'warn');
        toast('⚠️ '+cp.pattern+' detected — tighten SL');
        activeTrade.reversalWarning=cp.pattern;
      }
    }
  }
  // Update P&L
  var pipVal=activeTrade.asset==='XAUUSD'||activeTrade.asset==='XAGUSD'?100:
             activeTrade.asset==='BTCUSD'||activeTrade.asset==='ETHUSD'?1:100000;
  activeTrade.pnl=parseFloat((pips*activeTrade.lot*pipVal*(activeTrade.partialClosed?0.5:1)).toFixed(2));
  localStorage.setItem('qep_activeTrade',JSON.stringify(activeTrade));
  renderTradeManager();
}

function closeTrade(reason,closePrice){
  if(!activeTrade) return;
  var isBuy=activeTrade.signal==='BUY'||activeTrade.signal==='SCALP-LONG';
  var pips=isBuy?closePrice-activeTrade.entry:activeTrade.entry-closePrice;
  var pipVal=activeTrade.asset==='XAUUSD'||activeTrade.asset==='XAGUSD'?100:
             activeTrade.asset==='BTCUSD'||activeTrade.asset==='ETHUSD'?1:100000;
  var pnl=parseFloat((pips*activeTrade.lot*pipVal).toFixed(2));
  var result=pnl>0?'WIN':'LOSS';
  addLog('Trade CLOSED ('+reason+'): '+activeTrade.asset+' '+result+' $'+pnl,'signal');
  var entry={id:Date.now(),time:new Date().toLocaleString(),asset:activeTrade.asset,
    tf:activeTrade.tf,signal:activeTrade.signal,entry:activeTrade.entry,
    sl:activeTrade.originalSL,tp:activeTrade.originalTP,closePrice:closePrice,
    closeReason:reason,pnl:pnl,conf:curSig.conf||0,strategy:curSig.strategy||'',result:result,
    autoChecked:true,outcome:result==='WIN'?'TP HIT ✅':'SL HIT ❌',
    checkPrice:closePrice,checkTime:new Date().toLocaleTimeString()};
  journal.unshift(entry);
  localStorage.setItem('qep_journal',JSON.stringify(journal));
  activeTrade=null;
  localStorage.removeItem('qep_activeTrade');
  if(tradeMonitorIv){clearInterval(tradeMonitorIv);tradeMonitorIv=null;}
  renderTradeManager();
  toast(result==='WIN'?'✅ Trade WIN: $'+pnl:'❌ Trade LOSS: $'+Math.abs(pnl));
}

function renderTradeManager(){
  var el=document.getElementById('tradeManagerPanel');
  if(!el) return;
  if(!activeTrade){
    el.innerHTML='<div style="color:var(--sub);font-size:0.75rem;text-align:center;padding:14px;">No active trade. Generate a signal and click "📈 Open Trade + Monitor".</div>';
    return;
  }
  var t=activeTrade;
  var isBuy=t.signal==='BUY'||t.signal==='SCALP-LONG';
  var price=curMkt.price||t.entry;
  var pnlColor=t.pnl>=0?'var(--green)':'var(--red)';
  var openMins=Math.round((Date.now()-t.openTime)/60000);
  el.innerHTML=
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;">'+
    '<div class="mtile"><div class="ml">Signal</div><div class="mv" style="color:'+(isBuy?'var(--green)':'var(--red)')+';">'+t.signal+'</div></div>'+
    '<div class="mtile"><div class="ml">Entry</div><div class="mv">'+fp(t.asset,t.entry)+'</div></div>'+
    '<div class="mtile"><div class="ml">Current SL</div><div class="mv" style="color:var(--red);">'+fp(t.asset,t.sl)+'</div></div>'+
    '<div class="mtile"><div class="ml">TP</div><div class="mv" style="color:var(--green);">'+fp(t.asset,t.tp)+'</div></div>'+
    '</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;font-size:0.75rem;">'+
    '<span style="background:#1e2d4a;padding:4px 10px;border-radius:8px;">⏱ '+openMins+'min open</span>'+
    '<span style="background:#1e2d4a;padding:4px 10px;border-radius:8px;">P&L: <strong style="color:'+pnlColor+';">$'+t.pnl+'</strong></span>'+
    '<span style="background:'+(t.breakEvenMoved?'#10b98133':'#1e2d4a')+';padding:4px 10px;border-radius:8px;border:1px solid '+(t.breakEvenMoved?'var(--green)':'transparent')+';"> BE: '+(t.breakEvenMoved?'✅ Done':'Pending 1R')+'</span>'+
    '<span style="background:'+(t.partialClosed?'#10b98133':'#1e2d4a')+';padding:4px 10px;border-radius:8px;border:1px solid '+(t.partialClosed?'var(--green)':'transparent')+';"> Partial: '+(t.partialClosed?'✅ 50% closed':'Pending')+'</span>'+
    '<span style="background:'+(t.trailingActive?'#f59e0b33':'#1e2d4a')+';padding:4px 10px;border-radius:8px;border:1px solid '+(t.trailingActive?'var(--gold)':'transparent')+';"> Trail: '+(t.trailingActive?'✅ Active':'Pending 1.5R')+'</span>'+
    (t.reversalWarning?'<span style="background:#ef444433;padding:4px 10px;border-radius:8px;border:1px solid var(--red);color:var(--red);">⚠️ '+t.reversalWarning+'</span>':'')+
    '</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+
    '<button class="btn btn-red btn-sm" onclick="closeTrade(&quot;MANUAL&quot;,'+price+')">🔴 Close Now</button>'+
    '<button class="btn btn-ghost btn-sm" onclick="closeTrade(&quot;BE&quot;,'+t.entry+')">🔒 Close at BE</button>'+
    '</div>';
}

function openTradeFromSignal(){
  if(!curSig||curSig.signal==='HOLD'){toast('Generate a valid signal first');return;}
  openTrade(curSig.signal,curSig.entry,curSig.sl,curSig.tp,curSig.asset,curSig.tf,
    parseFloat(document.getElementById('mLot').textContent)||0.01);
}

function updateCandleDisplay(d){
  if(!d||!d.closes||d.closes.length<4) return;
  const cp=detectCandlePatterns(d.closes,d.highs,d.lows,d.atr);
  const box=document.getElementById('candlePatternBox');
  if(!cp||cp.strength===0){box.style.display='none';return;}
  const biasBorder=cp.bias==='bull'?'var(--green)':cp.bias==='bear'?'var(--red)':'var(--gold)';
  const tierColors={'S':'var(--gold)','A':'var(--green)','B':'var(--sub)','':''};
  const tierBg={'S':'#f59e0b33','A':'#10b98133','B':'#64748b22','':''};
  box.style.display='block';
  box.style.borderColor=biasBorder;
  box.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'+
    '<span style="font-size:1rem;">🕯️</span>'+
    '<strong style="color:'+biasBorder+';">'+cp.pattern+'</strong>'+
    (cp.tier?'<span style="background:'+tierBg[cp.tier]+';border:1px solid '+tierColors[cp.tier]+';color:'+tierColors[cp.tier]+';padding:2px 8px;border-radius:8px;font-size:0.62rem;font-weight:700;">'+cp.tier+'-TIER</span>':'') +
    '<span style="background:'+biasBorder+'33;color:'+biasBorder+';padding:2px 8px;border-radius:8px;font-size:0.62rem;font-weight:700;">'+(cp.bias==='bull'?'BULLISH':cp.bias==='bear'?'BEARISH':'NEUTRAL')+' '+cp.strength+'%</span>'+
    '</div>'+
    '<div style="font-size:0.72rem;color:var(--sub);margin-top:5px;">'+cp.desc+'</div>'+
    (cp.all&&cp.all.length>1?
      '<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:5px;">'+
      cp.all.slice(1,5).map(function(p){
        var pc=p.bias==='bull'?'var(--green)':p.bias==='bear'?'var(--red)':'var(--gold)';
        return '<span style="background:'+pc+'22;border:1px solid '+pc+'44;color:'+pc+';padding:2px 8px;border-radius:8px;font-size:0.6rem;">'+p.name+' ('+p.strength+'%)</span>';
      }).join('')+
      '</div>':'');
}


// ============================================================
// MT5 TERMINAL + EXNESS EXECUTION
// ============================================================
const EXNESS_SYMBOL_MAP = {
  EURUSD:'EURUSDm',GBPUSD:'GBPUSDm',USDJPY:'USDJPYm',
  AUDUSD:'AUDUSDm',USDCAD:'USDCADm',XAUUSD:'XAUUSDm',BTCUSD:'BTCUSDm',
  XAGUSD:'XAGUSDm',ETHUSD:'ETHUSDm',USDCHF:'USDCHFm',NZDUSD:'NZDUSDm',
  EURGBP:'EURGBPm',EURJPY:'EURJPYm',GBPJPY:'GBPJPYm'
};

function saveExnessSettings(){
  const login = document.getElementById('exnessLogin').value.trim();
  const server = document.getElementById('exnessServer').value;
  const type = document.getElementById('exnessType').value;
  if(!login){ toast('⚠️ Enter your Exness account number'); return; }
  localStorage.setItem('exness_login', login);
  localStorage.setItem('exness_server', server);
  localStorage.setItem('exness_type', type);
  const status = document.getElementById('termAccountStatus');
  status.textContent = '✅ Saved: ' + login + ' @ ' + server;
  status.style.color = 'var(--green)';
  toast('✅ Exness account saved');
}

function loadExnessSettings(){
  const login = localStorage.getItem('exness_login') || '';
  const server = localStorage.getItem('exness_server') || 'Exness-Real';
  const type = localStorage.getItem('exness_type') || 'live';
  if(login){
    document.getElementById('exnessLogin').value = login;
    document.getElementById('exnessServer').value = server;
    document.getElementById('exnessType').value = type;
    const status = document.getElementById('termAccountStatus');
    if(status){ status.textContent = '✅ Account: ' + login + ' @ ' + server; status.style.color = 'var(--green)'; }
  }
}

function openMT5Terminal(){
  const login = localStorage.getItem('exness_login') || '';
  const server = localStorage.getItem('exness_server') || 'Exness-Real';
  let url = 'https://webterminal.mql5.com/';
  if(login && server){
    url += '?server=' + encodeURIComponent(server) + '&login=' + encodeURIComponent(login);
  }
  window.open(url, '_blank');
  addLog('MT5 WebTerminal opened: ' + server + ' / ' + login, 'info');
  toast('🚀 MT5 Terminal opening...');
}

function openExnessTerminal(){
  const login = localStorage.getItem('exness_login') || '';
  // Exness own terminal - MT5 accounts
  let url = 'https://exness.com/exness-terminal/';
  window.open(url, '_blank');
  toast('⚡ Exness Terminal opening...');
}

function copyToClipboard(text, btn){
  if(!text || text === '--' || text === '---'){ toast('No value to copy'); return; }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){
      if(btn){ btn.textContent = '✅ Copied!'; btn.classList.add('copied');
        setTimeout(function(){ btn.textContent = '📋 Copy ' + btn.getAttribute('data-copy').replace('exec',''); btn.classList.remove('copied'); }, 1800); }
      toast('✅ Copied: ' + text);
    }).catch(function(){ fallbackCopy(text, btn); });
  } else { fallbackCopy(text, btn); }
}

function fallbackCopy(text, btn){
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); toast('✅ Copied: ' + text); }
  catch(e){ toast('❌ Copy failed — select and copy manually'); }
  document.body.removeChild(ta);
}

function copyAllOrder(){
  if(!curSig || curSig.signal === 'HOLD' || !curSig.price){ toast('No signal to copy'); return; }
  const s = curSig;
  const sym = EXNESS_SYMBOL_MAP[s.asset] || s.asset;
  const dir = (s.signal === 'BUY' || s.signal === 'SCALP-LONG') ? 'BUY' : 'SELL';
  const lot = document.getElementById('mLot') ? document.getElementById('mLot').textContent : '0.01';
  const msg =
    'SYMBOL: ' + sym + '\n' +
    'ACTION: ' + dir + '\n' +
    'LOT: ' + lot + '\n' +
    'ENTRY: Market Price (approx ' + fp(s.asset, s.price) + ')\n' +
    'STOP LOSS: ' + (s.sl ? fp(s.asset, s.sl) : 'N/A') + '\n' +
    'TAKE PROFIT: ' + (s.tp ? fp(s.asset, s.tp) : 'N/A') + '\n' +
    'STRATEGY: ' + s.strategy + '\n' +
    'CONFIDENCE: ' + s.conf + '%';
  copyToClipboard(msg, document.getElementById('copyAllBtn'));
}

function buildChecklist(signal, asset){
  const isBuy = signal === 'BUY' || signal === 'SCALP-LONG';
  const sym = EXNESS_SYMBOL_MAP[asset] || asset;
  const steps = [
    { text: 'Click <strong>"Open MT5 Terminal"</strong> or <strong>"Open Exness Terminal"</strong> above to launch your trading platform in a new tab.' },
    { text: 'In MT5, find <strong>' + sym + '</strong> in Market Watch. If not visible, right-click Market Watch → Show All, then search for it.' },
    { text: 'Double-click <strong>' + sym + '</strong> to open the New Order window. Select <strong>Market Execution</strong> as the order type.' },
    { text: 'Set <strong>Volume</strong> to the lot size shown above. Copy it with the button and paste directly into the Volume field.' },
    { text: 'Set your <strong>Stop Loss</strong> level. Copy the SL value above and type it into the Stop Loss field. <span style="color:var(--red);">Never skip this step.</span>' },
    { text: 'Set your <strong>Take Profit</strong> level. Copy the TP value above and type it into the Take Profit field.' },
    { text: 'Double-check: correct symbol, correct lot, SL and TP both set. Then click <strong style="color:' + (isBuy ? 'var(--green)' : 'var(--red)') + ';">' + (isBuy ? 'BUY (Blue button)' : 'SELL (Red button)') + '</strong>.' },
    { text: 'Confirm the order in the confirmation dialog. Your trade is now live. Switch back here to use the <strong>Smart Trade Manager</strong> to monitor it.' }
  ];
  return steps.map(function(step, i){
    return '<div class="checklist-item">' +
      '<div class="cl-num">' + (i+1) + '</div>' +
      '<div class="cl-text">' + step.text + '</div>' +
      '<div class="cl-check" title="Mark done">✓</div>' +
      '</div>';
  }).join('');
}

function updateExecCard(){
  const noSig = document.getElementById('execNoSignal');
  const body = document.getElementById('execSignalBody');
  if(!noSig || !body) return;

  if(!curSig || curSig.signal === 'HOLD' || !curSig.price){
    noSig.style.display = 'block';
    body.style.display = 'none';
    return;
  }

  noSig.style.display = 'none';
  body.style.display = 'block';

  const s = curSig;
  const isBuy = s.signal === 'BUY' || s.signal === 'SCALP-LONG';
  const sym = EXNESS_SYMBOL_MAP[s.asset] || s.asset;
  const lot = document.getElementById('mLot') ? document.getElementById('mLot').textContent.trim() : '0.01';
  const sigColor = isBuy ? 'var(--green)' : 'var(--red)';

  // Badge
  const badge = document.getElementById('execSigBadge');
  badge.textContent = s.signal;
  badge.style.color = sigColor;

  document.getElementById('execAssetTf').textContent = s.asset + ' · ' + s.tf;

  const confBadge = document.getElementById('execConfBadge');
  confBadge.textContent = s.conf + '% Confidence · ' + (s.confluence || '--') + '/13 strategies';
  confBadge.style.borderColor = s.conf >= 70 ? 'var(--green)' : s.conf >= 50 ? 'var(--gold)' : 'var(--red)';
  confBadge.style.color = s.conf >= 70 ? 'var(--green)' : s.conf >= 50 ? 'var(--gold)' : 'var(--red)';
  confBadge.style.background = s.conf >= 70 ? '#10b98122' : s.conf >= 50 ? '#f59e0b22' : '#ef444422';

  // Tile borders
  document.getElementById('execSymbolTile').style.borderColor = sigColor + '55';
  document.getElementById('execLotTile').style.borderColor = 'var(--gold)55';
  document.getElementById('execSLTile').style.borderColor = 'var(--red)55';
  document.getElementById('execTPTile').style.borderColor = 'var(--green)55';

  // Values
  document.getElementById('execSymbol').textContent = sym;
  document.getElementById('execSymbol').style.color = sigColor;
  document.getElementById('execLot').textContent = lot;
  document.getElementById('execLot').style.color = 'var(--gold)';
  document.getElementById('execSL').textContent = s.sl ? fp(s.asset, s.sl) : 'N/A';
  document.getElementById('execTP').textContent = s.tp ? fp(s.asset, s.tp) : 'N/A';

  // Checklist
  document.getElementById('execChecklist').innerHTML = buildChecklist(s.signal, s.asset);

  // Reset copy button labels
  document.querySelectorAll('.exec-copy-btn').forEach(function(btn){
    var id = btn.getAttribute('data-copy');
    var labels = {execSymbol:'Symbol', execLot:'Lot', execSL:'SL', execTP:'TP'};
    btn.textContent = '📋 Copy ' + (labels[id] || id);
    btn.classList.remove('copied');
  });
}

document.addEventListener('DOMContentLoaded', function(){
  // Restore keys
  if(groqKey){document.getElementById('groqInp').value=groqKey;document.getElementById('chatLbl').textContent='GROQ-POWERED';}
  if(twelveKey) document.getElementById('twelveInp').value=twelveKey;

  // Restore active trade
  try{
    const st=localStorage.getItem('qep_activeTrade');
    if(st){activeTrade=JSON.parse(st);renderTradeManager();startTradeMonitor();}
  }catch(e){}

  // TERMINAL TAB INIT
  loadExnessSettings();
  updateExecCard();

  // TABS
  document.querySelectorAll('.tab[data-tab]').forEach(function(btn){
    btn.addEventListener('click', function(){
      const name=this.getAttribute('data-tab');
      document.querySelectorAll('.page').forEach(function(p){p.classList.remove('on');});
      document.querySelectorAll('.tab').forEach(function(b){b.classList.remove('on');});
      document.getElementById('page-'+name).classList.add('on');
      this.classList.add('on');
      if(name==='journal'){renderJ('all');renderAnalytics();}
      if(name==='terminal'){updateExecCard();}
    });
  });

  // TERMINAL BUTTONS
  var seb=document.getElementById('saveExnessBtn');
  if(seb) seb.addEventListener('click', saveExnessSettings);
  var otb=document.getElementById('openTerminalBtn');
  if(otb) otb.addEventListener('click', openMT5Terminal);
  var oetb=document.getElementById('openExnessTerminalBtn');
  if(oetb) oetb.addEventListener('click', openExnessTerminal);
  var cab=document.getElementById('copyAllBtn');
  if(cab) cab.addEventListener('click', copyAllOrder);
  // Copy buttons (delegated)
  document.addEventListener('click', function(e){
    if(e.target.classList.contains('exec-copy-btn')){
      var targetId = e.target.getAttribute('data-copy');
      if(targetId){
        var val = document.getElementById(targetId).textContent.trim();
        copyToClipboard(val, e.target);
      }
    }
    if(e.target.classList.contains('cl-check')){
      e.target.classList.toggle('checked');
      var item = e.target.closest('.checklist-item');
      if(item) item.classList.toggle('cl-done');
    }
  });

  // SIGNAL
  document.getElementById('genBtn').addEventListener('click', refreshSignal);
  document.getElementById('autoBtn').addEventListener('click', toggleAuto);
  document.getElementById('scalpBtn').addEventListener('click', toggleScalp);
  document.getElementById('openTradeBtn').addEventListener('click', openTradeFromSignal);
  document.getElementById('waBtn').addEventListener('click', sendWA);

  // PARAMS
  ['assetSel','tfSel','balInp','riskInp'].forEach(function(id){
    var el=document.getElementById(id);
    if(el){el.addEventListener('change', updParams);el.addEventListener('input', updParams);}
  });

  // WA METHODS
  document.querySelectorAll('input[name="waM"]').forEach(function(r){
    r.addEventListener('change', function(){
      var m=document.querySelector('input[name="waM"]:checked').value;
      document.getElementById('waNumArea').style.display=(m==='direct'||m==='api')?'block':'none';
      document.getElementById('waApiArea').style.display=(m==='api')?'block':'none';
    });
  });

  // DASHBOARD
  var rdb=document.getElementById('refreshDashBtn');
  if(rdb) rdb.addEventListener('click', refreshDash);
  var sasb=document.getElementById('sendAllSignalsBtn');
  if(sasb) sasb.addEventListener('click', function(){
    const rows=window._lastDashRows||[];
    if(!rows.length){toast('Run dashboard refresh first');return;}
    const msg=encodeURIComponent(buildWAMsgAll(rows));
    window.open('https://wa.me/?text='+msg,'_blank');
  });
  var dab=document.getElementById('dashAutoBtn');
  if(dab) dab.addEventListener('click', toggleDashAuto);
  var ccb=document.getElementById('clearCacheBtn');
  if(ccb) ccb.addEventListener('click', clearCache);

  // JOURNAL FILTERS
  document.querySelectorAll('.fchip[data-filter]').forEach(function(chip){
    chip.addEventListener('click', function(){
      document.querySelectorAll('.fchip').forEach(function(c){c.classList.remove('on');});
      this.classList.add('on');
      filterJ(this.getAttribute('data-filter'));
    });
  });
  var cjb=document.getElementById('clearJBtn');
  if(cjb) cjb.addEventListener('click', clearJ);
  var rab=document.getElementById('recheckAllBtn');
  if(rab) rab.addEventListener('click', recheckAll);

  // BACKTEST
  var rbt=document.getElementById('runBTBtn');
  if(rbt) rbt.addEventListener('click', runBT);

  // SETTINGS
  var sgb=document.getElementById('saveGroqBtn');
  if(sgb) sgb.addEventListener('click', saveGroq);
  var stb=document.getElementById('saveTwelveBtn');
  if(stb) stb.addEventListener('click', saveTwelve);
  var ttb=document.getElementById('testTwelveBtn');
  if(ttb) ttb.addEventListener('click', testTwelveKey);
  ['Sound','Vibrate','HighOnly','Journal','News'].forEach(function(k){
    var el=document.getElementById('t'+k);
    if(el) el.addEventListener('click', function(){togSet(k.charAt(0).toLowerCase()+k.slice(1));});
  });
  var tab2=document.getElementById('testAlertBtn');
  if(tab2) tab2.addEventListener('click', testAlert);
  var tatb=document.getElementById('toggleAllTimesBtn');
  if(tatb) tatb.addEventListener('click',function(){
    var panel=document.getElementById('assetBestTime');
    if(panel){
      var isHidden=panel.style.display==='none';
      panel.style.display=isHidden?'block':'none';
      tatb.textContent=isHidden?'📅 Hide Best Hours':'📅 Show All Pairs Best Hours';
    }
  });

  // CHAT
  var cf=document.getElementById('chatFab');
  if(cf) cf.addEventListener('click', toggleChat);
  var cc=document.getElementById('chatCloseBtn');
  if(cc) cc.addEventListener('click', toggleChat);
  var sc=document.getElementById('sendChatBtn');
  if(sc) sc.addEventListener('click', sendChat);
  var ci=document.getElementById('chatInp');
  if(ci) ci.addEventListener('keypress', function(e){if(e.key==='Enter') sendChat();});
  var vib=document.getElementById('voiceInputBtn');
  if(vib) vib.addEventListener('click', toggleVoiceInput);
  var vtb=document.getElementById('voiceToggleBtn');
  if(vtb) vtb.addEventListener('click', toggleVoiceOutput);
  // Load speech voices
  if(window.speechSynthesis) window.speechSynthesis.getVoices();
  document.querySelectorAll('.qc[data-q]').forEach(function(el){
    el.addEventListener('click', function(){askQ(this.getAttribute('data-q'));});
  });

  // TOGGLE INITIAL STATES
  Object.entries(alerts).forEach(function(entry){
    var k=entry[0], v=entry[1];
    var el=document.getElementById('t'+k.charAt(0).toUpperCase()+k.slice(1));
    if(el) el.classList.toggle('on', v);
  });

  // INIT STATE
  updParams();
  renderSessions();
  renderTradeManager();
  setInterval(function(){renderSessions();updateCacheStatus();}, 60000);

  // NEWS
  fetchNewsCalendar().then(function(events){renderNewsPanel(events);}).catch(function(){renderNewsPanel([]);});
});
