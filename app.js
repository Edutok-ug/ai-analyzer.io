// ========== QUANTUM EDGE PRO - WITH ENTRY CONFIDENCE & TRADING PSYCHOLOGY ==========

// Global state
let currentAsset = "", currentTf = "", accountBalance = null, riskPercent = null;
let groqApiKey = "", twelveApiKey = "";
let autoInterval = null, tvWidget = null, scalpInterval = null;
let logsEnabled = false;
let currentMarketSnapshot = { price: 0, rsi: 50, atr: 0, macdHist: 0, volatility: 0 };
let currentSignalData = { signal: "HOLD", price: 0, entry: 0, stopLoss: null, takeProfit: null, confidence: 0, confidenceLevel: "Low", reasoning: "", asset: "", timeframe: "" };
let scalpingData = { scalpLong: null, scalpShort: null, flipLong: null, flipShort: null };

function showToast(msg) { 
    const toast = document.createElement('div'); 
    toast.className = 'toast-msg'; 
    toast.innerText = msg; 
    document.body.appendChild(toast); 
    setTimeout(() => toast.remove(), 2500); 
}

function addLog(msg, type='info') { 
    if(!logsEnabled) return; 
    const logDiv = document.getElementById('logArea'); 
    if(logDiv.classList.contains('empty')) { 
        logDiv.classList.remove('empty'); 
        logDiv.innerHTML = ''; 
    } 
    const entry = document.createElement('div'); 
    entry.style.padding = '6px 0'; 
    entry.style.borderBottom = '1px solid #1e293b'; 
    entry.style.fontSize = '0.75rem'; 
    const time = new Date().toLocaleTimeString(); 
    const icons = { signal: '🎯', error: '❌', success: '✅', warning: '⚠️', info: '🔹', send: '📨', scalp: '⚡', flip: '🔄', confidence: '🎲' }; 
    entry.innerHTML = `[${time}] ${icons[type] || '🔹'} ${msg}`; 
    logDiv.appendChild(entry); 
    entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); 
    while(logDiv.children.length > 80) logDiv.removeChild(logDiv.firstChild); 
}

function areAllParametersSelected() {
    const asset = document.getElementById('assetSelect').value;
    const tf = document.getElementById('timeframeSelect').value;
    const balance = document.getElementById('accountBalance').value;
    const risk = document.getElementById('riskPercent').value;
    const all = asset && tf && balance && parseFloat(balance) > 0 && risk && parseFloat(risk) > 0;
    
    document.getElementById('generateSignalBtn').disabled = !all;
    document.getElementById('autoRefreshBtn').disabled = !all;
    document.getElementById('scalpModeBtn').disabled = !all;
    
    const sendBtn = document.getElementById('sendSignalToWhatsAppBtn');
    if(all && currentSignalData.signal !== "HOLD" && currentSignalData.price > 0) sendBtn.disabled = false;
    else sendBtn.disabled = true;
    
    if(all) { 
        if(!logsEnabled) { logsEnabled = true; addLog("✅ Parameters ready", "success"); } 
        document.getElementById('paramsWarning').innerHTML = ''; 
    } else { 
        let missing = []; 
        if(!asset) missing.push("Asset"); 
        if(!tf) missing.push("Timeframe"); 
        if(!balance || parseFloat(balance) <= 0) missing.push("Balance"); 
        if(!risk || parseFloat(risk) <= 0) missing.push("Risk %"); 
        document.getElementById('paramsWarning').innerHTML = `⚠️ ${missing.join(", ")}`; 
        logsEnabled = false; 
        const logDiv = document.getElementById('logArea'); 
        logDiv.innerHTML = ''; 
        logDiv.classList.add('empty'); 
    }
    return all;
}

function updateParams() { 
    currentAsset = document.getElementById('assetSelect').value; 
    currentTf = document.getElementById('timeframeSelect').value; 
    accountBalance = parseFloat(document.getElementById('accountBalance').value); 
    riskPercent = parseFloat(document.getElementById('riskPercent').value); 
    areAllParametersSelected(); 
}

