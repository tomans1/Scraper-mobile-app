  /* ---------- CONSTANTS ---------- */
  const API_BASE = "https://web-production-ec52.up.railway.app/";
  const categories = [
    "Byty","Domy","Nové projekty","Garáže","Hotely, reštaurácie",
    "Chalupy, Chaty","Kancelárie","Obchodné priestory",
    "Pozemky","Sklady","Záhrady","Ostatné"
  ];

  const TOKEN_STORAGE_KEY = 'scraperAuthToken';
  let authToken = null;

  try {
    authToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch (err) {
    authToken = null;
  }

  /* ---------- GLOBALS ---------- */
  let selectedStart = null;
  let selectedEnd   = null;
  let cancelRequested = false;
  let serverStatusElements = [];
  let wakeButtons = [];
  let serverStatusTimer = null;
  let currentServerStatus = 'checking';
  const STATUS_VARIANTS = {
    checking: { dot: 'bg-yellow-500', text: 'text-yellow-600', label: 'Kontrolujem…' },
    online  : { dot: 'bg-green-500',  text: 'text-green-600',  label: 'Online' },
    offline : { dot: 'bg-red-500',    text: 'text-red-500',    label: 'Offline' },
    waking  : { dot: 'bg-blue-500',   text: 'text-blue-600',   label: 'Prebúdzam…' }
  };
  const STATUS_DOT_CLASSES  = ['bg-yellow-500','bg-green-500','bg-red-500','bg-blue-500'];
  const STATUS_TEXT_CLASSES = ['text-yellow-600','text-green-600','text-red-500','text-blue-600'];

  function escapeHtml(str){
    if(!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function toggleButtons(running){
    const start = document.getElementById('start-buttons');
    const cancel = document.getElementById('cancel-btn');
    if(running){
      start.classList.add('hidden');
      cancel.classList.remove('hidden');
    } else {
      start.classList.remove('hidden');
      cancel.classList.add('hidden');
    }
  }


  function setAuthToken(token){
    authToken = token || null;
    try {
      if(authToken){
        localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch (err) {
      // Ignore storage issues (e.g. private browsing modes)
    }
  }

  function authHeaders(base = {}){
    return authToken ? { ...base, Authorization: `Bearer ${authToken}` } : { ...base };
  }

  function handleUnauthorized(){
    setAuthToken(null);
    checkAuth();
  }



  /* ---------- HELPERS ---------- */
  async function collectFilters() {
    const boxes   = document.querySelectorAll('#subcat-options input[type="checkbox"]');
    const chosen  = [...boxes].filter(b => b.checked).map(b => b.parentElement.textContent.trim());
    const onlyNew = document.getElementById('new-only').checked;

    return {
      subcategories : chosen,
      date_start    : onlyNew ? null : selectedStart,
      date_end      : onlyNew ? null : selectedEnd,
      mode          : onlyNew ? "new" : "old"
    };
  }


  /* ---------- SCRAPE / PROGRESS ---------- */
  let authAttempts = 0;
  let blockedUntil = 0;

  async function checkAuth(){
    const app = document.getElementById('app');
    const modal = document.getElementById('auth-modal');

    if(!authToken){
      app.classList.add('hidden');
      modal.classList.remove('hidden');
      return;
    }

    try{
      const res = await fetch(`${API_BASE}/auth/status`, { headers: authHeaders() });
      if(!res.ok){
        throw new Error('unauthorized');
      }
      const data = await res.json();
      if(data.authenticated){
        app.classList.remove('hidden');
        modal.classList.add('hidden');
        return;
      }
      setAuthToken(null);
    }catch(err){
      setAuthToken(null);
    }

    app.classList.add('hidden');
    modal.classList.remove('hidden');
  }

  async function handleLogin(e){
    e.preventDefault();
    const err = document.getElementById('auth-error');
    if(Date.now() < blockedUntil){
      err.textContent = 'Blokované, skúste neskôr';
      err.classList.remove('hidden');
      return;
    }
    const pw = document.getElementById('auth-password').value;
    const resp = await fetch(`${API_BASE}/auth/login`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password:pw}),
    });
    if(resp.ok){
      authAttempts=0;
      err.classList.add('hidden');
      document.getElementById('auth-password').value='';
      const data = await resp.json();
      if(data && data.token){
        setAuthToken(data.token);
      } else {
        setAuthToken(null);
      }
      await checkAuth();
    }else{
      authAttempts++;
      err.textContent = 'Nesprávne heslo';
      err.classList.remove('hidden');
      const form=document.getElementById('auth-form');
      form.classList.add('shake');
      setTimeout(()=>form.classList.remove('shake'),500);
      if(authAttempts>=3){
        blockedUntil = Date.now()+60000;
      }
    }
  }

  async function logout(){
    try{
      await fetch(`${API_BASE}/auth/logout`,{method:'POST',headers:authHeaders()});
    }catch(err){}
    setAuthToken(null);
    location.reload();
  }

  function setServerStatus(state){
    currentServerStatus = state;
    const variant = STATUS_VARIANTS[state] || STATUS_VARIANTS.checking;
    serverStatusElements.forEach(el => {
      const dot = el.querySelector('[data-status-dot]');
      const label = el.querySelector('[data-status-text]');
      if(dot){
        dot.classList.remove(...STATUS_DOT_CLASSES);
        dot.classList.add(variant.dot);
      }
      if(label){
        label.classList.remove(...STATUS_TEXT_CLASSES);
        label.classList.add(variant.text);
        label.textContent = variant.label;
      }
    });

    wakeButtons.forEach(btn => {
      const defaultLabel = btn.dataset.wakeLabel || 'Wake server';
      if(state === 'offline'){
        btn.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = defaultLabel;
      }else if(state === 'waking'){
        btn.classList.remove('hidden');
        btn.disabled = true;
        btn.textContent = 'Prebúdzam…';
      }else{
        btn.classList.add('hidden');
        btn.disabled = false;
        btn.textContent = defaultLabel;
      }
    });
  }

  async function fetchServerStatus(){
    if(currentServerStatus !== 'waking'){
      setServerStatus('checking');
    }
    try{
      const resp = await fetch(`${API_BASE}/health`, {
        cache:'no-store'
      });
      if(!resp.ok){
        throw new Error('Bad status');
      }
      await resp.json();
      setServerStatus('online');
      return true;
    }catch(err){
      setServerStatus('offline');
      return false;
    }
  }

  async function wakeBackend(event){
    if(event){
      event.preventDefault();
    }
    setServerStatus('waking');
    try{
      await fetch(`${API_BASE}/wake`, {
        method:'POST'
      });
    }catch(err){
      // Ignore network errors; a follow-up status check will handle the UI.
    }
    setTimeout(fetchServerStatus, 4000);
  }

  function startServerStatusPolling(){
    fetchServerStatus();
    if(serverStatusTimer){
      clearInterval(serverStatusTimer);
    }
    serverStatusTimer = setInterval(fetchServerStatus, 60000);
  }

  function setupServerStatusControls(){
    serverStatusElements = [...document.querySelectorAll('[data-server-status]')];
    wakeButtons = [...document.querySelectorAll('[data-wake-button]')];
    if(!serverStatusElements.length){
      return;
    }
    wakeButtons.forEach(btn => btn.addEventListener('click', wakeBackend));
    setServerStatus('checking');
    startServerStatusPolling();
  }

  async function startScrape(mode){
    cancelRequested = false;
    const bar   = document.getElementById('progress-bar');
    const prog  = document.getElementById('progress');
    const label = document.getElementById('stage-label');
    const resCt = document.getElementById('results-section');
    const out   = document.getElementById('output');

    toggleButtons(true);
    bar.classList.remove('hidden');
    resCt.classList.add('hidden');
    out.innerHTML = "";
    prog.style.width = "0%";
    label.textContent = "";
    document.getElementById('results-count').textContent = '';

    const filters = await collectFilters();
    filters.mode  = mode;

    if (cancelRequested) {
      toggleButtons(false);
      return;
    }

    try {
      const resp = await fetch(`${API_BASE}/scrape`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(filters)
      });

      const rawBody = await resp.text();

      if (resp.status === 401) {
        handleUnauthorized();
        throw new Error('Prihlásenie vypršalo, prihláste sa prosím znova.');
      }

      if (!resp.ok) {
        let message = `Chyba pri spracovaní (kód ${resp.status})`;
        if (rawBody) {
          const trimmed = rawBody.trim();
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed.error === 'string') {
              message = parsed.error;
            } else if (trimmed) {
              message = trimmed;
            }
          } catch (parseErr) {
            if (trimmed) {
              message = trimmed;
            }
          }
        }
        throw new Error(message);
      }

      let links = [];
      const contentType = resp.headers.get('content-type') || '';
      if (rawBody) {
        if (contentType.includes('application/json')) {
          try {
            links = JSON.parse(rawBody);
          } catch (err) {
            throw new Error('Neplatná JSON odpoveď zo servera.');
          }
        } else {
          throw new Error(rawBody.trim() || 'Neočakávaná odpoveď zo servera.');
        }
      }

      prog.style.width = "100%";
      label.textContent = "Hotovo";
      bar.classList.add('hidden');
      resCt.classList.remove('hidden');
      displayResults(Array.isArray(links) ? links : []);
    } catch (err) {
      clearInterval(progressInterval);
      const message = err && err.message ? err.message : 'Chyba pri spracovaní.';
      prog.style.width = "100%";
      label.textContent = message;
      resCt.classList.remove('hidden');
      out.innerHTML = `<p class='text-red-500'>${escapeHtml(message)}</p>`;
      document.getElementById('results-count').textContent = 'Počet výsledkov: 0';
    } finally {
      toggleButtons(false);
    }
  }


  async function sendFeedback(){
    const box = document.getElementById('feedback-box');
    const txt = box.querySelector('textarea').value.trim();
    if(!txt) return;
    const resp = await fetch(`${API_BASE}/feedback`,{
      method:"POST",
      body:txt,
      headers:authHeaders({ 'Content-Type': 'text/plain;charset=utf-8' })
    });
    if(resp.status === 401){
      handleUnauthorized();
      return;
    }
    box.classList.add('animate-fade');
    setTimeout(()=>{ box.classList.add('hidden'); box.classList.remove('animate-fade'); box.querySelector('textarea').value=""; },500);
  }

  function toggleAdvancedFilters(){ document.getElementById('advanced-filters').classList.toggle('hidden'); }
  function toggleDateInputs(cb){
    const inp = document.getElementById('date-range');
    inp.disabled = cb.checked;
    if(cb.checked){ inp.value=""; selectedStart=null; selectedEnd=null; }
  }

  /* ---------- DOM READY ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('auth-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-link').addEventListener('click', e=>{e.preventDefault(); logout();});
    checkAuth();
    setupServerStatusControls();

    /* sub-category check-boxes */
    document.getElementById('subcat-options').innerHTML = categories.map(c=>
      `<label class="inline-flex items-center"><input type="checkbox" class="form-checkbox text-blue-500 mr-2">${c}</label>`
    ).join("<br>");

    /* Litepicker (key part: tooltipText!) */
    new Litepicker({
      element: document.getElementById('date-range'),
      singleMode:false,
      format:'DD/MM/YYYY',
      lang:'sk',
      autoApply:true,

      /* <- THIS fixes the “[few]” problem */
      tooltipText:{
        one : 'Deň',     // 1
        few : 'dni',     // 2–4
        other:'dní'      // 5+
      },
      tooltipNumber: num => `${num}`,

      months: [
        'Január','Február','Marec','Apríl','Máj','Jún',
        'Júl','August','September','Október','November','December'
      ],
      weekdays: ['Ne','Po','Ut','St','Št','Pia','So'],
      buttonText:{
        apply :'Použiť',
        cancel:'Zrušiť',
        reset :'Vymazať'
      },

      setup: p=>p.on('selected',(s,e)=>{
        selectedStart = s.format('DD/MM/YYYY');
        selectedEnd   = e.format('DD/MM/YYYY');
      })
    });
  });

  function displayResults(items){
    const out = document.getElementById('output');
    document.getElementById('results-section').classList.remove('hidden');

    if(!Array.isArray(items) || items.length === 0){
      out.innerHTML = "<p class='text-red-500'>Žiadne výsledky neboli nájdené.</p>";
      document.getElementById('results-count').textContent = 'Počet výsledkov: 0';
      return;
    }

    const rows = items.map(it => {
      const url = it.url || it;
      const extras = [];
      if(it.subcat) extras.push(it.subcat);
      if(it.date) extras.push(it.date);
      const label = extras.length ? `${url} – ${extras.join(' | ')}` : url;
      return `<a href="${url}" target="_blank" class="block text-blue-600 hover:underline">${label}</a>`;
    });

    out.innerHTML = rows.join("");
    document.getElementById('results-count').textContent = `Počet výsledkov: ${items.length}`;

    const urls = items.map(it => it.url || it);
    document.getElementById('download-btn').onclick = () => {
      const blob = new Blob([urls.join("\n")],{type:"text/plain"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = "vysledky.txt";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    };
  }

  let progressInterval;
  function startProgressPolling() {
    const progressLabel = document.getElementById("progress-label");
    const prog = document.getElementById("progress");
    const stageLabel = document.getElementById('stage-label');
    progressLabel.textContent = "";
    if(progressInterval) clearInterval(progressInterval);
    progressInterval = setInterval(() => {
      fetch(`${API_BASE}/progress`,{headers:authHeaders()})
        .then(res => {
          if(res.status === 401){
            handleUnauthorized();
            throw new Error('unauthorized');
          }
          return res.json();
        })
        .then(data => {
          if(cancelRequested){
            clearInterval(progressInterval);
            return;
          }
          const done = Number(data.done) || 0;
          const total = Number(data.total) || 0;
          const pct = total > 0 ? (done / total) * 100 : 15;
          prog.style.width = pct + "%";
          stageLabel.textContent = `${data.phase}`;
          const labels = {
            "1/5 Zber sitemap": "Sitemapy stiahnuté",
            "2/5 Prvé filtrovanie": "Filtrované",
            "3/5 Sťahovanie inzerátov": "Stiahnuté",
            "4/5 Filtrovanie popisov": "Filtrované",
            "5/5 OpenAI filtrovanie": "Vyhodnotené"
          };
          const prefix = labels[data.phase] ? labels[data.phase] + ": " : "";
          progressLabel.textContent = `${prefix}${done}/${total}`;
          if (data.phase === "Hotovo") {
            progressLabel.textContent = "✅ Hotovo!";
            clearInterval(progressInterval);
            toggleButtons(false);
          }
        })
        .catch(() => {
          clearInterval(progressInterval);
          progressLabel.textContent = "";
          toggleButtons(false);
        });
    }, 1000);
  }

    function cancelScrape() {
      cancelRequested = true;
      clearInterval(progressInterval);
      fetch(`${API_BASE}/cancel`, { method: "POST", headers:authHeaders() });
      document.getElementById('progress').style.width = '0%';
      document.getElementById('progress-bar').classList.add('hidden');
      document.getElementById('results-section').classList.add('hidden');
      document.getElementById('progress-label').textContent = '';
      document.getElementById('stage-label').textContent = '';

      toggleButtons(false);
    }

    async function restartApp(){
      const resp = await fetch(`${API_BASE}/restart`, {method: 'POST', headers:authHeaders()});
      if(resp.status === 401){
        handleUnauthorized();
        return;
      }
      location.reload();
    }



  
