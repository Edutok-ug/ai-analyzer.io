   // ---------- GLOBAL STATE ----------
    let currentAsset = "", currentTf = "", accountBalance = null, riskPercent = null;
    let groqApiKey = "", twelveApiKey = "";
    let autoInterval = null, tvWidget = null;
    let logsEnabled = false;
    let currentMarketSnapshot = { price: 0, rsi: 50, atr: 0, macdHist: 0 };
    let currentSignalData = { signal: "HOLD", price: 0, entry: 0, stopLoss: null, takeProfit: null, confidence: "--", reasoning: "", asset: "", timeframe: "" };
    
    function showToast(msg) { const toast = document.createElement('div'); toast.className = 'toast-msg'; toast.innerText = msg; document.body.appendChild(toast); setTimeout(() => toast.remove(), 2500); }
    function addLog(msg, type='info') { if(!logsEnabled) return; const logDiv = document.getElementById('logArea'); if(logDiv.classList.contains('empty')) { logDiv.classList.remove('empty'); logDiv.innerHTML=''; } const entry = document.createElement('div'); entry.style.padding='6px 0'; entry.style.borderBottom='1px solid #1e293b'; entry.style.fontSize='0.75rem'; const time = new Date().toLocaleTimeString(); const icons={signal:'🎯',error:'❌',success:'✅',warning:'⚠️',info:'🔹',send:'📨'}; entry.innerHTML = `[${time}] ${icons[type]||'🔹'} ${msg}`; logDiv.appendChild(entry); entry.scrollIntoView({behavior:'smooth',block:'nearest'}); while(logDiv.children.length>80) logDiv.removeChild(logDiv.firstChild); }
    
    function areAllParametersSelected() {
        const asset = document.getElementById('assetSelect').value, tf = document.getElementById('timeframeSelect').value;
        const balance = document.getElementById('accountBalance').value, risk = document.getElementById('riskPercent').value;
        const all = asset && tf && balance && parseFloat(balance)>0 && risk && parseFloat(risk)>0;
        document.getElementById('generateSignalBtn').disabled = !all; document.getElementById('autoRefreshBtn').disabled = !all;
        const sendBtn = document.getElementById('sendSignalToWhatsAppBtn');
        if(all && currentSignalData.signal !== "HOLD" && currentSignalData.price > 0) sendBtn.disabled = false;
        else sendBtn.disabled = true;
        if(all) { if(!logsEnabled){ logsEnabled=true; addLog("✅ Parameters ready","success"); } document.getElementById('paramsWarning').innerHTML=''; }
        else { let missing=[]; if(!asset) missing.push("Asset"); if(!tf) missing.push("Timeframe"); if(!balance||parseFloat(balance)<=0) missing.push("Balance"); if(!risk||parseFloat(risk)<=0) missing.push("Risk %"); document.getElementById('paramsWarning').innerHTML=`⚠️ ${missing.join(", ")}`; logsEnabled=false; const logDiv=document.getElementById('logArea'); logDiv.innerHTML=''; logDiv.classList.add('empty'); }
        return all;
    }
    function updateParams() { currentAsset=document.getElementById('assetSelect').value; currentTf=document.getElementById('timeframeSelect').value; accountBalance=parseFloat(document.getElementById('accountBalance').value); riskPercent=parseFloat(document.getElementById('riskPercent').value); areAllParametersSelected(); }
    
    // Real-time data from Twelve Data
    async function fetchRealTimeData(asset, tf) {
        if(!twelveApiKey) { addLog("Twelve Data API key missing, using simulated","warning"); return generateSimulatedData(asset); }
        const symbolMap = { XAUUSD:"XAU/USD", BTCUSD:"BTC/USD", EURUSD:"EUR/USD", GBPUSD:"GBP/USD" };
        let interval = tf === "1day" ? "1day" : (tf === "4h" ? "4h" : (tf === "1h" ? "1h" : "15min"));
        try {
            const url = `https://api.twelvedata.com/time_series?symbol=${symbolMap[asset]}&interval=${interval}&outputsize=50&apikey=${twelveApiKey}`;
            const resp = await fetch(url); const json = await resp.json();
            if(!json.values || json.values.length<20) throw new Error();
            let closes=[], highs=[], lows=[];
            for(let i=json.values.length-1;i>=0;i--) { closes.push(parseFloat(json.values[i].close)); highs.push(parseFloat(json.values[i].high)); lows.push(parseFloat(json.values[i].low)); }
            const price = closes[closes.length-1];
            let gains=0,losses=0; for(let i=closes.length-14;i<closes.length-1;i++) { let diff=closes[i+1]-closes[i]; if(diff>=0) gains+=diff; else losses-=diff; }
            let rs = (gains/14)/((losses/14)||0.01); let rsi = parseFloat((100-100/(1+rs)).toFixed(1));
            let tr=[]; for(let i=1;i<highs.length;i++) tr.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
            let atr = tr.slice(0,14).reduce((a,b)=>a+b,0)/14; for(let i=14;i<tr.length;i++) atr = (atr*13+tr[i])/14;
            atr = parseFloat(atr.toFixed(asset==='BTCUSD'?0:2));
            let ema12 = closes.slice(-12).reduce((a,b)=>a+b,0)/12, ema26 = closes.slice(-26).reduce((a,b)=>a+b,0)/26;
            let macdHist = (ema12 - ema26) * 0.5;
            return { price, rsi, atr, macdHist };
        } catch(e) { addLog(`Twelve Data error: using sim`,"warning"); return generateSimulatedData(asset); }
    }
    function generateSimulatedData(asset) { let base=asset==='XAUUSD'?2380:asset==='BTCUSD'?63500:asset==='EURUSD'?1.089:1.278; let price=base+(Math.random()-0.5)*base*0.006; let rsi=45+Math.random()*30; let atr=asset==='BTCUSD'?1000:base*0.007; return {price,rsi:parseFloat(rsi.toFixed(1)),atr:parseFloat(atr.toFixed(asset==='BTCUSD'?0:2)),macdHist:(Math.random()-0.5)*0.6}; }
    
    async function refreshSignal() {
        if(!areAllParametersSelected()) return;
        addLog(`Fetching real-time ${currentAsset} (${currentTf})...`,"info");
        const data = await fetchRealTimeData(currentAsset, currentTf);
        if(!data) return;
        currentMarketSnapshot = { price: data.price, rsi: data.rsi, atr: data.atr, macdHist: data.macdHist };
        const priceFormatted = currentAsset==='BTCUSD'?`$${data.price.toFixed(0)}`:`$${data.price.toFixed(2)}`;
        document.getElementById('currentPrice').innerHTML = priceFormatted;
        document.getElementById('rsiValue').innerHTML = data.rsi;
        document.getElementById('atrValue').innerHTML = currentAsset==='BTCUSD'?`$${data.atr.toFixed(0)}`:`$${data.atr.toFixed(2)}`;
        let signal="HOLD", reasoning="";
        if(data.rsi>52 && data.macdHist>0) signal="BUY"; else if(data.rsi<48 && data.macdHist<0) signal="SELL";
        reasoning = `${signal} | RSI:${data.rsi.toFixed(0)} MACD:${data.macdHist?.toFixed(3)}`;
        const stopLoss = signal==='BUY'?data.price-data.atr*1.5:(signal==='SELL'?data.price+data.atr*1.5:null);
        const takeProfit = signal==='BUY'?data.price+data.atr*4.5:(signal==='SELL'?data.price-data.atr*4.5:null);
        let lotSize=0,riskAmt=0,rewardAmt=0;
        if(stopLoss && accountBalance){ let riskPerUnit=Math.abs(data.price-stopLoss); let riskDollars=(riskPercent/100)*accountBalance; let raw=riskDollars/riskPerUnit; lotSize=Math.min(5,Math.max(0.01,parseFloat((currentAsset==='XAUUSD'?raw/100:currentAsset==='BTCUSD'?raw/riskPerUnit:raw/100000).toFixed(2)))); riskAmt=lotSize*riskPerUnit; rewardAmt=riskAmt*3; }
        currentSignalData = { signal, price: data.price, entry: data.price, stopLoss, takeProfit, confidence: signal==="HOLD"?"Low":"Medium", reasoning, asset: currentAsset, timeframe: currentTf };
        document.getElementById('signalMain').className = `signal-badge ${signal}`; document.getElementById('signalMain').innerHTML = signal;
        document.getElementById('entryPrice').innerHTML = priceFormatted; document.getElementById('confidenceLabel').innerHTML = currentSignalData.confidence;
        document.getElementById('maxLotSize').innerHTML = lotSize.toFixed(2); document.getElementById('riskAmount').innerHTML = riskAmt.toFixed(2); document.getElementById('rewardAmount').innerHTML = rewardAmt.toFixed(2);
        if(stopLoss) document.getElementById('stopLossValue').innerHTML = currentAsset==='BTCUSD'?`$${stopLoss.toFixed(0)}`:`$${stopLoss.toFixed(2)}`;
        if(takeProfit) document.getElementById('takeProfitValue').innerHTML = currentAsset==='BTCUSD'?`$${takeProfit.toFixed(0)}`:`$${takeProfit.toFixed(2)}`;
        document.getElementById('reasoningText').innerHTML = `🧠 ${reasoning} | 3:1 R:R`;
        document.getElementById('assetNameDisplay').innerHTML = currentAsset; document.getElementById('timeframeDisplay').innerHTML = ` • ${currentTf}`;
        addLog(`${currentAsset} | ${signal} @ ${priceFormatted}`,"signal");
        updateChart();
        // enable send button if signal not HOLD
        const sendBtn = document.getElementById('sendSignalToWhatsAppBtn');
        if(signal !== "HOLD") sendBtn.disabled = false; else sendBtn.disabled = true;
    }
    function updateChart(){ if(!currentAsset) return; const tvMap={XAUUSD:"OANDA:XAUUSD",BTCUSD:"BITSTAMP:BTCUSD",EURUSD:"FX:EURUSD",GBPUSD:"FX:GBPUSD"}; if(tvWidget) try{tvWidget.remove();}catch(e){} document.getElementById('tv-chart-container').innerHTML=''; if(tvMap[currentAsset] && currentTf){ const intMap={"15min":"15","1h":"60","4h":"240","1day":"1D"}; tvWidget=new TradingView.widget({width:'100%',height:420,symbol:tvMap[currentAsset],interval:intMap[currentTf]||"60",theme:'dark',style:'1',locale:'en',container_id:'tv-chart-container',studies:['RSI@tv-basicstudies']}); } }
    
    // ---------- WHATSAPP SEND FUNCTIONALITY (FULLY FIXED) ----------
    function formatWhatsAppMessage() {
        const s = currentSignalData;
        const emoji = s.signal === "BUY" ? "🚀 BUY" : (s.signal === "SELL" ? "📉 SELL" : "⏸️ HOLD");
        const priceFormatted = s.asset === 'BTCUSD' ? `$${s.price.toFixed(0)}` : `$${s.price.toFixed(2)}`;
        const slFormatted = s.stopLoss ? (s.asset === 'BTCUSD' ? `$${s.stopLoss.toFixed(0)}` : `$${s.stopLoss.toFixed(2)}`) : 'N/A';
        const tpFormatted = s.takeProfit ? (s.asset === 'BTCUSD' ? `$${s.takeProfit.toFixed(0)}` : `$${s.takeProfit.toFixed(2)}`) : 'N/A';
        return `⚡ *QUANTUM EDGE SIGNAL* ⚡%0A%0A📊 *Asset:* ${s.asset}%0A⏱️ *Timeframe:* ${s.timeframe || currentTf}%0A🎯 *Signal:* ${emoji}%0A💰 *Entry:* ${priceFormatted}%0A🔒 *Stop Loss:* ${slFormatted}%0A🎯 *Take Profit:* ${tpFormatted}%0A📈 *Confidence:* ${s.confidence}%0A💡 *Analysis:* ${s.reasoning.substring(0,100)}%0A📐 *Risk-Reward:* 3:1%0A🕐 ${new Date().toLocaleString()}%0A%0ATrade responsibly.`;
    }
    
    async function sendWhatsAppSignal() {
        if (currentSignalData.signal === "HOLD" || currentSignalData.price === 0) {
            showToast("⚠️ No valid signal. Generate a BUY/SELL signal first.");
            addLog("Cannot send: No active signal","warning");
            return;
        }
        const method = document.querySelector('input[name="sendMethod"]:checked').value;
        const message = formatWhatsAppMessage();
        
        if (method === "picker") {
            // Opens WhatsApp with pre-filled message, user picks contact
            const url = `https://wa.me/?text=${message}`;
            window.open(url, '_blank');
            addLog("📱 Opened WhatsApp contact picker. Select a contact to send signal.","send");
            showToast("WhatsApp opened — choose a contact");
        } 
        else if (method === "direct") {
            let number = document.getElementById('directNumber').value.trim();
            if (!number) {
                showToast("❌ Please enter a WhatsApp number with country code");
                addLog("Missing phone number for direct send","error");
                return;
            }
            // Clean number: keep only digits and plus
            let cleanNumber = number.replace(/[^0-9+]/g, '');
            if (!cleanNumber.startsWith('+')) cleanNumber = '+' + cleanNumber;
            const url = `https://wa.me/${encodeURIComponent(cleanNumber)}?text=${message}`;
            window.open(url, '_blank');
            addLog(`📱 Opened WhatsApp for ${cleanNumber}`, "send");
            showToast(`Opening WhatsApp for ${cleanNumber}`);
        } 
        else if (method === "api") {
            const apiKey = document.getElementById('apiKeyInput').value.trim();
            let number = document.getElementById('directNumber').value.trim();
            if (!number) {
                showToast("❌ Please enter a WhatsApp number");
                addLog("Missing number for API send","error");
                return;
            }
            if (!apiKey) {
                showToast("❌ Please enter CallMeBot API key (get from callmebot.com)");
                addLog("Missing API key","error");
                return;
            }
            let cleanNumber = number.replace(/[^0-9+]/g, '');
            if (cleanNumber.startsWith('+')) cleanNumber = cleanNumber.substring(1);
            const textMsg = formatWhatsAppMessage().replace(/%0A/g, '\n').replace(/%20/g, ' ');
            try {
                const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanNumber}&text=${encodeURIComponent(textMsg)}&apikey=${apiKey}`;
                const response = await fetch(url);
                const result = await response.text();
                if (result.includes("OK") || result.includes("Message") || result.includes("success")) {
                    addLog(`✅ Auto-sent signal to ${number} via CallMeBot`, "success");
                    showToast("✅ Signal sent successfully!");
                } else {
                    addLog(`⚠️ API error: ${result.substring(0,80)}`, "warning");
                    showToast("⚠️ API send failed. Check API key or number.");
                }
            } catch(e) {
                addLog(`❌ API request failed: ${e.message}`, "error");
                showToast("❌ Network error sending via API");
            }
        }
    }
    
    // AI Chat functions
    async function getRealTimeMarketContext() { if(!currentAsset || !currentTf) return null; const data = await fetchRealTimeData(currentAsset, currentTf); if(data) currentMarketSnapshot = data; return currentMarketSnapshot; }
    async function askMarketAI(userQuestion) {
        if(!groqApiKey) return "⚠️ Please set Groq API key in the panel above to enable AI market analysis.";
        if(!currentAsset) return "📌 First select an Asset & Timeframe from the main dashboard parameters.";
        const market = await getRealTimeMarketContext();
        if(!market) return "Unable to fetch real-time data. Check Twelve Data API key.";
        const priceFmt = currentAsset==='BTCUSD' ? `$${market.price.toFixed(0)}` : `$${market.price.toFixed(2)}`;
        const systemPrompt = `You are Quantum Edge AI Market Analyst with REAL-TIME data from Twelve Data. Current asset: ${currentAsset}, timeframe: ${currentTf}, price: ${priceFmt}, RSI: ${market.rsi}, ATR: ${market.atr}, MACD Hist: ${market.macdHist?.toFixed(4)}. Provide insightful analysis: multi-timeframe comparison, technical direction (bullish/bearish), mention upcoming economic events (CPI, NFP, FOMC) and predict impact. Give confidence level. Keep concise, actionable.`;
        try {
            const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method:'POST', headers:{'Authorization':`Bearer ${groqApiKey}`,'Content-Type':'application/json'},
                body:JSON.stringify({model:"llama-3.1-8b-instant",messages:[{role:"system",content:systemPrompt},{role:"user",content:userQuestion}],temperature:0.65,max_tokens:550})
            });
            const json = await resp.json();
            if(json.choices && json.choices[0]) return json.choices[0].message.content;
            return "AI response error.";
        } catch(e) { return `❌ AI error: ${e.message}`; }
    }
    
    const modal = document.getElementById('aiChatModal');
    const floatingBtn = document.getElementById('floatingAiBtn');
    const closeBtn = document.getElementById('closeChatBtn');
    const chatArea = document.getElementById('chatMessagesArea');
    const sendChatBtn = document.getElementById('sendChatMsgBtn');
    const chatInput = document.getElementById('chatQuestionInput');
    
    function addChatBubble(text, isUser) { const bubble = document.createElement('div'); bubble.className = `chat-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}`; bubble.innerHTML = text.replace(/\n/g,'<br>'); chatArea.appendChild(bubble); chatArea.scrollTop = chatArea.scrollHeight; }
    async function handleChatQuestion() { const q = chatInput.value.trim(); if(!q) return; addChatBubble(q, true); chatInput.value = ''; addChatBubble("⏳ Fetching real-time market data & analyzing...", false); const loadingMsg = chatArea.lastChild; const answer = await askMarketAI(q); if(loadingMsg) loadingMsg.remove(); addChatBubble(answer, false); }
    function quickPromptHandler(e) { const q = e.currentTarget.getAttribute('data-q'); if(q) { chatInput.value = q; handleChatQuestion(); } }
    floatingBtn.onclick = () => modal.classList.remove('hidden');
    closeBtn.onclick = () => modal.classList.add('hidden');
    sendChatBtn.onclick = handleChatQuestion;
    chatInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleChatQuestion(); });
    document.querySelectorAll('.quick-prompt').forEach(el => el.addEventListener('click', quickPromptHandler));
    
    // Event listeners
    document.getElementById('saveGroqBtn').onclick = () => { let k = document.getElementById('groqApiKeyInput').value.trim(); if(k){ groqApiKey=k; localStorage.setItem('groq_api_key',k); addLog("Groq API saved","success"); showToast("Groq key saved"); } };
    document.getElementById('saveTwelveBtn').onclick = () => { let k = document.getElementById('twelveApiKeyInput').value.trim(); if(k){ twelveApiKey=k; localStorage.setItem('twelve_api_key',k); addLog("Twelve Data API saved","success"); showToast("Twelve Data key saved"); } };
    document.getElementById('generateSignalBtn').onclick = refreshSignal;
    document.getElementById('autoRefreshBtn').onclick = () => { if(autoInterval){ clearInterval(autoInterval); autoInterval=null; document.getElementById('autoRefreshBtn').innerHTML="🔄 Auto (30min)"; addLog("Auto refresh stopped","info"); } else { autoInterval=setInterval(refreshSignal,30*60*1000); document.getElementById('autoRefreshBtn').innerHTML="⏹️ Stop Auto"; refreshSignal(); addLog("Auto refresh started (30min)","success"); } };
    document.getElementById('sendSignalToWhatsAppBtn').onclick = sendWhatsAppSignal;
    document.getElementById('assetSelect').onchange = updateParams; document.getElementById('timeframeSelect').onchange = updateParams;
    document.getElementById('accountBalance').onchange = updateParams; document.getElementById('riskPercent').onchange = updateParams;
    document.querySelectorAll('input[name="sendMethod"]').forEach(r=>r.onchange=()=>{ const m=document.querySelector('input[name="sendMethod"]:checked').value; document.getElementById('directInputArea').style.display=(m==="direct"||m==="api")?"block":"none"; document.getElementById('apiKeyArea').style.display=(m==="api")?"block":"none"; });
    
    if(localStorage.getItem('groq_api_key')) { groqApiKey=localStorage.getItem('groq_api_key'); document.getElementById('groqApiKeyInput').value=groqApiKey; }
    if(localStorage.getItem('twelve_api_key')) { twelveApiKey=localStorage.getItem('twelve_api_key'); document.getElementById('twelveApiKeyInput').value=twelveApiKey; }
    updateParams();
    addLog("✅ System ready. Select asset/timeframe, generate signal, then use WhatsApp button. Click floating 🤖 for AI analyst.","success");