async function fetchRealTimeData(asset, tf) {
    const symbolMap = { XAUUSD: "XAU/USD", BTCUSD: "BTC/USD", EURUSD: "EUR/USD", GBPUSD: "GBP/USD", NASDAQ: "NDX" };
    let interval = tf === "1min" ? "1min" : (tf === "5min" ? "5min" : (tf === "1day" ? "1day" : (tf === "4h" ? "4h" : (tf === "1h" ? "1h" : "15min"))));
    
    if(!twelveApiKey) { 
        addLog("Using simulated data", "warning"); 
        return generateSimulatedData(asset); 
    }
    
    try {
        const url = `https://api.twelvedata.com/time_series?symbol=${symbolMap[asset]}&interval=${interval}&outputsize=50&apikey=${twelveApiKey}`;
        const resp = await fetch(url); 
        const json = await resp.json();
        if(!json.values || json.values.length < 20) throw new Error();
        
        let closes = [], highs = [], lows = [];
        for(let i = json.values.length - 1; i >= 0; i--) { 
            closes.push(parseFloat(json.values[i].close)); 
            highs.push(parseFloat(json.values[i].high)); 
            lows.push(parseFloat(json.values[i].low)); 
        }
        
        const price = closes[closes.length - 1];
        let gains = 0, losses = 0; 
        for(let i = closes.length - 14; i < closes.length - 1; i++) { 
            let diff = closes[i + 1] - closes[i]; 
            if(diff >= 0) gains += diff; 
            else losses -= diff; 
        }
        let rs = (gains / 14) / ((losses / 14) || 0.01); 
        let rsi = parseFloat((100 - 100 / (1 + rs)).toFixed(1));
        
        let tr = []; 
        for(let i = 1; i < highs.length; i++) {
            tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
        }
        let atr = tr.slice(0,14).reduce((a,b) => a + b, 0) / 14; 
        for(let i = 14; i < tr.length; i++) atr = (atr * 13 + tr[i]) / 14;
        atr = parseFloat(atr.toFixed(asset === 'BTCUSD' ? 0 : 2));
        
        let ema12 = closes.slice(-12).reduce((a,b) => a + b, 0) / 12;
        let ema26 = closes.slice(-26).reduce((a,b) => a + b, 0) / 26;
        let macdHist = (ema12 - ema26) * 0.5;
        
        let returns = [];
        for(let i = 1; i < closes.length; i++) returns.push((closes[i] - closes[i-1]) / closes[i-1]);
        let mean = returns.reduce((a,b) => a + b, 0) / returns.length;
        let variance = returns.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        let volatility = Math.sqrt(variance) * 100;
        
        return { price, rsi, atr, macdHist, volatility };
    } catch(e) { 
        addLog(`Twelve Data error: using simulated`, "warning"); 
        return generateSimulatedData(asset); 
    }
}

function generateSimulatedData(asset) { 
    let base = asset === 'XAUUSD' ? 2380 : (asset === 'BTCUSD' ? 63500 : (asset === 'EURUSD' ? 1.089 : (asset === 'GBPUSD' ? 1.278 : 16200)));
    let price = base + (Math.random() - 0.5) * base * 0.006; 
    let rsi = 45 + Math.random() * 30; 
    let atr = asset === 'BTCUSD' ? 1000 : base * 0.007;
    let volatility = 5 + Math.random() * 25;
    return { price, rsi: parseFloat(rsi.toFixed(1)), atr: parseFloat(atr.toFixed(asset === 'BTCUSD' ? 0 : 2)), macdHist: (Math.random() - 0.5) * 0.6, volatility };
}

function calculateConfidenceScore(rsi, macd, signal, atr, volatility) {
    let score = 50;
    
    if (signal === "BUY" && rsi > 45 && rsi < 65) score += 15;
    else if (signal === "SELL" && rsi > 35 && rsi < 55) score += 15;
    else if (rsi > 70 || rsi < 30) score -= 20;
    
    if (signal === "BUY" && macd > 0) score += 15;
    else if (signal === "SELL" && macd < 0) score += 15;
    else if ((signal === "BUY" && macd < -0.2) || (signal === "SELL" && macd > 0.2)) score -= 10;
    
    if (volatility > 8 && volatility < 20) score += 10;
    else if (volatility > 25) score -= 15;
    else if (volatility < 5) score -= 10;
    
    if (signal === "HOLD") score = 30;
    else if (signal === "BUY" || signal === "SELL") score += 10;
    
    score = Math.min(100, Math.max(0, Math.round(score)));
    
    let level = "Low";
    if (score >= 70) level = "High";
    else if (score >= 50) level = "Medium";
    
    return { score, level };
}

function calculateScalpingSignals(data, asset) {
    const rsi = data.rsi;
    const price = data.price;
    const atr = data.atr;
    const macd = data.macdHist;
    
    let scalpLong = null, scalpShort = null;
    let scalpLongEntry = null, scalpLongTarget = null;
    let scalpShortEntry = null, scalpShortTarget = null;
    
    if (rsi < 35 || (macd > 0 && rsi < 45)) {
        scalpLong = "READY";
        scalpLongEntry = price;
        scalpLongTarget = price + (atr * 0.8);
    } else if (rsi < 45 && macd > -0.1) {
        scalpLong = "WATCH";
        scalpLongEntry = price - (atr * 0.3);
        scalpLongTarget = price + (atr * 0.6);
    } else {
        scalpLong = "HOLD";
    }
    
    if (rsi > 65 || (macd < 0 && rsi > 55)) {
        scalpShort = "READY";
        scalpShortEntry = price;
        scalpShortTarget = price - (atr * 0.8);
    } else if (rsi > 55 && macd < 0.1) {
        scalpShort = "WATCH";
        scalpShortEntry = price + (atr * 0.3);
        scalpShortTarget = price - (atr * 0.6);
    } else {
        scalpShort = "HOLD";
    }
    
    let flipLong = null, flipShort = null;
    let flipLongEntry = null, flipLongTarget = null;
    let flipShortEntry = null, flipShortTarget = null;
    
    if (rsi < 30) {
        flipLong = "🔥 FLIP READY";
        flipLongEntry = price;
        flipLongTarget = price + (atr * 2);
    } else if (rsi < 35 && macd > -0.2) {
        flipLong = "⚠️ WATCH";
        flipLongEntry = price - (atr * 0.5);
        flipLongTarget = price + (atr * 1.5);
    } else {
        flipLong = "HOLD";
    }
    
    if (rsi > 70) {
        flipShort = "🔥 FLIP READY";
        flipShortEntry = price;
        flipShortTarget = price - (atr * 2);
    } else if (rsi > 65 && macd < 0.2) {
        flipShort = "⚠️ WATCH";
        flipShortEntry = price + (atr * 0.5);
        flipShortTarget = price - (atr * 1.5);
    } else {
        flipShort = "HOLD";
    }
    
    return { scalpLong, scalpShort, flipLong, flipShort, scalpLongEntry, scalpLongTarget, scalpShortEntry, scalpShortTarget, flipLongEntry, flipLongTarget, flipShortEntry, flipShortTarget };
}

