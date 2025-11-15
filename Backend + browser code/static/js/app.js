  /* ---------- CONSTANTS ---------- */
  const API_BASE = "https://web-production-ec52.up.railway.app/";
  const TOKEN_STORAGE_KEY = 'scraperAuthToken';
  let authToken = null;

  try {
    authToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch (err) {
    authToken = null;
  }

  /* ---------- GLOBALS ---------- */
  let cancelRequested = false;
  let serverStatusElements = [];
  let wakeButtons = [];
  let serverStatusTimer = null;
  let currentServerStatus = 'checking';
  let allResults = [];
  let currentFilteredResults = [];
  let litepickerInstance = null;
  const availableDateRange = { min: null, max: null };
  const filterState = {
    subcategories: new Set(),
    cities: new Set(),
    zips: new Set(),
    startDate: null,
    endDate: null,
    newOnly: false,
  };
  const filterOptionsCache = {
    subcategories: [],
    cities: [],
    zips: [],
  };
  const searchableFilterState = {
    cities: { initialized: false, wrapper: null, input: null, list: null, hint: null },
    zips: { initialized: false, wrapper: null, input: null, list: null, hint: null },
  };
  let pendingDateSelection = { start: null, end: null };
  let suppressDateSelectionHandling = false;
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

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function readResponsePayload(resp){
    const rawBody = await resp.text();
    const contentType = resp.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    if(!rawBody){
      return { rawBody, data: null, isJson };
    }
    if(isJson){
      try {
        return { rawBody, data: JSON.parse(rawBody), isJson };
      } catch (err) {
        throw new Error('Neplatná JSON odpoveď zo servera.');
      }
    }
    return { rawBody, data: rawBody.trim(), isJson };
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
  function normalizeValue(value){
    if (value === null || value === undefined) return '';
    const text = String(value).trim();
    if(!text){
      return '';
    }
    const lowered = text.toLowerCase();
    if(lowered === 'n/a' || lowered === 'na'){
      return '';
    }
    return text;
  }

  function parseResultDate(value){
    if(!value) return null;
    if(value instanceof Date) return new Date(value.getTime());
    if(typeof value === 'string'){
      const trimmed = value.trim();
      if(!trimmed){
        return null;
      }

      const withoutLabel = trimmed.replace(/^timestamp\s*:?/i, '').trim();
      const candidate = withoutLabel || trimmed;

      const match = candidate.match(/(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
      if(match){
        const day = Number(match[1]);
        const month = Number(match[2]) - 1;
        const year = Number(match[3]);
        const hour = match[4] ? Number(match[4]) : 0;
        const minute = match[5] ? Number(match[5]) : 0;
        const second = match[6] ? Number(match[6]) : 0;
        return new Date(year, month, day, hour, minute, second);
      }
      const parsed = Date.parse(candidate);
      if(!Number.isNaN(parsed)){
        return new Date(parsed);
      }
    }
    return null;
  }

  function getNormalizedDateValue(value){
    const parsed = parseResultDate(value);
    if(!(parsed instanceof Date)){
      return null;
    }
    const normalized = toDayStart(parsed);
    return normalized ? normalized.getTime() : null;
  }

  function extractDateField(item){
    if(!item || typeof item !== 'object'){
      return null;
    }
    if(Object.prototype.hasOwnProperty.call(item, 'date') && item.date){
      return item.date;
    }
    if(Object.prototype.hasOwnProperty.call(item, 'Timestamp') && item.Timestamp){
      return item.Timestamp;
    }
    if(Object.prototype.hasOwnProperty.call(item, 'timestamp') && item.timestamp){
      return item.timestamp;
    }
    return null;
  }

  function enhanceResultItem(item){
    if(!item || typeof item !== 'object'){
      return item;
    }
    const rawDate = extractDateField(item);
    const normalized = getNormalizedDateValue(rawDate);
    return { ...item, __d: typeof normalized === 'number' ? normalized : null };
  }

  function formatDateForDisplay(date){
    if(!(date instanceof Date)) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function formatDDMMYYYY(value){
    let dateObj = null;

    if(value instanceof Date){
      dateObj = new Date(value.getTime());
    } else if(typeof value === 'number'){
      const asDate = new Date(value);
      if(!Number.isNaN(asDate.getTime())){
        dateObj = asDate;
      }
    } else if(typeof value === 'string'){
      const parsed = Date.parse(value);
      if(!Number.isNaN(parsed)){
        dateObj = new Date(parsed);
      }
    }

    if(!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())){
      return '';
    }

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function toDayStart(date){
    if(!(date instanceof Date)) return null;
    const clone = new Date(date.getTime());
    clone.setHours(0, 0, 0, 0);
    return clone;
  }

  function isSameDay(a, b){
    if(!(a instanceof Date) || !(b instanceof Date)) return false;
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  function clearFilterState(){
    filterState.subcategories.clear();
    filterState.cities.clear();
    filterState.zips.clear();
    filterState.startDate = null;
    filterState.endDate = null;
    filterState.newOnly = false;
  }

  function resetDateApplyButton(){
    const btn = document.getElementById('date-apply-btn');
    if(btn){
      btn.classList.add('hidden');
      btn.disabled = true;
    }
  }

  function enableDateApplyButton(){
    const btn = document.getElementById('date-apply-btn');
    if(btn){
      const canApply =
        typeof pendingDateSelection.start === 'number' &&
        typeof pendingDateSelection.end === 'number';
      if(canApply){
        btn.disabled = false;
        btn.classList.remove('hidden');
      } else {
        btn.disabled = true;
        btn.classList.add('hidden');
      }
    }
  }

  function clearLitepickerSelection(){
    pendingDateSelection = { start: null, end: null };
    resetDateApplyButton();
    if(!litepickerInstance) return;
    suppressDateSelectionHandling = true;
    try {
      if(typeof litepickerInstance.clearSelection === 'function'){
        litepickerInstance.clearSelection();
      } else if(typeof litepickerInstance.setOptions === 'function'){
        litepickerInstance.setOptions({ startDate: null, endDate: null });
      } else if(typeof litepickerInstance.setDateRange === 'function'){
        litepickerInstance.setDateRange(null, null);
      }
    } catch (err) {
      // ignore clearing issues
    } finally {
      suppressDateSelectionHandling = false;
    }
  }

  function updateSubcatDropdownLabel(){
    const label = document.getElementById('subcat-dropdown-label');
    if(!label){
      return;
    }
    const count = filterState.subcategories.size;
    if(!count){
      label.textContent = 'Vyberte podkategórie';
      return;
    }
    label.textContent = `Vybrané: ${count}`;
  }

  function initializeSubcategoryDropdown(){
    const wrapper = document.getElementById('subcat-dropdown');
    const toggle = document.getElementById('subcat-dropdown-toggle');
    const options = document.getElementById('subcat-options');
    if(!wrapper || !toggle || !options){
      return;
    }

    if(!wrapper.dataset.initialized){
      toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        options.classList.toggle('hidden');
      });

      document.addEventListener('click', evt => {
        if(!wrapper.contains(evt.target)){
          options.classList.add('hidden');
        }
      });

      wrapper.dataset.initialized = 'true';
    }
  }

  function populateSubcategoryOptions(values){
    filterOptionsCache.subcategories = Array.isArray(values) ? values : [];
    const container = document.getElementById('subcat-options');
    if(!container){
      return;
    }

    container.innerHTML = '';

    if(!filterOptionsCache.subcategories.length){
      const msg = document.createElement('p');
      msg.className = 'text-sm text-gray-400';
      msg.textContent = 'Žiadne údaje';
      container.appendChild(msg);
      container.classList.add('hidden');
      updateSubcatDropdownLabel();
      return;
    }

    const sorted = [...filterOptionsCache.subcategories].sort((a, b) => a.localeCompare(b, 'sk', { sensitivity: 'base' }));
    sorted.forEach(value => {
      const option = document.createElement('label');
      option.className = 'flex items-center gap-2 px-2 py-1 hover:bg-gray-100 rounded cursor-pointer';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'form-checkbox text-blue-500';
      input.value = value;
      input.checked = filterState.subcategories.has(value);
      input.addEventListener('change', () => {
        if(input.checked){
          filterState.subcategories.add(value);
        } else {
          filterState.subcategories.delete(value);
        }
        updateSubcatDropdownLabel();
        applyFilters();
      });

      const text = document.createElement('span');
      text.textContent = value;

      option.appendChild(input);
      option.appendChild(text);
      container.appendChild(option);
    });

    updateSubcatDropdownLabel();
  }

  function updateSelectionHint(stateKey){
    const state = searchableFilterState[stateKey];
    if(!state || !state.hint){
      return;
    }
    const count = filterState[stateKey].size;
    if(count){
      state.hint.textContent = count === 1 ? 'Vybraná 1 položka' : `Vybraných ${count} položiek`;
      state.hint.classList.remove('hidden');
    } else {
      state.hint.textContent = '';
      state.hint.classList.add('hidden');
    }
  }

  function renderSearchableFilterOptions(stateKey, searchTerm = ''){
    const state = searchableFilterState[stateKey];
    if(!state || !state.list){
      return;
    }

    const list = state.list;
    list.innerHTML = '';

    const values = filterOptionsCache[stateKey] || [];
    const normalizedTerm = searchTerm ? searchTerm.toLowerCase() : '';
    const matches = normalizedTerm
      ? values.filter(val => val.toLowerCase().includes(normalizedTerm))
      : values;

    if(!matches.length){
      const msg = document.createElement('p');
      msg.className = 'px-3 py-2 text-sm text-gray-500';
      msg.textContent = values.length ? 'Žiadne zhody' : 'Žiadne údaje';
      list.appendChild(msg);
      return;
    }

    matches.forEach(value => {
      const label = document.createElement('label');
      label.className = 'flex items-center gap-2 px-3 py-1 hover:bg-gray-100 rounded cursor-pointer';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'form-checkbox text-blue-500';
      checkbox.value = value;
      checkbox.checked = filterState[stateKey].has(value);
      checkbox.addEventListener('change', () => {
        if(checkbox.checked){
          filterState[stateKey].add(value);
        } else {
          filterState[stateKey].delete(value);
        }
        updateSelectionHint(stateKey);
        applyFilters();
      });

      const text = document.createElement('span');
      text.textContent = value;

      label.appendChild(checkbox);
      label.appendChild(text);
      list.appendChild(label);
    });
  }

  function showSearchableList(stateKey){
    const state = searchableFilterState[stateKey];
    if(!state || !state.list){
      return;
    }
    state.list.classList.remove('hidden');
  }

  function hideSearchableList(stateKey){
    const state = searchableFilterState[stateKey];
    if(!state || !state.list || !state.input){
      return;
    }
    state.list.classList.add('hidden');
    state.input.value = '';
    renderSearchableFilterOptions(stateKey, '');
  }

  function resetSearchableFilter(stateKey){
    filterOptionsCache[stateKey] = [];
    const state = searchableFilterState[stateKey];
    if(!state){
      return;
    }
    if(state.input){
      state.input.value = '';
    }
    if(state.list){
      state.list.innerHTML = '';
      state.list.classList.add('hidden');
    }
    updateSelectionHint(stateKey);
  }

  function initializeSearchableFilter(stateKey, config){
    const state = searchableFilterState[stateKey];
    if(!state || state.initialized){
      return;
    }

    const wrapper = document.getElementById(config.wrapperId);
    const input = document.getElementById(config.inputId);
    const list = document.getElementById(config.listId);
    const hint = document.getElementById(config.hintId);

    if(!wrapper || !input || !list){
      return;
    }

    state.wrapper = wrapper;
    state.input = input;
    state.list = list;
    state.hint = hint || null;

    input.addEventListener('focus', () => {
      showSearchableList(stateKey);
      renderSearchableFilterOptions(stateKey, input.value);
    });
    input.addEventListener('input', () => {
      showSearchableList(stateKey);
      renderSearchableFilterOptions(stateKey, input.value);
    });
    input.addEventListener('click', event => {
      event.stopPropagation();
      showSearchableList(stateKey);
      renderSearchableFilterOptions(stateKey, input.value);
    });

    list.addEventListener('click', event => event.stopPropagation());

    document.addEventListener('click', evt => {
      if(!wrapper.contains(evt.target)){
        hideSearchableList(stateKey);
        updateSelectionHint(stateKey);
      }
    });

    state.initialized = true;
  }

  function populateSearchableFilter(stateKey, values){
    const unique = Array.isArray(values) ? values.filter(Boolean) : [];
    const sorted = [...new Set(unique)].sort((a, b) => a.localeCompare(b, 'sk', { sensitivity: 'base' }));
    filterOptionsCache[stateKey] = sorted;
    renderSearchableFilterOptions(stateKey, '');
    hideSearchableList(stateKey);
    updateSelectionHint(stateKey);
  }

  function hideFiltersPanel(){
    const toggleBtn = document.getElementById('filters-toggle');
    const panel = document.getElementById('advanced-filters');
    const dateInput = document.getElementById('date-range');
    const newOnly = document.getElementById('new-only');

    if(toggleBtn){
      toggleBtn.classList.add('hidden');
    }
    if(panel){
      panel.classList.add('hidden');
    }

    const subcatOptions = document.getElementById('subcat-options');
    if(subcatOptions){
      subcatOptions.innerHTML = '';
      subcatOptions.classList.add('hidden');
    }
    const wrapper = document.getElementById('subcat-dropdown');
    if(wrapper){
      const opts = wrapper.querySelector('#subcat-options');
      if(opts){
        opts.classList.add('hidden');
      }
    }
    updateSubcatDropdownLabel();

    resetSearchableFilter('cities');
    resetSearchableFilter('zips');

    clearFilterState();
    availableDateRange.min = null;
    availableDateRange.max = null;

    if(dateInput){
      dateInput.value = '';
      dateInput.disabled = true;
    }
    if(newOnly){
      newOnly.checked = false;
      newOnly.disabled = true;
    }

    resetDateApplyButton();

    if(litepickerInstance && typeof litepickerInstance.destroy === 'function'){
      litepickerInstance.destroy();
    } else {
      clearLitepickerSelection();
    }
    litepickerInstance = null;
  }

  function createDatePicker(minDate, maxDate){
    const dateInput = document.getElementById('date-range');
    const newOnly = document.getElementById('new-only');

    if(!dateInput){
      return;
    }

    if(litepickerInstance && typeof litepickerInstance.destroy === 'function'){
      litepickerInstance.destroy();
      litepickerInstance = null;
    }

    dateInput.value = '';
    const hasRange = minDate instanceof Date && maxDate instanceof Date;
    dateInput.disabled = !hasRange;

    if(newOnly){
      newOnly.checked = false;
      newOnly.disabled = !hasRange;
    }

    if(!hasRange){
      pendingDateSelection = { start: null, end: null };
      resetDateApplyButton();
      return;
    }

    pendingDateSelection = { start: null, end: null };
    resetDateApplyButton();

    litepickerInstance = new Litepicker({
      element: dateInput,
      singleMode:false,
      format:'DD/MM/YYYY',
      lang:'sk',
      autoApply:true,
      tooltipText:{
        one : 'Deň',
        few : 'dni',
        other:'dní'
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
      minDate: minDate,
      maxDate: maxDate,
      setup: picker => picker.on('selected', (start, end) => {
        if(suppressDateSelectionHandling){
          return;
        }
        
        let startDate = null;
        let endDate = null;
        
        // Litepicker returns custom date objects with a .dateInstance property
        if(start && start.dateInstance instanceof Date){
          startDate = new Date(start.dateInstance.getTime());
        } else if(start && typeof start.toJSDate === 'function'){
          startDate = start.toJSDate();
        } else if(start && typeof start.toDate === 'function'){
          startDate = start.toDate();
        } else if(typeof start === 'string'){
          // Fallback: parse DD/MM/YYYY string
          const parts = start.split('/');
          if(parts.length === 3){
            startDate = new Date(parts[2], parts[1] - 1, parts[0]);
          }
        } else if(start instanceof Date){
          startDate = new Date(start.getTime());
        }
        
        if(end && end.dateInstance instanceof Date){
          endDate = new Date(end.dateInstance.getTime());
        } else if(end && typeof end.toJSDate === 'function'){
          endDate = end.toJSDate();
        } else if(end && typeof end.toDate === 'function'){
          endDate = end.toDate();
        } else if(typeof end === 'string'){
          // Fallback: parse DD/MM/YYYY string
          const parts = end.split('/');
          if(parts.length === 3){
            endDate = new Date(parts[2], parts[1] - 1, parts[0]);
          }
        } else if(end instanceof Date){
          endDate = new Date(end.getTime());
        }

        const normalizedStart = startDate ? toDayStart(startDate) : null;
        const normalizedEnd = endDate ? toDayStart(endDate) : null;

        pendingDateSelection = {
          start: normalizedStart instanceof Date && !Number.isNaN(normalizedStart.getTime()) ? normalizedStart.getTime() : null,
          end: normalizedEnd instanceof Date && !Number.isNaN(normalizedEnd.getTime()) ? normalizedEnd.getTime() : null,
        };
        filterState.newOnly = false;
        enableDateApplyButton();
      })
    });
  }

  function applyPendingDateRange(){
    if(typeof pendingDateSelection.start !== 'number' || typeof pendingDateSelection.end !== 'number'){
      return;
    }

    const newOnlyCheckbox = document.getElementById('new-only');
    if(newOnlyCheckbox){
      newOnlyCheckbox.checked = false;
    }

    filterState.startDate = pendingDateSelection.start;
    filterState.endDate = pendingDateSelection.end;
    filterState.newOnly = false;
    pendingDateSelection = { start: null, end: null };
    resetDateApplyButton();
    applyFilters();
  }  function initializeFilters(items){
    if(!Array.isArray(items) || items.length === 0){
      hideFiltersPanel();
      return;
    }

    const toggleBtn = document.getElementById('filters-toggle');
    const panel = document.getElementById('advanced-filters');
    if(toggleBtn){
      toggleBtn.classList.remove('hidden');
    }
    if(panel){
      panel.classList.add('hidden');
    }

    clearFilterState();
    filterOptionsCache.subcategories = [];
    filterOptionsCache.cities = [];
    filterOptionsCache.zips = [];

    const subcats = new Set();
    const cities = new Set();
    const zips = new Set();
    const dateValues = [];

    items.forEach(item => {
      const subcat = normalizeValue(item && item.subcat);
      if(subcat){
        subcats.add(subcat);
      }

      const city = normalizeValue(item && (item.city ?? item.City ?? item.location_city));
      if(city){
        cities.add(city);
      }

      const zip = normalizeValue(item && (item.zip_code ?? item.zip ?? item.zipCode ?? item.postal_code ?? item.postcode));
      if(zip){
        zips.add(zip);
      }

      const normalizedDateValue =
        typeof item.__d === 'number'
          ? item.__d
          : getNormalizedDateValue(extractDateField(item));

      if(typeof normalizedDateValue === 'number'){
        dateValues.push(normalizedDateValue);
      }
    });

    populateSubcategoryOptions(Array.from(subcats));
    populateSearchableFilter('cities', Array.from(cities));
    populateSearchableFilter('zips', Array.from(zips));

    if(dateValues.length){
      const minDate = new Date(Math.min(...dateValues));
      const maxDate = new Date(Math.max(...dateValues));
      availableDateRange.min = toDayStart(minDate);
      availableDateRange.max = toDayStart(maxDate);
      createDatePicker(availableDateRange.min, availableDateRange.max);
    } else {
      availableDateRange.min = null;
      availableDateRange.max = null;
      createDatePicker(null, null);
    }
  }

  function applyFilters(){
    if(!Array.isArray(allResults) || allResults.length === 0){
      currentFilteredResults = Array.isArray(allResults) ? allResults : [];
      updateResultsDisplay(currentFilteredResults);
      return;
    }

    const startTs = typeof filterState.startDate === 'number' ? filterState.startDate : null;
    const endTs   = typeof filterState.endDate === 'number' ? filterState.endDate : null;
    const latestTs = availableDateRange.max instanceof Date ? availableDateRange.max.getTime() : null;

    const filtered = allResults.filter(item => {
      const subcatVal = normalizeValue(item && item.subcat);
      if(filterState.subcategories.size && !filterState.subcategories.has(subcatVal)){
        return false;
      }

      const cityVal = normalizeValue(item && (item.city ?? item.City ?? item.location_city));
      if(filterState.cities.size && !filterState.cities.has(cityVal)){
        return false;
      }

      const zipVal = normalizeValue(item && (item.zip_code ?? item.zip ?? item.zipCode ?? item.postal_code ?? item.postcode));
      if(filterState.zips.size && !filterState.zips.has(zipVal)){
        return false;
      }

      const adDateValue =
        item && typeof item === 'object' && typeof item.__d === 'number'
          ? item.__d
          : getNormalizedDateValue(extractDateField(item));

      if(filterState.newOnly){
        if(latestTs === null) return false;
        if(typeof adDateValue !== 'number') return false;
        return adDateValue === latestTs;
      }

      const hasStart = typeof startTs === 'number';
      const hasEnd = typeof endTs === 'number';
      if(hasStart || hasEnd){
        if(typeof adDateValue !== 'number') return false;
        if(hasStart && adDateValue < startTs){
          return false;
        }
        if(hasEnd && adDateValue > endTs){
          return false;
        }
      }

      return true;
    });

    currentFilteredResults = filtered;
    updateResultsDisplay(filtered);
  }

  function updateResultsDisplay(items){
    currentFilteredResults = Array.isArray(items) ? items : [];
    const out = document.getElementById('output');
    const countEl = document.getElementById('results-count');

    const downloadBtn = document.getElementById('download-btn');

    if(!Array.isArray(items) || items.length === 0){
      if(out){
        out.innerHTML = "<p class='text-red-500'>Žiadne výsledky neboli nájdené.</p>";
      }
      if(countEl){
        countEl.textContent = 'Počet výsledkov: 0';
      }
      if(downloadBtn){
        downloadBtn.onclick = () => {};
      }
      return;
    }

    const rows = items
      .map(it => {
        const url = it && it.url ? it.url : it;
        const safeUrl = escapeHtml(url || '');
        if(!safeUrl){
          return '';
        }
        return `<a href="${safeUrl}" target="_blank" class="block text-blue-600 hover:underline">${safeUrl}</a>`;
      })
      .filter(Boolean);

    if(out){
      out.innerHTML = rows.join("");
    }
    if(countEl){
      countEl.textContent = `Počet výsledkov: ${items.length}`;
    }

    if(downloadBtn){
      downloadBtn.onclick = () => {
        const urls = items.map(it => (it && it.url) ? it.url : it).filter(Boolean);
        const blob = new Blob([urls.join("\n")],{type:"text/plain"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = "vysledky.txt";
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      };
    }
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

  async function waitForJobCompletion(){
    while(true){
      if(cancelRequested){
        throw new Error('Zber bol zrušený.');
      }

      let resp;
      try{
        resp = await fetch(`${API_BASE}/job_status`, { headers: authHeaders() });
      }catch(err){
        await delay(2000);
        continue;
      }

      if(resp.status === 401){
        handleUnauthorized();
        throw new Error('Prihlásenie vypršalo, prihláste sa prosím znova.');
      }

      let payload;
      try{
        payload = await resp.json();
      }catch(err){
        await delay(2000);
        continue;
      }

      const job = payload && typeof payload === 'object' ? (payload.job || payload) : null;
      if(!job){
        await delay(2000);
        continue;
      }

      if(job.status === 'failed'){
        throw new Error(job.error || 'Zber zlyhal.');
      }

      if(job.status === 'finished' && job.results_ready){
        return job;
      }

      await delay(2000);
    }
  }

  async function fetchLatestResultsFromServer(){
    const payload = {
      mode: 'latest',
      date_start: formatDDMMYYYY(filterState.startDate) || null,
      date_end: formatDDMMYYYY(filterState.endDate) || null,
    };

    const resp = await fetch(`${API_BASE}/scrape`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });

    const { data } = await readResponsePayload(resp);

    if(resp.status === 401){
      handleUnauthorized();
      throw new Error('Prihlásenie vypršalo, prihláste sa prosím znova.');
    }

    if(!resp.ok){
      let message = `Chyba pri spracovaní (kód ${resp.status})`;
      if(data){
        if(typeof data === 'string'){
          message = data;
        }else if(typeof data === 'object' && typeof data.error === 'string'){
          message = data.error;
        }
      }
      throw new Error(message);
    }

    if(Array.isArray(data)){
      return data;
    }

    return [];
  }

  async function startScrape(mode){
    cancelRequested = false;
    const bar   = document.getElementById('progress-bar');
    const prog  = document.getElementById('progress');
    const label = document.getElementById('stage-label');
    const resCt = document.getElementById('results-section');
    const out   = document.getElementById('output');
    const progressLabel = document.getElementById('progress-label');

    allResults = [];
    currentFilteredResults = [];
    hideFiltersPanel();
    toggleButtons(true);
    bar.classList.remove('hidden');
    resCt.classList.add('hidden');
    out.innerHTML = "";
    prog.style.width = "0%";
    label.textContent = "";
    document.getElementById('results-count').textContent = '';

    const startDateStr = formatDDMMYYYY(filterState.startDate);
    const endDateStr = formatDDMMYYYY(filterState.endDate);

    const payload = {
      mode,
      date_start: startDateStr || null,
      date_end: endDateStr || null,
    };

    if (cancelRequested) {
      toggleButtons(false);
      return;
    }

    try {
      const resp = await fetch(`${API_BASE}/scrape`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });
      const { data } = await readResponsePayload(resp);

      if (resp.status === 401) {
        handleUnauthorized();
        throw new Error('Prihlásenie vypršalo, prihláste sa prosím znova.');
      }

      if (!resp.ok) {
        let message = `Chyba pri spracovaní (kód ${resp.status})`;
        if (data) {
          if (typeof data === 'string') {
            message = data;
          } else if (typeof data === 'object' && typeof data.error === 'string') {
            message = data.error;
          }
        }
        throw new Error(message);
      }

      if(mode === 'new'){
        if(!data || typeof data !== 'object'){
          throw new Error('Neočakávaná odpoveď zo servera.');
        }
        if(data.ok === false){
          throw new Error(typeof data.error === 'string' ? data.error : 'Zber už prebieha.');
        }
        if(data.ok !== true){
          throw new Error('Neočakávaná odpoveď zo servera.');
        }

        startProgressPolling();
        await waitForJobCompletion();

        if(cancelRequested){
          throw new Error('Zber bol zrušený.');
        }

        const latestResults = await fetchLatestResultsFromServer();

        if(progressInterval){
          clearInterval(progressInterval);
          progressInterval = null;
        }

        prog.style.width = "100%";
        label.textContent = "Hotovo";
        bar.classList.add('hidden');
        resCt.classList.remove('hidden');
        displayResults(Array.isArray(latestResults) ? latestResults : []);
        if(progressLabel){
          progressLabel.textContent = '✅ Hotovo!';
        }
        return;
      }

      const links = Array.isArray(data) ? data : [];
      prog.style.width = "100%";
      label.textContent = "Hotovo";
      bar.classList.add('hidden');
      resCt.classList.remove('hidden');
      displayResults(links);
    } catch (err) {
      if(progressInterval){
        clearInterval(progressInterval);
        progressInterval = null;
      }
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

  function toggleAdvancedFilters(){
    const panel = document.getElementById('advanced-filters');
    if(panel){
      panel.classList.toggle('hidden');
    }
  }

  function toggleDateInputs(cb){
    const dateInput = document.getElementById('date-range');
    if(!dateInput){
      return;
    }

    if(cb.checked){
      if(!(availableDateRange.max instanceof Date)){
        cb.checked = false;
        return;
      }
      dateInput.disabled = true;
      pendingDateSelection = { start: null, end: null };
      resetDateApplyButton();
      filterState.newOnly = true;
      const latestTs = availableDateRange.max.getTime();
      filterState.startDate = latestTs;
      filterState.endDate = latestTs;

      if(litepickerInstance && typeof litepickerInstance.setDateRange === 'function'){
        suppressDateSelectionHandling = true;
        try {
          litepickerInstance.setDateRange(availableDateRange.max, availableDateRange.max);
        } catch (err) {
          // ignore if Litepicker cannot update range directly
        } finally {
          suppressDateSelectionHandling = false;
        }
      }

      dateInput.value = formatDateForDisplay(availableDateRange.max);
    } else {
      filterState.newOnly = false;
      filterState.startDate = null;
      filterState.endDate = null;
      dateInput.disabled = !(availableDateRange.min && availableDateRange.max);
      if(!dateInput.disabled){
        dateInput.value = '';
      }
      clearLitepickerSelection();
    }

    applyFilters();
  }

  /* ---------- DOM READY ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('auth-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-link').addEventListener('click', e=>{e.preventDefault(); logout();});
    initializeSubcategoryDropdown();
    initializeSearchableFilter('cities', {
      wrapperId: 'city-filter',
      inputId: 'city-search',
      listId: 'city-options',
      hintId: 'city-selection-hint',
    });
    initializeSearchableFilter('zips', {
      wrapperId: 'zip-filter',
      inputId: 'zip-search',
      listId: 'zip-options',
      hintId: 'zip-selection-hint',
    });
    const dateApplyBtn = document.getElementById('date-apply-btn');
    if(dateApplyBtn){
      dateApplyBtn.addEventListener('click', applyPendingDateRange);
    }
    checkAuth();
    setupServerStatusControls();
    hideFiltersPanel();
  });

  function displayResults(items){
    const section = document.getElementById('results-section');
    if(section){
      section.classList.remove('hidden');
    }

    allResults = Array.isArray(items) ? items.map(enhanceResultItem) : [];
    initializeFilters(allResults);
    applyFilters();
  }

  let progressInterval;
  function startProgressPolling() {
    const progressLabel = document.getElementById("progress-label");
    const prog = document.getElementById("progress");
    const stageLabel = document.getElementById('stage-label');
    if(progressLabel){
      progressLabel.textContent = "";
    }
    if(progressInterval){
      clearInterval(progressInterval);
    }
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
            progressInterval = null;
            return;
          }
          const done = Number(data.done) || 0;
          const total = Number(data.total) || 0;
          const pct = total > 0 ? (done / total) * 100 : 15;
          prog.style.width = pct + "%";
          if(stageLabel){
            stageLabel.textContent = `${data.phase}`;
          }
          const labels = {
            "1/5 Zber sitemap": "Sitemapy stiahnuté",
            "2/5 Prvé filtrovanie": "Filtrované",
            "3/5 Sťahovanie inzerátov": "Stiahnuté",
            "4/5 Filtrovanie popisov": "Filtrované",
            "5/5 OpenAI filtrovanie": "Vyhodnotené"
          };
          const prefix = labels[data.phase] ? labels[data.phase] + ": " : "";
          if(progressLabel){
            progressLabel.textContent = `${prefix}${done}/${total}`;
          }
          const job = data && typeof data === 'object' ? (data.job || {}) : {};
          if(job.status === 'failed'){
            if(progressLabel){
              progressLabel.textContent = job.error || 'Zber zlyhal.';
            }
            if(stageLabel && typeof job.phase === 'string'){
              stageLabel.textContent = job.phase;
            }
            clearInterval(progressInterval);
            progressInterval = null;
            toggleButtons(false);
            return;
          }
          if (data.phase === "Hotovo") {
            if(progressLabel){
              progressLabel.textContent = "✅ Hotovo!";
            }
            clearInterval(progressInterval);
            progressInterval = null;
            toggleButtons(false);
          }
        })
        .catch(() => {
          clearInterval(progressInterval);
          progressInterval = null;
          if(progressLabel){
            progressLabel.textContent = "";
          }
          toggleButtons(false);
        });
    }, 1000);
  }

    function cancelScrape() {
      cancelRequested = true;
      clearInterval(progressInterval);
      progressInterval = null;
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



  