function updateVolatilityDisplay(volatility) {
    const volElem = document.getElementById('volatilityValue');
    const badgeElem = document.getElementById('volatilityBadge');
    volElem.innerHTML = volatility.toFixed(2) + '%';
    
    if (volatility > 20) {
        badgeElem.className = 'volatility-badge volatility-high';
        badgeElem.innerHTML = 'HIGH VOLATILITY ⚠️';
    } else if (volatility > 12) {
        badgeElem.className = 'volatility-badge volatility-medium';
        badgeElem.innerHTML = 'MEDIUM VOLATILITY ⚡';
    } else {
        badgeElem.className = 'volatility-badge volatility-low';
        badgeElem.innerHTML = 'LOW VOLATILITY ✓';
    }
}

async function refreshSignal() {
    if(!areAllParametersSelected()) return;
    addLog(`Fetching real-time ${currentAsset} (${currentTf})...`, "info");
    const data = await fetchRealTimeData(currentAsset, currentTf);
    if(!data) return;
    
    currentMarketSnapshot = { price: data.price, rsi: data.rsi, atr: data.atr, macdHist: data.macdHist, volatility: data.volatility };
    const priceFormatted = currentAsset === 'BTCUSD' ? `$${data.price.toFixed(0)}` : `$${data.price.toFixed(2)}`;
    
    document.getElementById('currentPrice').innerHTML = priceFormatted;
    document.getElementById('rsiValue').innerHTML = data.rsi;
    document.getElementById('atrValue').innerHTML = currentAsset === 'BTCUSD' ? `$${data.atr.toFixed(0)}` : `$${data.atr.toFixed(2)}`;
    updateVolatilityDisplay(data.volatility);
    
    let signal = "HOLD", reasoning = "";
    if(data.rsi > 52 && data.macdHist > 0) signal = "BUY"; 
    else if(data.rsi < 48 && data.macdHist < 0) signal = "SELL";
    
    const confidence = calculateConfidenceScore(data.rsi, data.macdHist, signal, data.atr, data.volatility);
    
    reasoning = `${signal} | RSI:${data.rsi.toFixed(0)} MACD:${data.macdHist?.toFixed(3)} | Conf:${confidence.score}% (${confidence.level}) | Vol:${data.volatility.toFixed(1)}%`;
    
    const stopLoss = signal === 'BUY' ? data.price - data.atr * 1.5 : (signal === 'SELL' ? data.price + data.atr * 1.5 : null);
    const takeProfit = signal === 'BUY' ? data.price + data.atr * 4.5 : (signal === 'SELL' ? data.price - data.atr * 4.5 : null);
    
    let lotSize = 0, riskAmt = 0, rewardAmt = 0;
    if(stopLoss && accountBalance) { 
        let riskPerUnit = Math.abs(data.price - stopLoss); 
        let riskDollars = (riskPercent / 100) * accountBalance; 
        let raw = riskDollars / riskPerUnit; 
        lotSize = Math.min(5, Math.max(0.01, parseFloat((currentAsset === 'XAUUSD' ? raw / 100 : currentAsset === 'BTCUSD' ? raw / riskPerUnit : currentAsset === 'NASDAQ' ? raw / 1000 : raw / 100000).toFixed(2)))); 
        riskAmt = lotSize * riskPerUnit; 
        rewardAmt = riskAmt * 3; 
    }
    
    currentSignalData = { signal, price: data.price, entry: data.price, stopLoss, takeProfit, confidence: confidence.score, confidenceLevel: confidence.level, reasoning, asset: currentAsset, timeframe: currentTf };
    
    document.getElementById('signalMain').className = `signal-badge ${signal}`; 
    document.getElementById('signalMain').innerHTML = signal;
    document.getElementById('entryPrice').innerHTML = priceFormatted; 
    document.getElementById('confidenceScore').innerHTML = `${confidence.score}%`;
    document.getElementById('confidenceFill').style.width = `${confidence.score}%`;
    
    document.getElementById('chatConfidenceScore').innerHTML = `${confidence.score}%`;
    let adviceText = "";
    if (confidence.score >= 70) adviceText = "✅ High confidence - Good entry opportunity!";
    else if (confidence.score >= 50) adviceText = "⚠️ Medium confidence - Consider waiting for confirmation";
    else adviceText = "❌ Low confidence - Better to stay aside or reduce position size";
    document.getElementById('chatConfidenceAdvice').innerHTML = adviceText;
    
    document.getElementById('maxLotSize').innerHTML = lotSize.toFixed(2); 
    document.getElementById('riskAmount').innerHTML = riskAmt.toFixed(2); 
    document.getElementById('rewardAmount').innerHTML = rewardAmt.toFixed(2);
    
    if(stopLoss) document.getElementById('stopLossValue').innerHTML = currentAsset === 'BTCUSD' ? `$${stopLoss.toFixed(0)}` : `$${stopLoss.toFixed(2)}`;
    if(takeProfit) document.getElementById('takeProfitValue').innerHTML = currentAsset === 'BTCUSD' ? `$${takeProfit.toFixed(0)}` : `$${takeProfit.toFixed(2)}`;
    
    document.getElementById('reasoningText').innerHTML = `🧠 ${reasoning} | 3:1 R:R`;
    document.getElementById('assetNameDisplay').innerHTML = currentAsset; 
    document.getElementById('timeframeDisplay').innerHTML = ` • ${currentTf}`;
    
    const scalpSignals = calculateScalpingSignals(data, currentAsset);
    scalpingData = scalpSignals;
    
    document.getElementById('scalpLongSignal').innerHTML = scalpSignals.scalpLong || "--";
    document.getElementById('scalpShortSignal').innerHTML = scalpSignals.scalpShort || "--";
    document.getElementById('flipLongSignal').innerHTML = scalpSignals.flipLong || "--";
    document.getElementById('flipShortSignal').innerHTML = scalpSignals.flipShort || "--";
    
    if(scalpSignals.scalpLongEntry) document.getElementById('scalpLongEntry').innerHTML = `Entry: ${currentAsset === 'BTCUSD' ? `$${scalpSignals.scalpLongEntry.toFixed(0)}` : `$${scalpSignals.scalpLongEntry.toFixed(2)}`}`;
    if(scalpSignals.scalpLongTarget) document.getElementById('scalpLongTarget').innerHTML = `Target: ${currentAsset === 'BTCUSD' ? `$${scalpSignals.scalpLongTarget.toFixed(0)}` : `$${scalpSignals.scalpLongTarget.toFixed(2)}`}`;
    if(scalpSignals.scalpShortEntry) document.getElementById('scalpShortEntry').innerHTML = `Entry: ${currentAsset === 'BTCUSD' ? `$${scalpSignals.scalpShortEntry.toFixed(0)}` : `$${scalpSignals.scalpShortEntry.toFixed(2)}`}`;
    if(scalpSignals.scalpShortTarget) document.getElementById('scalpShortTarget').innerHTML = `Target: ${currentAsset === 'BTCUSD' ? `$${scalpSignals.scalpShortTarget.toFixed(0)}` : `$${scalpSignals.scalpShortTarget.toFixed(2)}`}`;
    if(scalpSignals.flipLongEntry) document.getElementById('flipLongEntry').innerHTML = `Entry: ${currentAsset === 'BTCUSD' ? `$${scalpSignals.flipLongEntry.toFixed(0)}` : `$${scalpSignals.flipLongEntry.toFixed(2)}`}`;
    if(scalpSignals.flipLongTarget) document.getElementById('flipLongTarget').innerHTML = `Target: ${currentAsset === 'BTCUSD' ? `$${scalpSignals.flipLongTarget.toFixed(0)}` : `$${scalpSignals.flipLongTarget.toFixed(2)}`}`;
    if(scalpSignals.flipShortEntry) document.getElementById('flipShortEntry').innerHTML = `Entry: ${currentAsset === 'BTCUSD' ? `$${scalpSignals.flipShortEntry.toFixed(0)}` : `$${scalpSignals.flipShortEntry.toFixed(2)}`}`;
    if(scalpSignals.flipShortTarget) document.getElementById('flipShortTarget').innerHTML = `Target: ${currentAsset === 'BTCUSD' ? `$${scalpSignals.flipShortTarget.toFixed(0)}` : `$${scalpSignals.flipShortTarget.toFixed(2)}`}`;
    
    addLog(`${currentAsset} | ${signal} @ ${priceFormatted} | Confidence: ${confidence.score}% (${confidence.level}) | Scalp: ${scalpSignals.scalpLong || 'Hold'}/${scalpSignals.scalpShort || 'Hold'}`, "confidence");
    updateChart();
    
    const sendBtn = document.getElementById('sendSignalToWhatsAppBtn');
    if(signal !== "HOLD") sendBtn.disabled = false; 
    else sendBtn.disabled = true;
}

function startScalpingMode() {
    if(scalpInterval) {
        clearInterval(scalpInterval);
        scalpInterval = null;
        addLog("Scalping mode stopped", "info");
        showToast("Scalping mode stopped");
    } else {
        scalpInterval = setInterval(() => {
            if(currentAsset && currentTf) refreshSignal();
        }, 30000);
        addLog("⚡ Scalping mode ACTIVE - Updates every 30 seconds", "scalp");
        showToast("Scalping mode activated! Fast entries enabled.");
    }
    const btn = document.getElementById('scalpModeBtn');
    btn.innerHTML = scalpInterval ? "⏹️ STOP SCALP" : "⚡ SCALP MODE";
    btn.style.background = scalpInterval ? "#ef4444" : "#f59e0b";
}

function updateChart() { 
    if(!currentAsset) return; 
    const tvMap = { XAUUSD: "OANDA:XAUUSD", BTCUSD: "BITSTAMP:BTCUSD", EURUSD: "FX:EURUSD", GBPUSD: "FX:GBPUSD", NASDAQ: "NASDAQ:IXIC" }; 
    if(tvWidget) try { tvWidget.remove(); } catch(e) {} 
    document.getElementById('tv-chart-container').innerHTML = ''; 
    if(tvMap[currentAsset] && currentTf) { 
        const intMap = { "1min": "1", "5min": "5", "15min": "15", "1h": "60", "4h": "240", "1day": "1D" }; 
        tvWidget = new TradingView.widget({
            width: '100%', height: 420, symbol: tvMap[currentAsset], 
            interval: intMap[currentTf] || "60", theme: 'dark', style: '1', 
            locale: 'en', container_id: 'tv-chart-container', 
            studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies']
        }); 
    } 
}

function formatWhatsAppMessage() {
    const s = currentSignalData;
    const emoji = s.signal === "BUY" ? "🚀 BUY" : (s.signal === "SELL" ? "📉 SELL" : "⏸️ HOLD");
    const priceFormatted = s.asset === 'BTCUSD' ? `$${s.price.toFixed(0)}` : `$${s.price.toFixed(2)}`;
    const slFormatted = s.stopLoss ? (s.asset === 'BTCUSD' ? `$${s.stopLoss.toFixed(0)}` : `$${s.stopLoss.toFixed(2)}`) : 'N/A';
    const tpFormatted = s.takeProfit ? (s.asset === 'BTCUSD' ? `$${s.takeProfit.toFixed(0)}` : `$${s.takeProfit.toFixed(2)}`) : 'N/A';
    
    let confidenceMsg = "";
    if (s.confidence >= 70) confidenceMsg = "✅ HIGH CONFIDENCE - Good entry opportunity";
    else if (s.confidence >= 50) confidenceMsg = "⚠️ MEDIUM CONFIDENCE - Wait for confirmation";
    else confidenceMsg = "❌ LOW CONFIDENCE - Consider staying aside";
    
    let scalpMsg = "";
    if(scalpingData.scalpLong === "READY") scalpMsg += `\n⚡ SCALP LONG READY @ ${priceFormatted}`;
    if(scalpingData.scalpShort === "READY") scalpMsg += `\n⚡ SCALP SHORT READY @ ${priceFormatted}`;
    if(scalpingData.flipLong === "🔥 FLIP READY") scalpMsg += `\n🔄 FLIP LONG READY @ ${priceFormatted}`;
    if(scalpingData.flipShort === "🔥 FLIP READY") scalpMsg += `\n🔄 FLIP SHORT READY @ ${priceFormatted}`;
    
    return `⚡ *QUANTUM EDGE SIGNAL* ⚡%0A%0A📊 *Asset:* ${s.asset}%0A⏱️ *Timeframe:* ${s.timeframe || currentTf}%0A🎯 *Signal:* ${emoji}%0A💰 *Entry:* ${priceFormatted}%0A🔒 *Stop Loss:* ${slFormatted}%0A🎯 *Take Profit:* ${tpFormatted}%0A🎲 *Confidence:* ${s.confidence}% (${s.confidenceLevel})%0A💡 *${confidenceMsg}*${scalpMsg}%0A📐 *Risk-Reward:* 3:1%0A🕐 ${new Date().toLocaleString()}%0A%0ATrade responsibly. Always use stop-loss.`;
}

async function sendWhatsAppSignal() {
    if (currentSignalData.signal === "HOLD" || currentSignalData.price === 0) {
        showToast("⚠️ No valid signal. Generate a BUY/SELL signal first.");
        addLog("Cannot send: No active signal", "warning");
        return;
    }
    const method = document.querySelector('input[name="sendMethod"]:checked').value;
    const message = formatWhatsAppMessage();
    
    if (method === "picker") {
        window.open(`https://wa.me/?text=${message}`, '_blank');
        addLog("📱 Opened WhatsApp contact picker", "send");
    } else if (method === "direct") {
        let number = document.getElementById('directNumber').value.trim();
        if (!number) { showToast("❌ Enter number"); return; }
        let cleanNumber = number.replace(/[^0-9+]/g, '');
        if (!cleanNumber.startsWith('+')) cleanNumber = '+' + cleanNumber;
        window.open(`https://wa.me/${encodeURIComponent(cleanNumber)}?text=${message}`, '_blank');
        addLog(`📱 Opened WhatsApp for ${cleanNumber}`, "send");
    } else if (method === "api") {
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        let number = document.getElementById('directNumber').value.trim();
        if (!number || !apiKey) { showToast("❌ Missing number or API key"); return; }
        let cleanNumber = number.replace(/[^0-9+]/g, '');
        if (cleanNumber.startsWith('+')) cleanNumber = cleanNumber.substring(1);
        const textMsg = formatWhatsAppMessage().replace(/%0A/g, '\n').replace(/%20/g, ' ');
        try {
            const response = await fetch(`https://api.callmebot.com/whatsapp.php?phone=${cleanNumber}&text=${encodeURIComponent(textMsg)}&apikey=${apiKey}`);
            const result = await response.text();
            if (result.includes("OK")) {
                addLog(`✅ Auto-sent signal to ${number}`, "success");
                showToast("✅ Signal sent!");
            } else {
                addLog(`⚠️ API error`, "warning");
            }
        } catch(e) { addLog(`❌ API failed`, "error"); }
    }
}

// Enhanced AI with Trading Challenges Database
async function getRealTimeMarketContext() { 
    if(!currentAsset || !currentTf) return null; 
    const data = await fetchRealTimeData(currentAsset, currentTf); 
    if(data) currentMarketSnapshot = data; 
    return currentMarketSnapshot; 
}

async function askMarketAI(userQuestion) {
    const lowerQuestion = userQuestion.toLowerCase();
    
    // Trading Challenges & Solutions Database
    if (lowerQuestion.includes('challenge') || lowerQuestion.includes('problem') || 
        lowerQuestion.includes('difficult') || lowerQuestion.includes('struggle') ||
        (lowerQuestion.includes('trader') && lowerQuestion.includes('face'))) {
        
        return `📚 **TOP 10 TRADING CHALLENGES & SOLUTIONS**

**1. EMOTIONAL TRADING** 🧠
*Challenge:* Fear, greed, FOMO, revenge trading
*Solutions:*
• Take 15-min break after 2 consecutive losses
• Use trading checklist before each entry
• Set daily loss limit (stop after 3 losses)
• Meditate 5 min before trading session

**2. POOR RISK MANAGEMENT** 🛡️
*Challenge:* Risking too much, no stop-loss, overleveraging
*Solutions:*
• Risk only 1-2% per trade MAX
• Always use stop-loss (non-negotiable)
• Calculate position size before entry
• Risk:Reward minimum 1:2

**3. LACK OF DISCIPLINE** 📋
*Challenge:* Not following trading plan, random entries
*Solutions:*
• Write trading plan and stick to it
• Journal every trade with screenshots
• Review trades weekly
• Trade only your best setups

**4. OVERTRADING** ⚠️
*Challenge:* Taking too many trades, chasing every move
*Solutions:*
• Max 3-5 trades per day
• Wait for A+ setups only
• Set daily trade limit in your platform
• Take breaks between trades

**5. ANALYSIS PARALYSIS** 🔍
*Challenge:* Using too many indicators, never pulling trigger
*Solutions:*
• Use max 2-3 indicators
• Define clear entry rules
• Set alert and walk away
• Trust your backtested strategy

**6. UNREALISTIC EXPECTATIONS** 💰
*Challenge:* Expecting 50% monthly returns
*Solutions:*
• Target 5-10% monthly (excellent!)
• Focus on process, not profits
• Accept small losses as business cost
• 90% traders fail first year - be patient

**7. NO TRADING JOURNAL** 📓
*Challenge:* Repeating same mistakes
*Solutions:*
• Log every trade entry/exit
• Screenshot charts
• Rate your emotional state
• Review weekly for patterns

**8. MARKET TIMING ISSUES** ⏰
*Challenge:* Entering too early/late, chasing price
*Solutions:*
• Wait for confirmation candle
• Use limit orders not market
• Check higher timeframe trend
• Don't trade first 15 min of session

**9. LACK OF EDGE** 🎯
*Challenge:* No proven strategy advantage
*Solutions:*
• Backtest minimum 100 trades
• Focus on one setup until profitable
• Keep what works, cut what doesn't
• Demo trade 3 months minimum

**10. INFORMATION OVERLOAD** 📚
*Challenge:* Too many courses, indicators, strategies
*Solutions:*
• Master ONE strategy first
• Block social media trading gurus
• Ignore noise, focus on price action
• Less is more in trading

**🔥 QUICK FIXES FOR TODAY:**
1. Reduce position size by 50%
2. Set daily loss limit = 3 losses
3. Use only 2 indicators
4. Journal every trade
5. Take break after loss

Remember: *Trading is 80% psychology, 20% strategy.* Master your mind first!`;
    }
    
    // Trading Psychology
    if (lowerQuestion.includes('psychology') || lowerQuestion.includes('emotion') || 
        lowerQuestion.includes('fear') || lowerQuestion.includes('greed') ||
        lowerQuestion.includes('overcome')) {
        
        return `🧠 **TRADING PSYCHOLOGY MASTERY**

**Common Psychological Traps & Cures:**

**1. FEAR OF MISSING OUT (FOMO)** 📈
*Symptoms:* Chasing price, buying at peaks
*Cure:* Missed trades > losing trades. There's always another setup!

**2. REVENGE TRADING** 💢
*Symptoms:* Doubling size after loss, forcing trades
*Cure:* After 2 losses, STOP for 30 minutes. Loss = business cost.

**3. GREED** 💰
*Symptoms:* Not taking profits, moving targets higher
*Cure:* Take partial profits at 1R and 2R. Let runner ride with trailing stop.

**4. FEAR OF LOSING** 😰
*Symptoms:* Closing winners early, moving stops closer
*Cure:* Trust your backtested system. Let winners run to target.

**5. OVERCONFIDENCE** 🦁
*Symptoms:* Increasing size after wins, ignoring rules
*Cure:* Stick to position size rules regardless of streak.

**Daily Psychological Routine:**

☀️ **Pre-Market (15 min):**
• Review trading plan
• Check key levels
• Set daily loss limit

⏰ **During Trading:**
• Take break after 2 losses
• Don't check P&L constantly
• Breathe before each entry

🌙 **Post-Market (15 min):**
• Journal all trades
• Note emotional state
• Identify improvement areas

**The Golden Rule:** *Trade your plan, not your emotions. Plan the trade, trade the plan.*`;
    }
    
    // Entry Confidence
    if (lowerQuestion.includes('confidence') || lowerQuestion.includes('should i take') || 
        lowerQuestion.includes('entry') || lowerQuestion.includes('take this trade')) {
        
        if (!currentSignalData.signal || currentSignalData.signal === "HOLD") {
            return `⚠️ **No Active Signal Found**

Please generate a signal first by:
1. Selecting an asset and timeframe
2. Entering account balance and risk %
3. Clicking "GENERATE SIGNAL"

Once you have a BUY/SELL signal, I can analyze your entry confidence!`;
        }
        
        const conf = currentSignalData.confidence;
        const level = currentSignalData.confidenceLevel;
        let recommendation = "";
        let action = "";
        
        if (conf >= 70) {
            recommendation = "✅ **HIGH CONFIDENCE TRADE**\n\nThis setup shows strong technical alignment. All indicators confirm the direction.";
            action = "✔️ RECOMMENDED: Take the trade with standard position size (1-2% risk)";
        } else if (conf >= 50) {
            recommendation = "⚠️ **MEDIUM CONFIDENCE TRADE**\n\nMixed signals. Some indicators confirm direction but others are neutral.";
            action = "⚠️ CAUTION: Either wait for better confirmation OR take with HALF position size";
        } else {
            recommendation = "❌ **LOW CONFIDENCE TRADE**\n\nTechnical signals are weak or conflicting. High risk of false breakout.";
            action = "❌ AVOID: Stay in cash or use VERY small size (0.25x normal)";
        }
        
        return `🎯 **ENTRY CONFIDENCE ANALYSIS**

**Current Signal:** ${currentSignalData.signal} @ ${currentAsset}
**Confidence Score:** ${conf}% (${level})

${recommendation}

**Why this score?**
• RSI: ${currentMarketSnapshot.rsi} ${currentMarketSnapshot.rsi > 60 ? '(Overbought zone)' : (currentMarketSnapshot.rsi < 40 ? '(Oversold zone)' : '(Neutral)')}
• MACD: ${currentMarketSnapshot.macdHist > 0 ? 'Bullish momentum' : 'Bearish momentum'}
• ATR: ${currentMarketSnapshot.atr} (Volatility check)
• Volatility: ${currentMarketSnapshot.volatility?.toFixed(1)}%

**${action}**

💡 *Pro Tip:* Even high confidence trades can fail. Always use stop-loss!`;
    }
    
    // Regular market analysis with Groq API
    if(!groqApiKey) {
        return "⚠️ **Groq API Key Required**\n\n💡 Without API key, I can still provide:\n• Trading challenges & solutions\n• Trading psychology guidance\n• Entry confidence analysis\n• Risk management strategies\n\nAdd your key from console.groq.com for full market analysis!";
    }
    
    if(!currentAsset) return "📌 First select an Asset & Timeframe from the main dashboard.";
    
    const market = await getRealTimeMarketContext();
    if(!market) return "❌ Unable to fetch market data. Check Twelve Data API key.";
    
    const priceFmt = currentAsset === 'BTCUSD' ? `$${market.price.toFixed(0)}` : `$${market.price.toFixed(2)}`;
    
    const systemPrompt = `You are Quantum Edge AI - Trading Coach & Market Analyst. Real-time data: ${currentAsset}, ${currentTf}, Price: ${priceFmt}, RSI: ${market.rsi}, ATR: ${market.atr}, MACD: ${market.macdHist?.toFixed(4)}, Volatility: ${market.volatility?.toFixed(1)}%. Current signal confidence: ${currentSignalData.confidence || 0}%.

Provide actionable analysis. Include: technical bias, key levels, entry confidence, risk advice. Add psychological tips if relevant. Be concise but educational.`;
    
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userQuestion }], temperature: 0.7, max_tokens: 600 })
        });
        const json = await response.json();
        if(json.choices && json.choices[0]) return json.choices[0].message.content;
        return "AI response error.";
    } catch(e) { 
        return `❌ Error: ${e.message}\n\nTry asking about trading challenges or psychology - I can answer without API key!`;
    }
}

// Chat UI
const modal = document.getElementById('aiChatModal');
const floatingBtn = document.getElementById('floatingAiBtn');
const closeBtn = document.getElementById('closeChatBtn');
const chatArea = document.getElementById('chatMessagesArea');
const sendChatBtn = document.getElementById('sendChatMsgBtn');
const chatInput = document.getElementById('chatQuestionInput');

function addChatBubble(text, isUser) { 
    const bubble = document.createElement('div'); 
    bubble.className = `chat-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}`; 
    bubble.innerHTML = text.replace(/\n/g, '<br>'); 
    chatArea.appendChild(bubble); 
    chatArea.scrollTop = chatArea.scrollHeight; 
}

async function handleChatQuestion() { 
    const q = chatInput.value.trim(); 
    if(!q) return; 
    addChatBubble(q, true); 
    chatInput.value = ''; 
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'chat-bubble ai-bubble';
    loadingDiv.innerHTML = "🤔 Analyzing...";
    chatArea.appendChild(loadingDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
    const answer = await askMarketAI(q); 
    loadingDiv.remove();
    addChatBubble(answer, false); 
}

function quickPromptHandler(e) { 
    const q = e.currentTarget.getAttribute('data-q'); 
    if(q) { chatInput.value = q; handleChatQuestion(); } 
}

// Event listeners
document.getElementById('saveGroqBtn').onclick = () => { let k = document.getElementById('groqApiKeyInput').value.trim(); if(k){ groqApiKey=k; localStorage.setItem('groq_api_key',k); addLog("Groq API saved","success"); showToast("Groq key saved"); } };
document.getElementById('saveTwelveBtn').onclick = () => { let k = document.getElementById('twelveApiKeyInput').value.trim(); if(k){ twelveApiKey=k; localStorage.setItem('twelve_api_key',k); addLog("Twelve Data API saved","success"); showToast("Twelve Data key saved"); } };
document.getElementById('generateSignalBtn').onclick = refreshSignal;
document.getElementById('autoRefreshBtn').onclick = () => { if(autoInterval){ clearInterval(autoInterval); autoInterval=null; addLog("Auto refresh stopped","info"); } else { autoInterval=setInterval(refreshSignal,30*60*1000); refreshSignal(); addLog("Auto refresh started (30min)","success"); } };
document.getElementById('scalpModeBtn').onclick = startScalpingMode;
document.getElementById('sendSignalToWhatsAppBtn').onclick = sendWhatsAppSignal;
document.getElementById('assetSelect').onchange = updateParams;
document.getElementById('timeframeSelect').onchange = updateParams;
document.getElementById('accountBalance').onchange = updateParams;
document.getElementById('riskPercent').onchange = updateParams;
document.querySelectorAll('input[name="sendMethod"]').forEach(r=>r.onchange=()=>{ const m=document.querySelector('input[name="sendMethod"]:checked').value; document.getElementById('directInputArea').style.display=(m==="direct"||m==="api")?"block":"none"; document.getElementById('apiKeyArea').style.display=(m==="api")?"block":"none"; });

floatingBtn.onclick = () => modal.classList.remove('hidden');
closeBtn.onclick = () => modal.classList.add('hidden');
sendChatBtn.onclick = handleChatQuestion;
chatInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleChatQuestion(); });
document.querySelectorAll('.quick-prompt').forEach(el => el.addEventListener('click', quickPromptHandler));

// Load saved keys
if(localStorage.getItem('groq_api_key')) { groqApiKey = localStorage.getItem('groq_api_key'); document.getElementById('groqApiKeyInput').value = groqApiKey; }
if(localStorage.getItem('twelve_api_key')) { twelveApiKey = localStorage.getItem('twelve_api_key'); document.getElementById('twelveApiKeyInput').value = twelveApiKey; }

updateParams();
addLog("✅ System ready! Features: Entry Confidence Meter, Trading Challenges Database, Scalping, NASDAQ support. Generate signal to see confidence score!", "success");
