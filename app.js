(function () {
  var root = document.getElementById("app");
  var cfg = window.DEVICELAB || {};
  var state = {
    session: null,
    eventId: "",
    rows: [],
    page: "home",
    query: "",
    mission: [],
    index: 0,
    captureFor: null,
    form: blankForm(),
    here: loadHere(),
    research: null,
    jobs: [],
    profile: null,
    reviewQuery: "",
    relation: "all",
    notice: "",
    error: "",
    busy: false,
    saved: "",
    savedName: "",
    returnTo: "research",
    hall: "",
    mapHall: "",
    mapFocusId: "",
    mapBack: "home",
    mapView: "list",
    mapMode: "mission",
    mapPriority: true,
    mapVisited: false,
    mapLabels: true,
    missionBack: "",
    photos: {},
    photoError: "",
    photoBusy: false,
    voices: {},
    voiceError: "",
    voiceBusy: false,
    voiceArming: false,
    recording: null,
    playingId: "",
    playingFor: "",
    outbox: [],
    db: null,
    syncing: false,
    syncAuth: false,
    saving: false,
    runs: [],
    followups: [],
    contacts: [],
    notes: [],
    memoryLoaded: false,
    afterQuery: "",
    afterColdOpen: false,
    afterError: "",
    afterNotice: "",
    dayFresh: false,
    loadingDay: false,
    messeDetail: false,
    relationOpen: false,
    folds: {},
    contactDraft: null,
    noteDraft: "",
    noteSaving: false,
    noteError: ""
  };
  var PHOTO_MAX_SIDE = 3200;
  var PHOTO_JPEG_QUALITY = 0.92;
  var VOICE_BITRATE = 128000;
  var VOICE_MAX_MS = 180000;
  var VOICE_MIN_MS = 500;
  var player = new Audio();

  var outcomes = {
    not_interesting: "Ikke interessant",
    maybe: "Måske interessant",
    interesting: "Interessant",
    hot: "Hot Lead"
  };
  var suggestions = {
    warm: "Varm",
    follow: "Værd at følge",
    cold: "Kold",
    thin: "Ikke nok"
  };
  var actions = {
    none: "Ingen",
    email: "Send mail",
    call: "Ring",
    demo: "Book demo",
    partner: "Partnerdialog",
    again: "Besøg igen"
  };
  var levels = {
    no_interest: "Ingen interesse",
    interested: "Interesseret",
    contact: "Vil kontaktes",
    demo: "Ønsker demo",
    very: "Meget interesseret"
  };
  var visitValues = { high: "Høj besøgsværdi", medium: "Mellem besøgsværdi", low: "Lav besøgsværdi" };
  var types = {
    potential_customer: "Potentiel kunde",
    potential_partner: "Potentiel partner",
    potential_integration_partner: "Potentiel integrationspartner"
  };
  var relations = {
    new: "Ny virksomhed",
    existing_contact: "Eksisterende kontakt",
    existing_customer: "Eksisterende kunde",
    existing_partner: "Eksisterende partner",
    later: "Kontakt igen senere",
    not_needed: "Kontakt ikke nødvendig"
  };
  var typeLabels = {
    potential_customer: "Potentiel kunde",
    potential_partner: "Potentiel partner",
    potential_integration_partner: "Potentiel integrationspartner",
    low_relevance: "Lav relevans"
  };
  var businessNames = [
    "Målerproducent",
    "Smart Metering virksomhed",
    "Meter Data Management virksomhed",
    "IoT Platform",
    "Utility Software",
    "Gateway Producent",
    "System Integrator",
    "Kommunikationsleverandør",
    "Energiselskab",
    "Konsulenthus",
    "Industry Media",
    "Andet"
  ];

  function businessRole(row) {
    var value = (row && row.industry) || "";
    return businessNames.indexOf(value) >= 0 ? value : "";
  }

  function blankForm() {
    return {
      result: "",
      action: "none",
      level: "",
      notes: "",
      contactOpen: false,
      name: "",
      title: "",
      email: "",
      phone: "",
      ready: false,
      dirty: false,
      touched: {},
      snapshot: {}
    };
  }

  function actionCode(label) {
    var keys = Object.keys(actions);
    for (var i = 0; i < keys.length; i += 1) {
      if (actions[keys[i]] === label) return keys[i];
    }
    return "none";
  }

  function byNewest(a, b) {
    return (a.created_at || "") < (b.created_at || "") ? 1 : -1;
  }

  function knownContacts(companyId) {
    var byId = {};
    (state.contacts || []).forEach(function (item) {
      if (item.company_id === companyId) byId[item.id] = item;
    });
    mine(companyId).forEach(function (op) {
      if (op.kind === "contact" && !op.cancel) byId[op.id] = op.body;
    });
    return Object.keys(byId).map(function (id) { return byId[id]; }).sort(byNewest);
  }

  function latestContact(companyId) {
    return knownContacts(companyId)[0] || null;
  }

  function knownNotes(companyId) {
    var byId = {};
    (state.notes || []).forEach(function (item) {
      if (item.company_id === companyId) byId[item.id] = item;
    });
    mine(companyId).forEach(function (op) {
      if (op.kind === "note" && !op.cancel) byId[op.id] = op.body;
    });
    return Object.keys(byId).map(function (id) { return byId[id]; }).sort(byNewest);
  }

  function visibleNote(row) {
    if (!row) return "";
    if ((row.summary || "").trim()) return row.summary.trim();
    var note = knownNotes(row.id)[0];
    return note && note.body ? note.body.trim() : "";
  }

  function allFollowups() {
    var byId = {};
    (state.followups || []).forEach(function (item) { byId[item.id] = item; });
    mine().forEach(function (op) {
      if (op.kind !== "followup" || op.cancel) return;
      byId[op.id] = {
        id: op.id,
        company_id: op.companyId,
        title: op.body.title,
        done: false,
        created_at: op.body.created_at || op.createdAt
      };
    });
    return Object.keys(byId).map(function (id) { return byId[id]; });
  }

  function hasOpenFollowup(companyId, title) {
    return allFollowups().some(function (item) {
      return item.company_id === companyId && !item.done && item.title === title;
    });
  }

  function formFrom(row) {
    var contact = latestContact(row.id);
    var note = visibleNote(row);
    var action = actionCode(row.next_step || "");
    var level = levels[row.sales_opportunity] ? row.sales_opportunity : "";
    var result = outcomes[row.relevance] ? row.relevance : "";
    var name = contact && contact.name ? contact.name : "";
    var title = contact && contact.title ? contact.title : "";
    var email = contact && contact.email ? contact.email : "";
    var phone = contact && contact.phone ? contact.phone : "";
    return {
      result: result,
      action: action,
      level: level,
      notes: note,
      contactOpen: !!(name || title || email || phone),
      name: name,
      title: title,
      email: email,
      phone: phone,
      ready: !!state.memoryLoaded,
      dirty: false,
      touched: {},
      snapshot: {
        result: result,
        action: action,
        level: level,
        notes: note,
        name: name,
        title: title,
        email: email,
        phone: phone,
        contactId: contact ? contact.id : ""
      }
    };
  }

  function fillForm(row) {
    state.form = formFrom(row);
  }

  function adoptSnapshot(row) {
    var fresh = formFrom(row);
    var form = state.form || blankForm();
    ["result", "action", "level", "notes", "name", "title", "email", "phone"].forEach(function (key) {
      if (!form.touched[key]) form[key] = fresh[key];
    });
    if (!form.touched.name && !form.touched.title && !form.touched.email && !form.touched.phone) {
      form.contactOpen = fresh.contactOpen;
    }
    form.snapshot = fresh.snapshot;
    form.ready = true;
    state.form = form;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "class") node.className = attrs[key];
      else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2), attrs[key]);
      else if (attrs[key] != null) node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child == null || child === false) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem("dl-session") || "null"); }
    catch (err) { return null; }
  }

  function saveSession(session) {
    state.session = session;
    if (session) localStorage.setItem("dl-session", JSON.stringify(session));
    else localStorage.removeItem("dl-session");
  }

  function loadHere() {
    try { return JSON.parse(localStorage.getItem("dl-here") || "null"); }
    catch (err) { return null; }
  }

  function saveHere(row) {
    state.here = row ? { id: row.id, name: row.name, hall: row.hall, stand: row.stand_number } : null;
    if (state.here) localStorage.setItem("dl-here", JSON.stringify(state.here));
  }

  function loadMapPrefs() {
    try {
      var saved = JSON.parse(localStorage.getItem("dl-map") || "");
      if (!saved || (saved.mode !== "orient" && saved.mode !== "mission")) return null;
      return {
        mode: saved.mode,
        priority: saved.priority !== false,
        visited: !!saved.visited,
        labels: saved.labels !== false
      };
    } catch (err) {
      return null;
    }
  }

  function saveMapPrefs() {
    try {
      localStorage.setItem("dl-map", JSON.stringify({
        mode: state.mapMode,
        priority: !!state.mapPriority,
        visited: !!state.mapVisited,
        labels: !!state.mapLabels
      }));
    } catch (err) { /* private mode */ }
  }

  function userId() {
    var token = state.session && state.session.access_token;
    if (!token) return "";
    try {
      var part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (part.length % 4) part += "=";
      var data = JSON.parse(atob(part));
      return data.sub || "";
    } catch (err) {
      return "";
    }
  }

  function phoneFull(err) {
    var name = err && err.name;
    return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
  }

  function keepMessage(err) {
    return phoneFull(err) ? "Telefonen kunne ikke gemme det. Frigør plads og prøv igen." : "";
  }

  function openDb() {
    if (state.db) return Promise.resolve(state.db);
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open("devicelab", 1);
      request.onupgradeneeded = function () {
        var base = request.result;
        if (!base.objectStoreNames.contains("fair")) base.createObjectStore("fair");
        if (!base.objectStoreNames.contains("outbox")) base.createObjectStore("outbox", { keyPath: "id" });
        if (!base.objectStoreNames.contains("files")) base.createObjectStore("files");
      };
      request.onsuccess = function () {
        state.db = request.result;
        resolve(state.db);
      };
      request.onerror = function () { reject(request.error); };
    });
  }

  function idbDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error("afbrudt")); };
    });
  }

  async function idbPut(store, value, key) {
    var base = await openDb();
    var tx = base.transaction(store, "readwrite");
    if (key === undefined) tx.objectStore(store).put(value);
    else tx.objectStore(store).put(value, key);
    await idbDone(tx);
  }

  async function idbGet(store, key) {
    var base = await openDb();
    return new Promise(function (resolve, reject) {
      var tx = base.transaction(store, "readonly");
      var request = tx.objectStore(store).get(key);
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  async function idbAll(store) {
    var base = await openDb();
    return new Promise(function (resolve, reject) {
      var tx = base.transaction(store, "readonly");
      var request = tx.objectStore(store).getAll();
      request.onsuccess = function () { resolve(request.result || []); };
      request.onerror = function () { reject(request.error); };
    });
  }

  async function remember(op, blob) {
    var base = await openDb();
    var tx = base.transaction(blob ? ["outbox", "files"] : ["outbox"], "readwrite");
    tx.objectStore("outbox").put(op);
    if (blob) tx.objectStore("files").put(blob, op.id);
    await idbDone(tx);
    var known = false;
    state.outbox.forEach(function (item, index) {
      if (item.id !== op.id) return;
      state.outbox[index] = op;
      known = true;
    });
    if (!known) state.outbox.push(op);
  }

  async function forget(id) {
    state.outbox = state.outbox.filter(function (item) { return item.id !== id; });
    var base = await openDb();
    var tx = base.transaction(["outbox", "files"], "readwrite");
    tx.objectStore("outbox").delete(id);
    tx.objectStore("files").delete(id);
    await idbDone(tx);
  }

  function mine(companyId) {
    return state.outbox.filter(function (item) {
      if (item.userId !== userId() || item.cancel) return false;
      return !companyId || item.companyId === companyId;
    });
  }

  function applyOverlay() {
    mine().filter(function (item) { return item.kind === "visit"; }).sort(function (a, b) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }).forEach(function (item) {
      var row = state.rows.filter(function (entry) { return entry.id === item.companyId; })[0];
      if (row) Object.assign(row, item.body);
    });
  }

  async function enqueueVisit(companyId, patch) {
    var pending = mine(companyId).filter(function (item) {
      return item.kind === "visit" && item.status !== "sending";
    })[0];
    var when = patch.updated_at || new Date().toISOString();
    if (pending) {
      pending.body = Object.assign({}, pending.body, patch);
      pending.status = "pending";
      pending.error = "";
      pending.createdAt = when;
      await remember(pending);
      return pending;
    }
    var op = {
      id: crypto.randomUUID(),
      userId: userId(),
      companyId: companyId,
      kind: "visit",
      body: patch,
      status: "pending",
      attempts: 0,
      error: "",
      createdAt: when,
      cancel: false,
      uploaded: false
    };
    await remember(op);
    return op;
  }

  async function enqueueText(companyId, kind, body) {
    var op = {
      id: body.id,
      userId: userId(),
      companyId: companyId,
      kind: kind,
      body: body,
      status: "pending",
      attempts: 0,
      error: "",
      createdAt: body.created_at,
      cancel: false,
      uploaded: false
    };
    await remember(op);
    return op;
  }

  async function enqueueFile(companyId, kind, body, blob, mime) {
    var op = {
      id: body.id,
      userId: userId(),
      companyId: companyId,
      kind: kind,
      body: body,
      mime: mime || blob.type || "",
      status: "pending",
      attempts: 0,
      error: "",
      createdAt: body.created_at,
      cancel: false,
      uploaded: false
    };
    await remember(op, blob);
    return op;
  }

  async function rememberAll(ops) {
    if (!ops.length) return;
    var base = await openDb();
    var tx = base.transaction("outbox", "readwrite");
    ops.forEach(function (op) { tx.objectStore("outbox").put(op); });
    await idbDone(tx);
    ops.forEach(function (op) {
      var known = false;
      state.outbox.forEach(function (item, index) {
        if (item.id !== op.id) return;
        state.outbox[index] = op;
        known = true;
      });
      if (!known) state.outbox.push(op);
    });
  }

  async function saveFair() {
    var id = userId();
    if (!id || !state.rows.length) return;
    try {
      await idbPut("fair", {
        eventId: state.eventId,
        rows: state.rows,
        contacts: state.contacts || [],
        notes: state.notes || [],
        followups: state.followups || [],
        memory: !!state.memoryLoaded
      }, id);
    } catch (err) { /* dagen kan stadig ligge i hukommelsen */ }
  }

  function syncView(companyId) {
    var items = mine(companyId);
    var failed = items.filter(function (item) { return item.status === "error"; });
    var waiting = items.filter(function (item) { return item.status !== "error"; });
    if (state.syncing && (!companyId || items.length)) return { text: "Synkroniserer", error: false, action: "" };
    if (state.syncAuth && items.length) return { text: "Log ind for at sende det, der venter.", error: true, action: "login" };
    if (failed.length && waiting.length) {
      return {
        text: failed.length + " kunne ikke sendes. " + waiting.length + " afventer synkronisering. Dataene ligger på telefonen.",
        error: true,
        action: "sync"
      };
    }
    if (failed.length) return { text: failed.length + " kunne ikke sendes. Dataene ligger på telefonen.", error: true, action: "sync" };
    if (waiting.length) return { text: waiting.length + " afventer synkronisering. Dataene ligger på telefonen.", error: false, action: "sync" };
    if (!companyId) return { text: "Synkroniseret", error: false, action: "" };
    return null;
  }

  function syncLine(companyId) {
    var view = syncView(companyId);
    if (companyId && !view) return null;
    view = view || { text: "Synkroniseret", error: false, action: "" };
    var button = null;
    if (view.action === "sync") {
      button = el("button", { class: "link", type: "button", onclick: syncNow }, ["Synk nu"]);
    } else if (view.action === "login") {
      button = el("button", { class: "link", type: "button", onclick: function () { saveSession(null); render(); } }, ["Log ind"]);
    }
    return el("div", { class: "syncbox", "data-sync": companyId || "" }, [
      el("p", { class: view.error ? "error" : "quiet" }, [view.text]),
      button
    ]);
  }

  function paintSync() {
    document.querySelectorAll("[data-sync]").forEach(function (node) {
      var companyId = node.getAttribute("data-sync") || "";
      var fresh = syncLine(companyId);
      if (!fresh) {
        node.remove();
        return;
      }
      node.replaceWith(fresh);
    });
    paintHomeReady();
    if (state.page === "ready") render();
  }

  function mediaLabel(id) {
    var op = state.outbox.filter(function (item) { return item.id === id && !item.cancel; })[0];
    if (!op) return "";
    return op.status === "error" ? "Fejl" : "Afventer synkronisering";
  }

  async function postIgnore(path, body) {
    try {
      await call(path + "?on_conflict=id", {
        method: "POST",
        prefer: "resolution=ignore-duplicates,return=minimal",
        body: body
      });
    } catch (err) {
      if (err.status !== 409) throw err;
    }
  }

  async function removeRow(table, id) {
    try {
      await call("/rest/v1/" + table + "?id=eq." + encodeURIComponent(id), { method: "DELETE", prefer: "return=minimal" });
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }

  async function sendOp(op) {
    op.status = "sending";
    op.attempts += 1;
    await remember(op);
    try {
      if (op.kind === "visit") {
        await call("/rest/v1/exhibitors?id=eq." + encodeURIComponent(op.companyId), {
          method: "PATCH",
          prefer: "return=minimal",
          body: op.body
        });
      } else if (op.kind === "note") {
        await postIgnore("/rest/v1/notes", op.body);
      } else if (op.kind === "contact") {
        await postIgnore("/rest/v1/contacts", op.body);
      } else if (op.kind === "followup") {
        await postIgnore("/rest/v1/followups", op.body);
      } else if (op.kind === "contact_update") {
        await call("/rest/v1/contacts?id=eq." + encodeURIComponent(op.contactId), {
          method: "PATCH",
          prefer: "return=minimal",
          body: op.body
        });
      } else if (op.kind === "photo_delete") {
        await removeRow("images", op.body.id);
        await deleteObject(op.body.key);
      } else if (op.kind === "voice_delete") {
        await removeRow("voice_notes", op.body.id);
        await deleteObject(op.body.key);
      } else if (op.kind === "photo" || op.kind === "voice") {
        await sendFile(op);
        return;
      }
      await forget(op.id);
    } catch (err) {
      if (err.status === 409) {
        await forget(op.id);
        return;
      }
      await hold(op, err);
    }
  }

  async function sendFile(op) {
    var blob = await idbGet("files", op.id);
    if (!blob) {
      op.status = "error";
      op.error = "Filen mangler på telefonen.";
      await remember(op);
      return;
    }
    var key = op.body.storage_key || op.body.audio_key;
    if (op.kind === "photo") await putPhoto(key, blob);
    else await putVoice(key, blob);
    op.uploaded = true;
    await remember(op);
    if (op.cancel) {
      await deleteObject(key);
      await removeRow(op.kind === "photo" ? "images" : "voice_notes", op.id);
      await forget(op.id);
      return;
    }
    var table = op.kind === "photo" ? "/rest/v1/images" : "/rest/v1/voice_notes";
    await postIgnore(table, op.body);
    await forget(op.id);
  }

  async function hold(op, err) {
    var rejected = err.status && err.status !== 401 && err.status !== 408 && err.status !== 429 && err.status < 500;
    op.status = rejected ? "error" : "pending";
    op.error = rejected ? "Fejl" : "";
    await remember(op);
    if (!rejected) throw err;
  }

  function nextText() {
    var sendingVisit = {};
    mine().forEach(function (item) {
      if (item.kind === "visit" && item.status === "sending") sendingVisit[item.companyId] = true;
    });
    var text = mine().filter(function (item) {
      return item.status === "pending" && item.kind !== "photo" && item.kind !== "voice";
    }).sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    for (var i = 0; i < text.length; i += 1) {
      if (text[i].kind === "visit" && sendingVisit[text[i].companyId]) continue;
      return text[i];
    }
    return null;
  }

  function nextFile() {
    var files = mine().filter(function (item) {
      return item.status === "pending" && (item.kind === "photo" || item.kind === "voice");
    }).sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    return files[0] || null;
  }

  async function flush() {
    if (state.syncing) {
      state.flushAgain = true;
      return;
    }
    if (!mine().length) {
      paintSync();
      return;
    }
    state.syncing = true;
    paintSync();
    try {
      await ensureSession();
      state.syncAuth = false;
      if (reopenMedia() && (state.page === "capture" || state.page === "profile")) render();
      var guard = 0;
      var sentFile = false;
      while (guard < 80) {
        guard += 1;
        var text = nextText();
        if (text) {
          await sendOp(text);
          continue;
        }
        var file = nextFile();
        if (!file) break;
        await sendOp(file);
        sentFile = true;
      }
    } catch (err) {
      if (err && err.status === 401) state.syncAuth = true;
    }
    state.syncing = false;
    if (sentFile && (state.page === "capture" || state.page === "profile")) render();
    else paintSync();
    if (state.flushAgain) {
      state.flushAgain = false;
      flush();
    }
  }

  function syncNow() {
    mine().forEach(function (item) {
      if (item.status === "error") item.status = "pending";
    });
    Promise.all(mine().filter(function (item) { return item.status === "pending"; }).map(function (item) {
      return remember(item);
    })).then(flush, flush);
  }

  async function queuedMedia(companyId, kind) {
    var ops = mine(companyId).filter(function (item) { return item.kind === kind; });
    var ready = [];
    for (var i = 0; i < ops.length; i += 1) {
      var blob = null;
      try { blob = await idbGet("files", ops[i].id); } catch (err) { blob = null; }
      ready.push({ body: ops[i].body, url: blob ? URL.createObjectURL(blob) : "" });
    }
    return ready;
  }

  async function dropOrQueue(kind, companyId, item, key) {
    var live = state.outbox.filter(function (op) { return op.id === item.id; })[0];
    if (live && (live.kind === "photo" || live.kind === "voice")) {
      if (live.status === "sending") {
        live.cancel = true;
        await remember(live);
        return;
      }
      await forget(live.id);
      return;
    }
    var deleteId = item.id + ":delete";
    if (state.outbox.some(function (op) { return op.id === deleteId; })) return;
    await remember({
      id: deleteId,
      userId: userId(),
      companyId: companyId,
      kind: kind,
      body: { id: item.id, key: key },
      status: "pending",
      attempts: 0,
      error: "",
      createdAt: new Date().toISOString(),
      cancel: false,
      uploaded: false
    });
  }

  async function call(path, options) {
    options = options || {};
    var token = options.token || (state.session && state.session.access_token) || cfg.key;
    var headers = { apikey: cfg.key, Authorization: "Bearer " + token, "Content-Type": "application/json" };
    if (options.prefer) headers.Prefer = options.prefer;
    var response = await fetch(cfg.url + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var text = await response.text();
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (err) { data = { message: text }; }
    }
    if (!response.ok) {
      var error = new Error((data && (data.msg || data.message || data.error_description)) || "Noget gik galt");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function ensureSession() {
    var session = state.session;
    if (!session) return false;
    if (session.expires_at && Date.now() < session.expires_at - 60000) return true;
    try {
      var data = await call("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        token: cfg.key,
        body: { refresh_token: session.refresh_token }
      });
      saveSession(storeToken(data));
      state.syncAuth = false;
      return true;
    } catch (err) {
      if (err.status === 401) state.syncAuth = true;
      throw err;
    }
  }

  function storeToken(data) {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      email: data.user && data.user.email
    };
  }

  function asList(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function attach(row) {
    var profile = row.companies || {};
    row.profile = profile;
    row.match_score = profile.match_score || 0;
    row.relationship_status = profile.relationship_status || row.relationship_status || "new";
    row.visit_plan = row.visit_plan || "unset";
    row.relevance = row.relevance || "unset";
    return row;
  }

  function relationRank(row) {
    var order = {
      new: 0,
      existing_contact: 1,
      later: 2,
      existing_partner: 3,
      existing_customer: 4,
      not_needed: 5
    };
    var code = (row.profile && row.profile.relationship_status) || row.relationship_status || "new";
    return order[code] == null ? 0 : order[code];
  }

  function interesting(row) {
    return row.profile.profile_updated_at && types[row.profile.customer_type];
  }

  function openRow(row) {
    return row.visit_plan !== "visited" && row.visit_plan !== "skip";
  }

  function byRoute(a, b) {
    return missingRank(a) - missingRank(b)
      || relationRank(a) - relationRank(b)
      || (b.match_score - a.match_score)
      || a.name.localeCompare(b.name, "da");
  }

  function plan() {
    var open = state.rows.filter(function (row) { return interesting(row) && openRow(row); });
    var hall = state.here && open.some(function (row) { return row.hall === state.here.hall; })
      ? state.here.hall
      : bestHall(open);
    var queue = open.filter(function (row) { return row.hall === hall; }).sort(byRoute);
    return {
      open: open,
      hall: hall,
      queue: queue,
      hour: queue.slice(0, 6),
      next: queue[0] || null
    };
  }

  function bestHall(open) {
    if (!open.length) return "";
    return open.slice().sort(byRoute)[0].hall || "";
  }

  function hallLabel(hall) {
    if (!hall) return "Uden hal";
    if (hall === "Galeria") return "Galeria";
    return String(hall).indexOf("Hal") === 0 ? hall : "Hal " + hall;
  }

  function hallOrder(hall) {
    if (hall === "Galeria") return 100;
    var number = parseInt(hall, 10);
    return isNaN(number) ? 200 : number;
  }

  function hasStand(row) {
    return !!(row.stand_number && String(row.stand_number).trim());
  }

  function standState(members) {
    var plans = members.map(function (row) { return row.visit_plan; });
    var open = plans.some(function (plan) {
      return plan === "unset" || plan === "must_visit" || plan === "return_later";
    });
    if (!open) return plans.some(function (plan) { return plan === "visited"; }) ? "visited" : "skip";
    if (plans.some(function (plan) { return plan === "must_visit" || plan === "return_later"; })) return "planned";
    return "open";
  }

  function hallNames() {
    var seen = {};
    state.rows.forEach(function (row) { if (row.hall) seen[row.hall] = true; });
    return Object.keys(seen).sort(function (a, b) {
      return hallOrder(a) - hallOrder(b) || a.localeCompare(b, "da");
    });
  }

  function hallStats(hall) {
    var groups = {};
    state.rows.forEach(function (row) {
      if (row.hall !== hall || !hasStand(row)) return;
      var key = String(row.stand_number).trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });
    var stats = { stands: 0, visited: 0, planned: 0, open: 0, skip: 0, coverage: 0 };
    Object.keys(groups).forEach(function (key) {
      stats.stands += 1;
      stats[standState(groups[key])] += 1;
    });
    stats.coverage = stats.stands ? Math.round(100 * stats.visited / stats.stands) : 0;
    return stats;
  }

  function coverageLine(stats) {
    var parts = [stats.visited + " besøgt", stats.planned + " planlagt", stats.open + " mangler"];
    if (stats.skip) parts.push(stats.skip + " sprunget over");
    return parts.join(" · ");
  }

  function companyOpen(row) {
    return row.visit_plan === "unset" || row.visit_plan === "must_visit" || row.visit_plan === "return_later";
  }

  var mapStop = {
    energy: 1, power: 1, water: 1, group: 1, gruppe: 1, systems: 1, system: 1,
    solutions: 1, solution: 1, service: 1, services: 1, gmbh: 1, holding: 1,
    international: 1, deutschland: 1, germany: 1, digital: 1, smart: 1, tech: 1,
    technologies: 1, ag: 1, se: 1, kg: 1, co: 1, ltd: 1, limited: 1, inc: 1,
    sa: 1, sau: 1, bv: 1, aps: 1, as: 1, ab: 1, oy: 1, plc: 1, ug: 1, ev: 1,
    und: 1, and: 1, the: 1, of: 1, fuer: 1, fur: 1, media: 1, verlag: 1
  };

  function mapKey(name) {
    var text = (name || "").normalize("NFKC").toLowerCase().replace(/&/g, " and ");
    text = text.replace(/[^a-z0-9+]+/g, " ");
    return text.split(" ").filter(function (part) {
      return part.length > 2 && !mapStop[part];
    }).join(" ");
  }

  function mapTone(row) {
    if (row.visit_plan === "visited") return "visited";
    var score = Number(row.match_score) || 0;
    if (row.visit_plan === "must_visit" || row.visit_plan === "return_later" || score >= 70) return "high";
    if (score >= 40) return "medium";
    return "low";
  }

  function hallWork(hall) {
    var open = state.rows.filter(function (row) { return row.hall === hall && companyOpen(row); });
    return {
      open: open.length,
      high: open.filter(function (row) { return mapTone(row) === "high"; }).length
    };
  }

  function mapHallOrder() {
    return ["1", "2", "3", "4", "5", "6", "7", "8", "Galeria"];
  }

  function mapData() {
    return window.DL_MAP || { halls: {}, pins: [] };
  }

  function focusPin(row) {
    if (!row) return null;
    var pins = mapData().pins || [];
    var stand = String(row.stand_number || "").trim();
    for (var i = 0; i < pins.length; i++) {
      var pin = pins[i];
      if (pin.hall !== row.hall) continue;
      if (pin.id && pin.id === row.id) return pin;
      if (stand && pin.stand === stand) return pin;
    }
    return null;
  }

  function pinRows(pin) {
    return state.rows.filter(function (row) {
      if (row.hall !== pin.hall) return false;
      if (pin.id) return row.id === pin.id;
      return String(row.stand_number || "").trim() === pin.stand;
    });
  }

  function pinTone(pin) {
    var rows = pinRows(pin);
    if (!rows.length) return "low";
    var rank = { high: 3, medium: 2, low: 1, visited: 0 };
    return rows.map(mapTone).sort(function (a, b) { return rank[b] - rank[a]; })[0];
  }

  function openMap(row, back) {
    state.mapBack = back || "home";
    if (row) {
      state.mapHall = row.hall || state.mapHall || "1";
      state.mapFocusId = row.id || "";
      state.mapView = "floor";
    } else {
      state.mapView = "list";
      if (!state.mapHall) state.mapHall = (state.here && state.here.hall) || "1";
    }
    state.page = "map";
    state.error = "";
    render();
  }

  function missingRank(row) {
    if (row.visit_plan === "return_later") return 0;
    if (row.visit_plan === "must_visit") return 1;
    return 2;
  }

  function missingIn(hall) {
    return state.rows.filter(function (row) {
      return row.hall === hall && companyOpen(row);
    }).sort(byRoute);
  }

  function standLabel(row) {
    return hallLabel(row.hall) + (row.stand_number ? " · Stand " + row.stand_number : "");
  }

  function why(row) {
    var reasons = asList(row.profile.match_reason).slice(0, 3);
    if (!reasons.length) reasons = asList(row.profile.conversation_topics).slice(0, 3);
    var kind = types[row.profile.customer_type];
    if (kind && reasons.indexOf(kind) === -1) reasons.push(kind);
    return reasons;
  }

  function profileLine(row) {
    var profile = row.profile || {};
    var industry = profile.industry || "";
    var bio = profile.biography || "";
    if (businessNames.indexOf(industry) >= 0) {
      var money = bio.match(/De tjener penge på [^.]+\./);
      return money ? industry + ". " + money[0] : industry + ".";
    }
    var sentence = bio.split(". ")[0];
    if (sentence) return sentence.length > 110 ? sentence.slice(0, 107) + "…" : sentence;
    return why(row).slice(0, 2).join(" · ");
  }

  function questions(row) {
    return asList(row.profile.qualification_questions).slice(0, 3);
  }

  function greeting() {
    var hour = new Date().getHours();
    if (hour < 11) return "Godmorgen";
    if (hour < 18) return "Goddag";
    return "Godaften";
  }

  function todayCount(result) {
    return state.rows.filter(function (row) { return row.relevance === result; }).length;
  }

  function render() {
    parkVoice();
    clear(root);
    var floor = state.page === "map" && state.mapView === "floor";
    var bare = state.page === "mission" || state.page === "capture" || state.page === "profile" || floor;
    root.className = "phone" + (bare ? " bare" : "") + (state.page === "capture" ? " capture" : "") + (floor ? " mapmode" : "");
    if (!state.session) return renderLogin();
    if (state.busy && !state.rows.length) {
      root.appendChild(el("p", { class: "hint" }, ["Henter dagen…"]));
      return;
    }
    if (state.page === "mission") renderMission();
    else if (state.page === "map") renderMap();
    else if (state.page === "hall") renderHall();
    else if (state.page === "capture") renderCapture();
    else if (state.page === "archive") renderArchive();
    else if (state.page === "research") renderResearch();
    else if (state.page === "after") renderAfter();
    else if (state.page === "ready") renderReady();
    else if (state.page === "profile") renderProfile();
    else renderHome();
    if (!floor && (state.page === "home" || state.page === "hall" || state.page === "archive" || state.page === "research" || state.page === "after" || state.page === "ready" || state.page === "map")) renderNav();
  }

  function renderLogin() {
    var email = el("input", { class: "field", type: "email", placeholder: "E-mail", autocomplete: "username" });
    var password = el("input", { class: "field", type: "password", placeholder: "Adgangskode", autocomplete: "current-password" });
    root.appendChild(el("p", { class: "eyebrow" }, ["DeviceLab"]));
    root.appendChild(el("h1", null, ["Goddag."]));
    root.appendChild(el("p", { class: "quiet" }, ["Log ind, så dagen kan begynde."]));
    root.appendChild(email);
    root.appendChild(password);
    if (state.error) root.appendChild(el("p", { class: "error" }, [state.error]));
    root.appendChild(el("button", { class: "action", type: "button", onclick: function () { signIn(email.value, password.value); } }, ["Log ind"]));
    password.addEventListener("keydown", function (event) {
      if (event.key === "Enter") signIn(email.value, password.value);
    });
  }

  async function signIn(email, password) {
    state.error = "";
    state.busy = true;
    render();
    try {
      var data = await call("/auth/v1/token?grant_type=password", {
        method: "POST",
        token: cfg.key,
        body: { email: email.trim(), password: password }
      });
      saveSession(storeToken(data));
      await boot();
    } catch (err) {
      state.busy = false;
      state.error = "Forkert e-mail eller adgangskode.";
      render();
    }
  }

  async function boot() {
    state.error = "";
    try {
      await openDb();
      state.outbox = await idbAll("outbox");
      var revived = false;
      state.outbox.forEach(function (item) {
        if (item.status !== "sending") return;
        item.status = "pending";
        revived = true;
      });
      if (revived) await Promise.all(state.outbox.map(function (item) { return remember(item); }));
      var cached = await idbGet("fair", userId());
      if (cached && cached.rows && cached.rows.length) {
        state.eventId = cached.eventId || "";
        state.rows = cached.rows.map(attach);
        state.contacts = cached.contacts || [];
        state.notes = cached.notes || [];
        state.followups = cached.followups || [];
        state.memoryLoaded = !!cached.memory;
        applyOverlay();
        state.busy = false;
        render();
      }
    } catch (err) {
      state.outbox = state.outbox || [];
    }
    if (!state.rows.length) {
      state.busy = true;
      render();
    }
    state.loadingDay = true;
    try {
      await ensureSession();
      if (!state.eventId) {
        var events = await call("/rest/v1/events?select=id,name&order=year.desc");
        state.eventId = events.length ? events[0].id : "";
      }
      await loadRows();
    } catch (err) {
      state.busy = false;
      if (!state.rows.length) {
        if (err.status === 401) saveSession(null);
        state.error = "Dagen kunne ikke hentes. Åbn appen én gang med net, før messen.";
        render();
      } else {
        state.memoryLoaded = true;
        if (err.status === 401) state.syncAuth = true;
        if (state.page === "capture" && state.captureFor) adoptSnapshot(state.captureFor);
        render();
      }
    }
    state.loadingDay = false;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    flush();
    if (!state.syncTimer) {
      state.syncTimer = setInterval(function () {
        if (mine().some(function (item) { return item.status === "pending"; })) flush();
      }, 30000);
    }
  }

  async function loadRows() {
    var company = "companies(match_score,match_reason,conversation_topics,qualification_questions,customer_type,industry,biography,profile_updated_at,relationship_status)";
    var base = "/rest/v1/exhibitors?select=id,company_id,name,hall,stand_number,relevance,visit_plan,next_step,summary,sales_opportunity,visited_at,";
    var filter = "&event_id=eq." + encodeURIComponent(state.eventId) + "&limit=1000";
    var rows;
    try {
      rows = await call(base + "fair_summary,suggestion,suggestion_reason,analyzed_at," + company + filter);
    } catch (err) {
      if (err.status !== 400) throw err;
      rows = await call(base + company + filter);
    }
    state.rows = rows.map(attach);
    applyOverlay();
    state.dayFresh = true;
    try {
      var pack = await Promise.all([
        call("/rest/v1/contacts?select=id,company_id,name,title,email,phone,linkedin,created_at&limit=1000"),
        call("/rest/v1/notes?select=id,company_id,body,created_at&limit=1000"),
        call("/rest/v1/followups?select=id,company_id,title,done,created_at&limit=1000")
      ]);
      state.contacts = pack[0] || [];
      state.notes = pack[1] || [];
      state.followups = pack[2] || [];
    } catch (err) {
      state.contacts = state.contacts || [];
      state.notes = state.notes || [];
      state.followups = state.followups || [];
    }
    state.memoryLoaded = true;
    if (state.page === "capture" && state.captureFor) {
      if (state.form && state.form.dirty) adoptSnapshot(state.captureFor);
      else fillForm(state.captureFor);
    }
    reopenMedia();
    state.busy = false;
    render();
    saveFair();
  }

  function readyReport() {
    var items = mine();
    var failed = items.filter(function (item) { return item.status === "error"; });
    var waiting = items.filter(function (item) { return item.status !== "error"; });
    var halls = hallNames();
    var queueClear = !items.length && !state.syncing;
    var synced = !!state.dayFresh && !state.syncing && !state.syncAuth && !failed.length && !waiting.length;
    var offline = state.rows.length > 0 && !!state.memoryLoaded;
    var hallsOk = halls.length > 0;
    return {
      synced: synced,
      offline: offline,
      hallsOk: hallsOk,
      queueClear: queueClear,
      ready: synced && offline && hallsOk && queueClear,
      halls: halls,
      failed: failed,
      waiting: waiting
    };
  }

  function readyRows(report) {
    var syncNote = "Forbindelsen er i orden.";
    if (!report.synced) {
      if (state.syncing) syncNote = "Synkroniserer.";
      else if (state.syncAuth) syncNote = "Log ind for at sende det, der venter.";
      else if (!state.dayFresh) syncNote = "Åbn appen med net, så dagen kan hentes.";
      else syncNote = "Synkroniseringen er ikke færdig.";
    }
    var waitNote = "Der ligger intet og venter.";
    if (!report.queueClear) {
      var view = syncView("");
      waitNote = view && view.text && view.text !== "Synkroniseret" ? view.text : "Der ligger noget og venter.";
    }
    return [
      { ok: report.synced, label: "App synkroniseret", note: syncNote },
      { ok: report.offline, label: "Offline data hentet", note: report.offline ? "Virksomhederne ligger på telefonen." : "Dagen ligger ikke på telefonen endnu." },
      { ok: report.hallsOk, label: "Haller tilgængelige", note: report.hallsOk ? report.halls.length + " haller er klar." : "Hallerne er ikke hentet endnu." },
      { ok: report.queueClear, label: "Ingen ventende synkronisering", note: waitNote },
      { ok: report.ready, label: "Klar til messen", note: report.ready ? "Du kan gå ind." : "De andre linjer skal være grønne." }
    ];
  }

  function checkRow(row) {
    return el("div", { class: "check" + (row.ok ? " on" : "") }, [
      el("span", { class: "mark", "aria-hidden": "true" }, [row.ok ? "✓" : ""]),
      el("span", null, [
        el("b", null, [row.label]),
        el("span", null, [row.note])
      ])
    ]);
  }

  function paintReady() {
    var list = document.getElementById("messe");
    if (!list) return;
    clear(list);
    var report = readyReport();
    if (!report.ready) state.messeDetail = false;
    readyRows(report).forEach(function (row) {
      list.appendChild(checkRow(row));
    });
  }

  function homeReadyLabel(report) {
    if (report.ready) return "✅ Klar til messen";
    var missing = [report.synced, report.offline, report.hallsOk, report.queueClear].filter(function (ok) {
      return !ok;
    }).length;
    return "⚠️ " + missing + " ting mangler";
  }

  function paintHomeReady() {
    var node = document.getElementById("home-ready");
    if (!node) return;
    var report = readyReport();
    node.textContent = homeReadyLabel(report);
    node.className = "readyline" + (report.ready ? "" : " warn");
  }

  function renderReady() {
    var report = readyReport();
    if (report.ready && !state.messeDetail) {
      root.appendChild(el("p", { class: "eyebrow" }, ["Om morgenen"]));
      root.appendChild(el("h1", null, ["Klar til messen"]));
      root.appendChild(el("p", { class: "quiet" }, ["Du kan gå ind."]));
      root.appendChild(el("button", {
        class: "link",
        type: "button",
        onclick: function () { state.messeDetail = true; render(); }
      }, ["Vis tjekket"]));
      return;
    }
    root.appendChild(el("p", { class: "eyebrow" }, ["Om morgenen"]));
    root.appendChild(el("h1", null, ["Messeklar"]));
    root.appendChild(el("div", { id: "messe" }));
    paintReady();
    if (report.ready) {
      root.appendChild(el("button", {
        class: "link",
        type: "button",
        onclick: function () { state.messeDetail = false; render(); }
      }, ["Skjul tjekket"]));
    }
  }

  async function refreshDay() {
    if (state.loadingDay || state.dayFresh) return;
    state.loadingDay = true;
    try {
      await ensureSession();
      if (!state.eventId) {
        var events = await call("/rest/v1/events?select=id,name&order=year.desc");
        state.eventId = events.length ? events[0].id : "";
      }
      if (!state.eventId) throw new Error("event");
      await loadRows();
    } catch (err) {
      if (!state.rows.length && state.page === "ready") {
        state.error = "Dagen kunne ikke hentes. Åbn appen én gang med net, før messen.";
        render();
      }
    }
    state.loadingDay = false;
  }

  function renderHome() {
    var day = plan();
    var next = day.next;
    root.appendChild(el("div", { class: "top" }, [
      el("p", { class: "eyebrow" }, [state.here ? "Du er ved " + state.here.name : "Du er ikke startet"])
    ]));
    var morning = readyReport();
    root.appendChild(el("h1", null, [greeting() + ", Michell."]));
    root.appendChild(el("button", {
      id: "home-ready",
      class: "readyline" + (morning.ready ? "" : " warn"),
      type: "button",
      onclick: function () { state.page = "ready"; state.messeDetail = false; render(); }
    }, [homeReadyLabel(morning)]));
    root.appendChild(syncLine(""));
    if (!next) {
      root.appendChild(el("p", { class: "quiet" }, ["Der er ikke flere åbne stande i de interessante haller."]));
    } else {
    root.appendChild(el("p", { class: "lead" }, [
      hallLabel(day.hall) + " giver mest lige nu. ",
      el("b", null, [String(day.queue.length) + " interessante står der."])
    ]));
    root.appendChild(el("article", { class: "card" }, [
      el("p", { class: "kicker" }, ["Dagens bedste mulighed"]),
      el("h2", { class: "who" }, [next.name]),
      el("p", { class: "meta" }, [standLabel(next)]),
      el("p", { class: "why" }, [why(next).join(" · ")]),
      questions(next)[0] ? el("p", { class: "ask" }, [questions(next)[0]]) : null
    ]));
    root.appendChild(el("div", { class: "hour" }, [
      el("p", { class: "kicker" }, ["De næste 60 minutter"]),
      el("p", { class: "quiet" }, ["Bliv i " + hallLabel(day.hall) + ". " + day.hour.length + " virksomheder ligger på ruten."])
    ].concat(day.hour.map(function (row) {
      return el("div", { class: "stop" }, [el("b", null, [row.name]), el("span", null, [String(row.match_score)])]);
    }))));
    root.appendChild(el("button", { class: "action", type: "button", onclick: startMission }, ["Start mission"]));
    }
    renderHalls();
    var hot = todayCount("hot");
    var marked = todayCount("interesting");
    var maybe = todayCount("maybe");
    if (hot || marked || maybe) {
      root.appendChild(el("p", { class: "quiet" }, [
        "I dag er " + hot + " hot leads, " + marked + " interessante og " + maybe + " måske."
      ]));
    }
    root.appendChild(el("p", { class: "quiet" }, [day.open.length + " åbne på hele messen."]));
    if (state.error) root.appendChild(el("p", { class: "error" }, [state.error]));
  }

  function renderHalls() {
    root.appendChild(el("div", { class: "halls" }, [
      el("p", { class: "kicker" }, ["Haller"]),
      el("p", { class: "quiet" }, [
        state.here ? "Du arbejder i " + hallLabel(state.here.hall) + "." : "Vælg en hal og arbejd den færdig."
      ])
    ]));
    hallNames().forEach(function (hall) {
      var stats = hallStats(hall);
      var current = state.here && state.here.hall === hall;
      root.appendChild(el("button", {
        class: "hall" + (current ? " on" : ""),
        type: "button",
        onclick: function () { openHall(hall); }
      }, [
        el("span", { class: "hallname" }, [
          el("b", null, [hallLabel(hall)]),
          el("span", null, [stats.stands + " stande · " + coverageLine(stats)])
        ]),
        el("strong", { class: "pct" }, [stats.coverage + " %"])
      ]));
    });
  }

  function openHall(hall) {
    state.hall = hall;
    state.page = "hall";
    state.error = "";
    render();
  }

  function topBar(label, onclick, place) {
    return el("div", { class: "top" }, [
      el("button", { class: "link", type: "button", onclick: onclick }, [label]),
      place ? el("p", { class: "eyebrow" }, [place]) : null
    ]);
  }

  function renderHall() {
    var hall = state.hall;
    var stats = hallStats(hall);
    var missing = missingIn(hall);
    var named = missing.filter(hasStand);
    var unnamed = missing.filter(function (row) { return !hasStand(row); });
    root.appendChild(topBar("Tilbage", function () { state.page = "home"; render(); }, stats.stands + " stande"));
    root.appendChild(el("h1", null, [hallLabel(hall)]));
    if (state.savedName) {
      root.appendChild(el("p", { class: "done" }, [state.savedName + " er gemt."]));
      state.savedName = "";
    }
    root.appendChild(el("p", { class: "lead" }, ["Dækning " + stats.coverage + " %"]));
    root.appendChild(el("p", { class: "quiet" }, [coverageLine(stats)]));
    root.appendChild(el("p", { class: "kicker section" }, ["Mangler i " + hallLabel(hall)]));
    if (!named.length) {
      root.appendChild(el("p", { class: "quiet" }, ["Ingen åbne stande i hallen."]));
    }
    named.forEach(function (row) { root.appendChild(missingRow(row)); });
    if (unnamed.length) {
      root.appendChild(el("p", { class: "kicker section" }, ["Uden stand"]));
      unnamed.forEach(function (row) { root.appendChild(missingRow(row)); });
    }
    if (state.error) root.appendChild(el("p", { class: "error" }, [state.error]));
  }

  function planLabel(row) {
    if (row.visit_plan === "return_later") return "Kom tilbage";
    if (row.visit_plan === "must_visit") return "Skal besøges";
    return "Ikke besøgt";
  }

  function missingRow(row) {
    var place = hasStand(row) ? row.stand_number : "Uden stand";
    var open = el("button", {
      class: "company hallco",
      type: "button",
      onclick: function () { openHallCompany(row); }
    }, [
      el("span", { class: "hallco-name" }, [
        el("b", null, [row.name]),
        el("span", null, [place + " · " + planLabel(row)])
      ]),
      el("span", { class: "hallco-score" }, [String(row.match_score || 0)])
    ]);
    var star = null;
    if (row.visit_plan !== "return_later") {
      var on = row.visit_plan === "must_visit";
      star = el("button", {
        class: "planbtn" + (on ? " on" : ""),
        type: "button",
        onclick: function () { setPlan(row, on ? "unset" : "must_visit"); }
      }, [on ? "Planlagt" : "Planlæg"]);
    }
    return el("div", { class: "gaprow" }, star ? [open, star] : [open]);
  }

  function openHallCompany(row) {
    var queue = missingIn(row.hall);
    var index = 0;
    queue.forEach(function (item, at) { if (item.id === row.id) index = at; });
    state.mission = queue;
    state.index = index;
    state.missionBack = "hall";
    state.hall = row.hall;
    state.page = "mission";
    state.savedName = "";
    state.error = "";
    render();
  }

  async function setPlan(row, planName) {
    state.error = "";
    var previous = row.visit_plan;
    try {
      await enqueueVisit(row.id, { visit_plan: planName, updated_at: new Date().toISOString() });
      row.visit_plan = planName;
      render();
      flush();
    } catch (err) {
      row.visit_plan = previous;
      state.error = keepMessage(err) || "Status kunne ikke gemmes.";
      render();
    }
  }

  function startMission() {
    var day = plan();
    state.mission = day.queue;
    state.index = 0;
    state.missionBack = "";
    state.page = "mission";
    state.error = "";
    render();
  }

  function current() {
    return state.mission[state.index] || null;
  }

  function renderMission() {
    var row = current();
    if (!row) {
      state.page = "home";
      renderHome();
      renderNav();
      return;
    }
    root.appendChild(topBar(state.missionBack === "hall" ? "Tilbage" : "Luk", closeMission, standLabel(row)));
    root.appendChild(el("h1", null, [row.name]));
    root.appendChild(syncLine(""));
    if (state.savedName) root.appendChild(el("p", { class: "done" }, [state.savedName + " er gemt."]));
    var glance = visitGlance(row);
    if (glance) root.appendChild(el("p", { class: "quiet" }, [glance]));
    var person = contactLine(row.id);
    if (person) root.appendChild(el("p", { class: "ask" }, [person]));
    var line = profileLine(row);
    if (line) root.appendChild(el("p", { class: "ai" }, [line]));
    var asks = questions(row);
    if (asks.length) root.appendChild(el("p", { class: "ask" }, [asks[0]]));
    root.appendChild(el("button", { class: "action", type: "button", onclick: function () { openCapture(row); } }, ["Registrer besøg"]));
    root.appendChild(el("div", { class: "pair" }, [
      el("button", { class: "choice", type: "button", onclick: function () { mark(row, "return_later"); } }, ["Senere"]),
      el("button", { class: "choice", type: "button", onclick: function () { mark(row, "skip"); } }, ["Spring over"])
    ]));
    if (row.hall) {
      var here = hallWork(row.hall);
      root.appendChild(el("button", { class: "choice", type: "button", onclick: function () { openMap(row, "mission"); } }, ["Vis på kort"]));
      root.appendChild(el("p", { class: "quiet" }, [
        here.high + " høj prioritet · " + (here.open === 1 ? "1 ubesøgt" : here.open + " ubesøgte") + " i " + hallLabel(row.hall)
      ]));
    }
    if (state.error) root.appendChild(el("p", { class: "error" }, [state.error]));
    renderStandMates(row);
    root.appendChild(el("p", { class: "kicker section" }, ["Haller"]));
    mapHallOrder().forEach(function (hall) {
      root.appendChild(hallCountButton(hall));
    });
  }

  function contactLine(companyId) {
    var contact = latestContact(companyId);
    if (!contact) return "";
    return [contact.name, contact.title, contact.email, contact.phone].filter(function (part) {
      return part && String(part).trim();
    }).join(" · ");
  }

  function visitGlance(row) {
    var parts = [];
    if (outcomes[row.relevance]) parts.push(outcomes[row.relevance]);
    if (row.next_step) parts.push(row.next_step);
    return parts.join(" · ");
  }

  function mateLabel(row) {
    if (row.visit_plan === "visited") return "Besøgt";
    if (row.visit_plan === "skip") return "Sprunget over";
    if (row.visit_plan === "return_later") return "Kom tilbage";
    if (row.visit_plan === "must_visit") return "Skal besøges";
    return "Ikke besøgt";
  }

  function standMates(row) {
    if (!hasStand(row)) return [];
    var stand = String(row.stand_number).trim();
    return state.rows.filter(function (other) {
      return other.id !== row.id && other.hall === row.hall && hasStand(other) && String(other.stand_number).trim() === stand;
    }).sort(function (a, b) { return a.name.localeCompare(b.name, "da"); });
  }

  function renderStandMates(row) {
    var mates = standMates(row);
    if (!mates.length) return;
    root.appendChild(el("p", { class: "kicker section" }, ["Andre virksomheder på denne stand"]));
    mates.forEach(function (mate) {
      root.appendChild(el("button", {
        class: "company",
        type: "button",
        onclick: function () { openStandMate(mate); }
      }, [
        el("b", null, [mate.name]),
        el("span", null, [mateLabel(mate)])
      ]));
    });
  }

  function openStandMate(row) {
    var queue = state.mission.slice();
    var found = -1;
    queue.forEach(function (item, at) { if (item.id === row.id) found = at; });
    if (found >= 0) state.index = found;
    else {
      queue.splice(state.index, 0, row);
      state.mission = queue;
    }
    state.savedName = "";
    state.error = "";
    state.page = "mission";
    render();
  }

  function openCapture(row) {
    state.captureFor = row;
    fillForm(row);
    state.page = "capture";
    state.error = "";
    state.saved = "";
    state.savedName = "";
    state.photoError = "";
    state.voiceError = "";
    render();
  }

  async function mark(row, planName) {
    state.error = "";
    var previous = row.visit_plan;
    try {
      await enqueueVisit(row.id, { visit_plan: planName, updated_at: new Date().toISOString() });
      row.visit_plan = planName;
      saveHere(row);
      advance();
      flush();
    } catch (err) {
      row.visit_plan = previous;
      state.error = keepMessage(err) || "Status kunne ikke gemmes.";
      render();
    }
  }

  function closeMission() {
    state.page = state.missionBack === "hall" ? "hall" : "home";
    render();
  }

  function advance() {
    state.index += 1;
    if (!current()) state.page = state.missionBack === "hall" ? "hall" : "home";
    else state.page = "mission";
    render();
  }

  function renderCapture() {
    var row = state.captureFor;
    var form = state.form;
    root.appendChild(topBar("Tilbage", function () { state.page = "mission"; render(); }, standLabel(row)));
    root.appendChild(el("h1", null, [row.name]));
    var waiting = syncLine(row.id);
    if (waiting) root.appendChild(waiting);
    root.appendChild(el("p", { class: "ai" }, [
      profileLine(row),
      el("button", {
        class: "link",
        type: "button",
        onclick: function () { openProfile(row.company_id || row.id, "capture"); }
      }, ["Se profilen"])
    ]));
    root.appendChild(el("p", { class: "kicker" }, ["Messebesøg"]));
    root.appendChild(chipGrid(outcomes, "result"));
    root.appendChild(el("p", { class: "kicker" }, ["Næste handling"]));
    root.appendChild(chipRow(actions, "action"));
    root.appendChild(el("p", { class: "kicker" }, ["Kontaktniveau"]));
    root.appendChild(chipRow(levels, "level"));
    root.appendChild(el("p", { class: "kicker" }, ["Mine noter"]));
    var notes = el("textarea", { class: "area", placeholder: "Skriv det, du hørte." });
    notes.value = form.notes;
    notes.addEventListener("input", function () {
      form.notes = notes.value;
      form.touched.notes = true;
      form.dirty = true;
    });
    root.appendChild(notes);
    root.appendChild(el("p", { class: "kicker" }, ["Kontaktperson"]));
    if (!form.contactOpen) {
      root.appendChild(el("button", {
        class: "choice",
        type: "button",
        onclick: function () { form.contactOpen = true; render(); }
      }, ["Tilføj kontakt"]));
    } else {
      root.appendChild(field("Navn", "name", "text"));
      root.appendChild(field("Titel", "title", "text"));
      root.appendChild(field("Email", "email", "email"));
      root.appendChild(field("Telefon", "phone", "tel"));
    }
    renderPhotos(row.id);
    renderVoices(row.id);
    if (state.error) root.appendChild(el("p", { class: "error" }, [state.error]));
    var ready = !!(form.ready || state.memoryLoaded);
    root.appendChild(el("div", { class: "dock" }, [
      el("button", {
        class: "action",
        type: "button",
        disabled: ready ? null : "",
        onclick: saveCapture
      }, [ready ? (state.saving ? "Gemmer…" : "Gem og gå videre") : "Henter…"])
    ]));
  }

  function chipGrid(options, key) {
    return el("div", { class: "grid2" }, Object.keys(options).map(function (id) {
      return el("button", {
        class: "choice" + (state.form[key] === id ? " on" : ""),
        type: "button",
        onclick: function () {
          state.form[key] = id;
          state.form.touched[key] = true;
          state.form.dirty = true;
          if (key === "result") state.error = "";
          render();
        }
      }, [options[id]]);
    }));
  }

  function chipRow(options, key) {
    return el("div", { class: "chips" }, Object.keys(options).map(function (id) {
      return el("button", {
        class: state.form[key] === id ? "on" : "",
        type: "button",
        onclick: function () {
          state.form[key] = state.form[key] === id && key === "level" ? "" : id;
          state.form.touched[key] = true;
          state.form.dirty = true;
          render();
        }
      }, [options[id]]);
    }));
  }

  function field(label, key, type) {
    var input = el("input", { class: "field", type: type, placeholder: label, value: state.form[key] });
    input.addEventListener("input", function () {
      state.form[key] = input.value;
      state.form.touched[key] = true;
      state.form.dirty = true;
    });
    return input;
  }

  function exhibitorRow(id) {
    return state.rows.filter(function (item) {
      return item.id === id || item.company_id === id;
    })[0] || null;
  }

  function storagePath(key) {
    return String(key || "").split("/").map(encodeURIComponent).join("/");
  }

  function renderPhotos(exhibitorId, place) {
    if (!exhibitorId) return;
    ensurePhotos(exhibitorId);
    var camera = el("input", { class: "file", type: "file", accept: "image/*", capture: "environment" });
    var library = el("input", { class: "file", type: "file", accept: "image/*" });
    camera.addEventListener("change", function () { takePhoto(exhibitorId, camera); });
    library.addEventListener("change", function () { takePhoto(exhibitorId, library); });
    root.appendChild(el("p", { class: place === "inside" ? "kicker sub" : "kicker section" }, ["Billeder"]));
    root.appendChild(camera);
    root.appendChild(library);
    root.appendChild(el("div", { class: "pair" }, [
      el("button", { class: "choice", type: "button", onclick: function () { camera.click(); } }, ["Tag billede"]),
      el("button", { class: "choice", type: "button", onclick: function () { library.click(); } }, ["Vælg fra telefon"])
    ]));
    if (state.photoBusy) root.appendChild(el("p", { class: "quiet" }, ["Gemmer billedet…"]));
    if (state.photoError) root.appendChild(el("p", { class: "error" }, [state.photoError]));
    var slot = state.photos[exhibitorId];
    if (!slot || slot.status === "loading") return;
    if (slot.status === "error") {
      root.appendChild(el("p", { class: "error" }, ["Billederne kunne ikke hentes."]));
      return;
    }
    if (!slot.items.length) {
      root.appendChild(el("p", { class: "quiet" }, ["Ingen billeder endnu."]));
      return;
    }
    root.appendChild(el("div", { class: "photos" }, slot.items.map(function (item) {
      var selected = slot.selected === item.id;
      var label = mediaLabel(item.id);
      return el("div", { class: "shot" }, [
        el("button", {
          class: "thumb" + (selected ? " on" : ""),
          type: "button",
          onclick: function () {
            slot.selected = selected ? "" : item.id;
            render();
          }
        }, [el("img", { src: slot.urls[item.id] || "", alt: "Billede" })]),
        label ? el("span", { class: label === "Fejl" ? "error media-state" : "quiet media-state" }, [label]) : null,
        item.document_kind ? el("span", { class: "quiet media-state" }, [kindLabel(item.document_kind)]) : null
      ]);
    })));
    if (slot.selected) {
      var chosen = slot.items.filter(function (item) { return item.id === slot.selected; })[0];
      if (chosen && chosen.ocr_text) root.appendChild(el("p", { class: "quiet" }, [chosen.ocr_text]));
      root.appendChild(el("button", {
        class: "choice slim",
        type: "button",
        onclick: function () { removePhoto(exhibitorId, slot.selected); }
      }, ["Slet"]));
    }
  }

  function kindLabel(kind) {
    if (kind === "visitkort") return "Visitkort";
    if (kind === "brochure") return "Brochure";
    if (kind === "produktark") return "Produktark";
    if (kind === "ulæseligt") return "Ulæseligt";
    if (kind === "andet") return "Andet";
    return "";
  }

  function reopenMedia() {
    var changed = false;
    ["photos", "voices"].forEach(function (bucket) {
      Object.keys(state[bucket]).forEach(function (id) {
        var slot = state[bucket][id];
        if (!slot || (slot.status !== "deferred" && slot.status !== "error")) return;
        delete state[bucket][id];
        changed = true;
      });
    });
    return changed;
  }

  function ensurePhotos(exhibitorId) {
    var slot = state.photos[exhibitorId];
    if (slot && slot.status) return;
    state.photos[exhibitorId] = { status: "loading", items: [], urls: {}, selected: "" };
    loadPhotos(exhibitorId);
  }

  async function loadPhotos(exhibitorId) {
    var selected = state.photos[exhibitorId] && state.photos[exhibitorId].selected;
    var server = null;
    try {
      try {
        server = await call("/rest/v1/images?select=id,storage_key,created_at,ocr_text,document_kind&company_id=eq." + encodeURIComponent(exhibitorId) + "&order=created_at.desc");
      } catch (err) {
        if (err.status !== 400) throw err;
        server = await call("/rest/v1/images?select=id,storage_key,created_at&company_id=eq." + encodeURIComponent(exhibitorId) + "&order=created_at.desc");
      }
    } catch (err) {
      server = null;
    }
    var local = await queuedMedia(exhibitorId, "photo");
    if (!server && !local.length) {
      state.photos[exhibitorId] = { status: "deferred", items: [], urls: {}, selected: "" };
      render();
      return;
    }
    var items = (server || []).slice();
    var urls = {};
    await Promise.all(items.map(async function (item) {
      try { urls[item.id] = await fetchPhotoUrl(item.storage_key); }
      catch (err) { urls[item.id] = ""; }
    }));
    local.forEach(function (entry) {
      if (items.some(function (item) { return item.id === entry.body.id; })) return;
      items.unshift(entry.body);
      urls[entry.body.id] = entry.url;
    });
    items.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    state.photos[exhibitorId] = { status: "ready", items: items, urls: urls, selected: selected || "" };
    render();
  }

  async function fetchPhotoUrl(storageKey) {
    var response = await fetch(cfg.url + "/storage/v1/object/authenticated/captures/" + storagePath(storageKey), {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error("photo");
    return URL.createObjectURL(await response.blob());
  }

  function authHeaders() {
    return {
      apikey: cfg.key,
      Authorization: "Bearer " + ((state.session && state.session.access_token) || cfg.key)
    };
  }

  async function loadBitmap(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
      catch (err) { return await createImageBitmap(file); }
    }
    var url = URL.createObjectURL(file);
    try {
      var image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function preparePhoto(file) {
    var bitmap = await loadBitmap(file);
    var width = bitmap.width || bitmap.naturalWidth;
    var height = bitmap.height || bitmap.naturalHeight;
    var longest = Math.max(width, height);
    var jpeg = /jpe?g/i.test(file.type || "") || /\.jpe?g$/i.test(file.name || "");
    if (jpeg && longest <= PHOTO_MAX_SIDE && file.size <= 3000000) {
      if (bitmap.close) bitmap.close();
      return file;
    }
    var scale = Math.min(1, PHOTO_MAX_SIDE / longest);
    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/jpeg", PHOTO_JPEG_QUALITY); });
    if (!blob) throw new Error("empty");
    return blob;
  }

  async function putPhoto(key, blob) {
    var response = await fetch(cfg.url + "/storage/v1/object/captures/" + storagePath(key), {
      method: "POST",
      headers: Object.assign(authHeaders(), { "Content-Type": "image/jpeg", "x-upsert": "true" }),
      body: blob
    });
    if (!response.ok) {
      var error = new Error("upload");
      error.status = response.status;
      throw error;
    }
  }

  async function deleteObject(key) {
    var response = await fetch(cfg.url + "/storage/v1/object/captures/" + storagePath(key), {
      method: "DELETE",
      headers: authHeaders()
    });
    if (!response.ok && response.status !== 404) {
      var error = new Error("delete");
      error.status = response.status;
      throw error;
    }
  }

  async function takePhoto(exhibitorId, input) {
    var file = input.files && input.files[0];
    input.value = "";
    if (!file || state.photoBusy) return;
    state.photoBusy = true;
    state.photoError = "";
    render();
    try {
      var blob = await preparePhoto(file);
      var id = crypto.randomUUID();
      var key = "images/" + exhibitorId + "/" + id + ".jpg";
      var when = new Date().toISOString();
      await enqueueFile(exhibitorId, "photo", {
        id: id,
        company_id: exhibitorId,
        storage_key: key,
        category: "other",
        created_at: when
      }, blob, "image/jpeg");
      var slot = state.photos[exhibitorId] || { status: "ready", items: [], urls: {}, selected: "" };
      slot.status = "ready";
      slot.items = [{ id: id, storage_key: key, created_at: when }].concat(slot.items || []);
      slot.urls[id] = URL.createObjectURL(blob);
      state.photos[exhibitorId] = slot;
      state.photoBusy = false;
      render();
      flush();
    } catch (err) {
      state.photoBusy = false;
      state.photoError = keepMessage(err) || "Billedet blev ikke gemt. Prøv igen.";
      render();
    }
  }

  async function removePhoto(exhibitorId, imageId) {
    var slot = state.photos[exhibitorId];
    if (!slot) return;
    var item = slot.items.filter(function (row) { return row.id === imageId; })[0];
    if (!item) return;
    var previous = slot.items.slice();
    var selected = slot.selected;
    state.photoError = "";
    if (slot.urls[imageId]) URL.revokeObjectURL(slot.urls[imageId]);
    delete slot.urls[imageId];
    slot.items = slot.items.filter(function (row) { return row.id !== imageId; });
    slot.selected = "";
    render();
    try {
      await dropOrQueue("photo_delete", exhibitorId, item, item.storage_key);
      flush();
    } catch (err) {
      slot.items = previous;
      slot.selected = selected;
      state.photoError = keepMessage(err) || "Billedet kunne ikke slettes.";
      render();
    }
  }

  function visibleVoiceCompany() {
    if (state.page === "capture" && state.captureFor) return state.captureFor.id;
    if (state.page === "profile" && state.profile) {
      var row = exhibitorRow(state.profile.id);
      return row ? row.id : "";
    }
    return "";
  }

  function parkVoice() {
    var visible = visibleVoiceCompany();
    if (state.playingId && state.playingFor !== visible) {
      player.pause();
      state.playingId = "";
    }
    if (!state.recording || state.recording.stopping) return;
    if (state.recording.exhibitorId === visible) return;
    finishRecording(true);
  }

  function clock(seconds) {
    var total = Math.max(0, Math.round(Number(seconds) || 0));
    var mins = Math.floor(total / 60);
    var secs = total % 60;
    return mins + ":" + (secs < 10 ? "0" : "") + secs;
  }

  function stopLabel(recording) {
    return "Stop · " + clock((Date.now() - recording.started) / 1000);
  }

  function renderVoices(exhibitorId, place) {
    if (!exhibitorId) return;
    ensureVoices(exhibitorId);
    var live = state.recording && state.recording.exhibitorId === exhibitorId;
    var button = el("button", {
      class: "choice record" + (live ? " on" : ""),
      type: "button",
      onclick: function () {
        if (state.voiceBusy || state.voiceArming) return;
        if (state.recording && state.recording.exhibitorId === exhibitorId) finishRecording(true);
        else if (!state.recording) startVoice(exhibitorId);
      }
    }, [live ? stopLabel(state.recording) : "Optag"]);
    if (live) state.recording.label = button;
    root.appendChild(el("p", { class: place === "inside" ? "kicker sub" : "kicker section" }, ["Stemmenoter"]));
    root.appendChild(button);
    if (state.voiceBusy) root.appendChild(el("p", { class: "quiet" }, ["Gemmer stemmenoten…"]));
    if (state.voiceError) root.appendChild(el("p", { class: "error" }, [state.voiceError]));
    var slot = state.voices[exhibitorId];
    if (!slot || slot.status === "loading") return;
    if (slot.status === "error") {
      root.appendChild(el("p", { class: "error" }, ["Stemmenoterne kunne ikke hentes."]));
      return;
    }
    if (!slot.items.length) {
      root.appendChild(el("p", { class: "quiet" }, ["Ingen stemmenoter endnu."]));
      return;
    }
    slot.items.forEach(function (item) {
      var selected = slot.selected === item.id;
      var playing = state.playingId === item.id;
      var label = mediaLabel(item.id);
      root.appendChild(el("div", { class: "voicenote" }, [
        el("button", {
          class: "choice" + (playing ? " on" : ""),
          type: "button",
          onclick: function () { togglePlay(exhibitorId, item); }
        }, [playing ? "Stop" : "Afspil"]),
        el("button", {
          class: "choice" + (selected ? " on" : ""),
          type: "button",
          onclick: function () {
            slot.selected = selected ? "" : item.id;
            render();
          }
        }, [clock(item.duration_sec)]),
        label ? el("span", { class: label === "Fejl" ? "error media-state" : "quiet media-state" }, [label]) : null,
        item.transcript ? el("p", { class: "quiet media-state" }, [item.transcript]) : null
      ]));
    });
    if (slot.selected) {
      root.appendChild(el("button", {
        class: "choice slim",
        type: "button",
        onclick: function () { removeVoice(exhibitorId, slot.selected); }
      }, ["Slet"]));
    }
  }

  function ensureVoices(exhibitorId) {
    var slot = state.voices[exhibitorId];
    if (slot && slot.status) return;
    state.voices[exhibitorId] = { status: "loading", items: [], urls: {}, selected: "" };
    loadVoices(exhibitorId);
  }

  async function loadVoices(exhibitorId) {
    var previous = state.voices[exhibitorId] || {};
    var server = null;
    try {
      try {
        server = await call("/rest/v1/voice_notes?select=id,audio_key,duration_sec,created_at,transcript&company_id=eq." + encodeURIComponent(exhibitorId) + "&order=created_at.desc");
      } catch (err) {
        if (err.status !== 400) throw err;
        server = await call("/rest/v1/voice_notes?select=id,audio_key,duration_sec,created_at&company_id=eq." + encodeURIComponent(exhibitorId) + "&order=created_at.desc");
      }
    } catch (err) {
      server = null;
    }
    var local = await queuedMedia(exhibitorId, "voice");
    if (!server && !local.length) {
      state.voices[exhibitorId] = { status: "deferred", items: [], urls: {}, selected: "" };
      render();
      return;
    }
    var items = (server || []).slice();
    var urls = {};
    await Promise.all(items.map(async function (item) {
      try { urls[item.id] = await fetchVoiceUrl(item.audio_key); }
      catch (err) { urls[item.id] = previous.urls && previous.urls[item.id] || ""; }
    }));
    local.forEach(function (entry) {
      if (items.some(function (item) { return item.id === entry.body.id; })) {
        if (entry.url) urls[entry.body.id] = entry.url;
        return;
      }
      items.unshift(entry.body);
      urls[entry.body.id] = entry.url;
    });
    items.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    state.voices[exhibitorId] = { status: "ready", items: items, urls: urls, selected: previous.selected || "" };
    render();
  }

  async function fetchVoiceUrl(audioKey) {
    var response = await fetch(cfg.url + "/storage/v1/object/authenticated/captures/" + storagePath(audioKey), {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error("voice");
    return URL.createObjectURL(await response.blob());
  }

  function pickVoiceMime() {
    var types = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    for (var i = 0; i < types.length; i += 1) {
      if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return "";
  }

  function openRecorder(stream) {
    var mime = pickVoiceMime();
    var attempts = [];
    if (mime) {
      attempts.push({ mimeType: mime, audioBitsPerSecond: VOICE_BITRATE });
      attempts.push({ mimeType: mime });
    }
    attempts.push({ audioBitsPerSecond: VOICE_BITRATE });
    attempts.push(null);
    var last = null;
    for (var i = 0; i < attempts.length; i += 1) {
      try {
        return attempts[i] ? new MediaRecorder(stream, attempts[i]) : new MediaRecorder(stream);
      } catch (err) {
        last = err;
      }
    }
    throw last || new Error("recorder");
  }

  function voiceSuffix(mime) {
    var type = String(mime || "").toLowerCase();
    if (type.indexOf("webm") >= 0) return "webm";
    if (type.indexOf("ogg") >= 0) return "ogg";
    return "m4a";
  }

  async function micStream() {
    var voice = {
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
      echoCancellation: true,
      noiseSuppression: true
    };
    var tries = [
      { audio: Object.assign({}, voice, { channelCount: { exact: 1 } }) },
      { audio: voice },
      { audio: true }
    ];
    var last = null;
    for (var i = 0; i < tries.length; i += 1) {
      try { return await navigator.mediaDevices.getUserMedia(tries[i]); }
      catch (err) {
        last = err;
        if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) throw err;
      }
    }
    throw last || new Error("mic");
  }

  async function startVoice(exhibitorId) {
    if (state.recording || state.voiceBusy || state.voiceArming) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      state.voiceError = "Telefonen kan ikke optage lyd.";
      render();
      return;
    }
    state.voiceArming = true;
    state.voiceError = "";
    var stream = null;
    try {
      stream = await micStream();
      var recorder = openRecorder(stream);
      var chunks = [];
      recorder.addEventListener("dataavailable", function (event) {
        if (event.data && event.data.size) chunks.push(event.data);
      });
      var recording = {
        exhibitorId: exhibitorId,
        started: Date.now(),
        stream: stream,
        recorder: recorder,
        chunks: chunks,
        mime: recorder.mimeType || pickVoiceMime() || "audio/mp4",
        timer: 0,
        label: null,
        stopping: false,
        shown: ""
      };
      recorder.start();
      recording.timer = setInterval(function () {
        if (state.recording !== recording || recording.stopping) return;
        if (Date.now() - recording.started >= VOICE_MAX_MS) {
          finishRecording(true);
          return;
        }
        var text = stopLabel(recording);
        if (text !== recording.shown && recording.label && recording.label.isConnected) {
          recording.shown = text;
          recording.label.textContent = text;
        }
      }, 250);
      state.recording = recording;
      state.voiceArming = false;
      render();
    } catch (err) {
      if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
      state.voiceArming = false;
      state.voiceError = err && err.name === "NotAllowedError"
        ? "Telefonen skal have lov til mikrofonen."
        : "Telefonen kan ikke optage lyd.";
      render();
    }
  }

  function stopRecorder(recording) {
    return new Promise(function (resolve) {
      var recorder = recording.recorder;
      function pack() {
        resolve(new Blob(recording.chunks, { type: recorder.mimeType || recording.mime || "audio/mp4" }));
      }
      if (recorder.state === "inactive") {
        pack();
        return;
      }
      recorder.addEventListener("stop", pack, { once: true });
      try { recorder.stop(); }
      catch (err) { pack(); }
    });
  }

  async function finishRecording(save) {
    var recording = state.recording;
    if (!recording || recording.stopping) return;
    recording.stopping = true;
    clearInterval(recording.timer);
    var elapsed = Date.now() - recording.started;
    var blob = await stopRecorder(recording);
    recording.stream.getTracks().forEach(function (track) { track.stop(); });
    if (state.recording === recording) state.recording = null;
    if (!save || elapsed < VOICE_MIN_MS) {
      render();
      return;
    }
    if (!blob || !blob.size) {
      state.voiceError = "Stemmenoten blev ikke gemt. Prøv igen.";
      render();
      return;
    }
    await storeVoice(recording.exhibitorId, blob, elapsed / 1000);
  }

  async function putVoice(key, blob) {
    var type = blob.type || "audio/mp4";
    var response = await fetch(cfg.url + "/storage/v1/object/captures/" + storagePath(key), {
      method: "POST",
      headers: Object.assign(authHeaders(), { "Content-Type": type, "x-upsert": "true" }),
      body: blob
    });
    if (!response.ok) {
      var error = new Error("upload");
      error.status = response.status;
      throw error;
    }
  }

  async function storeVoice(exhibitorId, blob, seconds) {
    state.voiceBusy = true;
    state.voiceError = "";
    render();
    try {
      var id = crypto.randomUUID();
      var key = "voice/" + exhibitorId + "/" + id + "." + voiceSuffix(blob.type);
      var when = new Date().toISOString();
      var duration = Math.round(seconds * 10) / 10;
      await enqueueFile(exhibitorId, "voice", {
        id: id,
        company_id: exhibitorId,
        audio_key: key,
        transcript: "",
        duration_sec: duration,
        created_at: when
      }, blob, blob.type || "audio/mp4");
      var slot = state.voices[exhibitorId] || { status: "ready", items: [], urls: {}, selected: "" };
      slot.status = "ready";
      slot.items = [{ id: id, audio_key: key, duration_sec: duration, created_at: when }].concat(slot.items || []);
      slot.urls[id] = URL.createObjectURL(blob);
      state.voices[exhibitorId] = slot;
      state.voiceBusy = false;
      render();
      flush();
    } catch (err) {
      state.voiceBusy = false;
      state.voiceError = keepMessage(err) || "Stemmenoten blev ikke gemt. Prøv igen.";
      render();
    }
  }

  function togglePlay(exhibitorId, item) {
    var slot = state.voices[exhibitorId];
    var url = slot && slot.urls[item.id];
    if (!url) return;
    if (state.playingId === item.id) {
      player.pause();
      state.playingId = "";
      render();
      return;
    }
    state.playingId = item.id;
    state.playingFor = exhibitorId;
    player.src = url;
    player.onended = function () {
      if (state.playingId !== item.id) return;
      state.playingId = "";
      render();
    };
    player.play().catch(function () {
      state.playingId = "";
      state.voiceError = "Stemmenoten kunne ikke afspilles.";
      render();
    });
    render();
  }

  async function removeVoice(exhibitorId, voiceId) {
    var slot = state.voices[exhibitorId];
    if (!slot) return;
    var item = slot.items.filter(function (row) { return row.id === voiceId; })[0];
    if (!item) return;
    var previous = slot.items.slice();
    var selected = slot.selected;
    state.voiceError = "";
    if (state.playingId === voiceId) {
      player.pause();
      state.playingId = "";
    }
    if (slot.urls[voiceId]) URL.revokeObjectURL(slot.urls[voiceId]);
    delete slot.urls[voiceId];
    slot.items = slot.items.filter(function (row) { return row.id !== voiceId; });
    slot.selected = "";
    render();
    try {
      await dropOrQueue("voice_delete", exhibitorId, item, item.audio_key);
      flush();
    } catch (err) {
      slot.items = previous;
      slot.selected = selected;
      state.voiceError = keepMessage(err) || "Stemmenoten kunne ikke slettes.";
      render();
    }
  }

  function dictate() {
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = new Rec();
    rec.lang = "da-DK";
    rec.onresult = function (event) {
      var said = event.results[0][0].transcript;
      state.form.notes = (state.form.notes ? state.form.notes + " " : "") + said;
      render();
    };
    rec.start();
  }

  function textOp(companyId, kind, body, when) {
    var op = {
      id: crypto.randomUUID(),
      userId: userId(),
      companyId: companyId,
      kind: kind,
      body: body,
      status: "pending",
      attempts: 0,
      error: "",
      createdAt: when,
      cancel: false,
      uploaded: false
    };
    if (body && body.id === "") body.id = op.id;
    return op;
  }

  async function saveCapture() {
    var row = state.captureFor;
    var form = state.form;
    var snapshot = form.snapshot || {};
    if (!form.ready && !state.memoryLoaded) return;
    if (!form.result && !snapshot.result) {
      state.error = "Vælg et udfald.";
      render();
      return;
    }
    if (state.saving) return;
    state.saving = true;
    state.error = "";
    render();
    var stamp = Date.now();
    function at(offset) { return new Date(stamp + offset).toISOString(); }
    var ops = [];
    var visit = {};
    if (form.result && form.result !== snapshot.result) visit.relevance = form.result;
    if ((form.action || "none") !== (snapshot.action || "none")) {
      visit.next_step = form.action && form.action !== "none" ? actions[form.action] : "";
    }
    if ((form.level || "") !== (snapshot.level || "")) visit.sales_opportunity = form.level || "";
    var note = (form.notes || "").trim();
    var previousNote = (snapshot.notes || "").trim();
    if (note && note !== previousNote) visit.summary = note;
    var nextPlan = form.action === "again" ? "return_later" : "visited";
    if ((form.result || snapshot.result) && row.visit_plan !== nextPlan && (Object.keys(visit).length || row.visit_plan === "unset" || row.visit_plan === "must_visit" || row.visit_plan === "skip")) {
      visit.visit_plan = nextPlan;
    }
    var pending = null;
    var previousBody = null;
    if (Object.keys(visit).length) {
      visit.updated_at = at(0);
      if (visit.visit_plan) visit.visited_at = at(0);
      pending = mine(row.id).filter(function (item) {
        return item.kind === "visit" && item.status !== "sending";
      })[0];
      previousBody = pending ? Object.assign({}, pending.body) : null;
      if (pending) {
        pending.body = Object.assign({}, pending.body, visit);
        pending.status = "pending";
        pending.error = "";
        pending.createdAt = at(0);
        ops.push(pending);
      } else {
        ops.push(textOp(row.id, "visit", visit, at(0)));
      }
    }
    if (note && note !== previousNote && !knownNotes(row.id).some(function (item) { return (item.body || "").trim() === note; })) {
      ops.push(textOp(row.id, "note", { id: "", company_id: row.id, body: note, created_at: at(1) }, at(1)));
    }
    var contact = latestContact(row.id);
    var patch = {};
    ["name", "title", "email", "phone"].forEach(function (key) {
      var value = (form[key] || "").trim();
      if (!value) return;
      var before = contact ? (contact[key] || "") : "";
      if (value !== before) patch[key] = value;
    });
    var queued = null;
    var queuedBody = null;
    if (contact && Object.keys(patch).length) {
      queued = mine(row.id).filter(function (item) {
        return item.kind === "contact" && item.id === contact.id && item.status !== "sending";
      })[0];
      if (queued) {
        queuedBody = Object.assign({}, queued.body);
        queued.body = Object.assign({}, queued.body, patch);
        queued.status = "pending";
        queued.error = "";
        queued.createdAt = at(2);
        ops.push(queued);
      } else {
        var update = textOp(row.id, "contact_update", patch, at(2));
        update.contactId = contact.id;
        ops.push(update);
      }
    } else if (!contact && (form.name || "").trim()) {
      ops.push(textOp(row.id, "contact", {
        id: "",
        company_id: row.id,
        name: (form.name || "").trim(),
        title: (form.title || "").trim(),
        email: (form.email || "").trim(),
        phone: (form.phone || "").trim(),
        source: "fair",
        created_at: at(2)
      }, at(2)));
    }
    var actionTitle = form.action && form.action !== "none" ? actions[form.action] : "";
    if (actionTitle && !hasOpenFollowup(row.id, actionTitle)) {
      ops.push(textOp(row.id, "followup", {
        id: "",
        company_id: row.id,
        title: actionTitle,
        source: "fair",
        created_at: at(3)
      }, at(3)));
    }
    if (!ops.length) {
      state.saving = false;
      state.savedName = shortCompany(row.name);
      saveHere(row);
      advance();
      return;
    }
    try {
      await rememberAll(ops);
      if (Object.keys(visit).length) Object.assign(row, visit);
      ops.forEach(function (op) {
        if (op.kind === "note") state.notes = [op.body].concat(state.notes || []);
        if (op.kind === "contact") state.contacts = [op.body].concat(state.contacts || []);
        if (op.kind === "followup") state.followups = [op.body].concat(state.followups || []);
        if (op.kind === "contact_update") {
          (state.contacts || []).forEach(function (item) {
            if (item.id === op.contactId) Object.assign(item, op.body);
          });
        }
      });
      saveHere(row);
      state.savedName = shortCompany(row.name);
      state.saving = false;
      advance();
      flush();
      saveFair();
    } catch (err) {
      if (pending && previousBody) pending.body = previousBody;
      if (queued && queuedBody) queued.body = queuedBody;
      state.saving = false;
      state.error = keepMessage(err) || "Samtalen kunne ikke gemmes. Prøv igen, før du går videre.";
      render();
    }
  }

  function renderArchive() {
    root.appendChild(el("p", { class: "eyebrow" }, ["Arkiv"]));
    root.appendChild(el("h1", null, ["Find en virksomhed."]));
    var search = el("input", { class: "field search", type: "search", placeholder: "Navn eller stand", value: state.query });
    search.addEventListener("input", function () { state.query = search.value; paintArchive(); });
    root.appendChild(search);
    root.appendChild(el("div", { id: "archive" }));
    paintArchive();
  }

  function paintArchive() {
    var list = document.getElementById("archive");
    if (!list) return;
    clear(list);
    var q = state.query.trim().toLowerCase();
    if (q.length < 2) {
      list.appendChild(el("p", { class: "hint" }, ["Skriv mindst to bogstaver."]));
      return;
    }
    state.rows.filter(function (row) {
      return (row.name || "").toLowerCase().indexOf(q) !== -1 || (row.stand_number || "").toLowerCase().indexOf(q) !== -1;
    }).slice(0, 20).forEach(function (row) {
      var kind = types[row.profile.customer_type] || "";
      list.appendChild(el("button", { class: "company", type: "button", onclick: function () { openFound(row); } }, [
        el("b", null, [row.name]),
        el("span", null, [[kind, "Score " + row.match_score, standLabel(row)].filter(Boolean).join(" · ")])
      ]));
    });
  }

  function openFound(row) {
    state.mission = [row];
    state.index = 0;
    state.page = "mission";
    render();
  }

  function reviewSet(rows) {
    var ready = rows.filter(function (row) { return row.profile_updated_at; });
    var byScore = ready.slice().sort(function (a, b) {
      return (b.match_score || 0) - (a.match_score || 0) || a.name.localeCompare(b.name, "da");
    });
    var picked = [];
    var seen = {};
    function takeFrom(list, max) {
      var added = 0;
      list.forEach(function (row) {
        if (added >= max || picked.length >= 30 || seen[row.id]) return;
        seen[row.id] = true;
        picked.push(row);
        added += 1;
      });
    }
    takeFrom(byScore, 8);
    takeFrom(byScore.filter(function (row) {
      return row.customer_type === "potential_customer" && row.match_score >= 15 && row.match_score < 40;
    }), 10);
    takeFrom(byScore.filter(function (row) {
      return row.customer_type === "potential_partner" || row.customer_type === "potential_integration_partner";
    }), 6);
    takeFrom(byScore.filter(function (row) {
      return !row.match_score && row.profile_confidence === "website";
    }), 6);
    return picked;
  }

  async function openResearch() {
    state.page = "research";
    state.profile = null;
    state.error = "";
    state.notice = "";
    state.busy = !state.research;
    render();
    try {
      state.research = await call("/rest/v1/companies?select=id,name,match_score,visit_value,customer_type,lead_hypothesis,industry,biography,profile_confidence,profile_updated_at,relationship_status&order=name.asc&limit=1000");
      state.jobs = await call("/rest/v1/profile_jobs?select=id,company_id,status,error,created_at&order=created_at.desc&limit=30");
    } catch (err) {
      state.error = "Research Status kunne ikke hentes.";
    }
    state.busy = false;
    render();
  }

  function jobCount(status) {
    return (state.jobs || []).filter(function (job) { return job.status === status; }).length;
  }

  function renderResearch() {
    var rows = state.research || [];
    var profiled = rows.filter(function (row) { return row.profile_updated_at; }).length;
    root.appendChild(el("p", { class: "eyebrow" }, ["Research Status"]));
    root.appendChild(el("h1", { class: "voice" }, ["30 profiler til vurdering."]));
    root.appendChild(el("p", { class: "lead" }, [
      profiled + " af " + rows.length + " er profileret. Her er et udsnit, så scoren, kundetypen og spørgsmålene kan vurderes. De øvrige venter."
    ]));
    var waiting = jobCount("pending") + jobCount("running");
    if (waiting) {
      root.appendChild(el("p", { class: "quiet" }, [waiting + " genkørsel" + (waiting === 1 ? "" : "er") + " ligger i kø på MacBooken."]));
    }
    if (jobCount("error")) {
      root.appendChild(el("p", { class: "error" }, [jobCount("error") + " genkørsel fik en fejl. Søg virksomheden frem og kør den igen."]));
    }
    root.appendChild(el("div", { class: "filters" }, [["all", "Alle"]].concat(Object.keys(relations).map(function (id) {
      return [id, relations[id]];
    })).map(function (item) {
      return el("button", {
        class: state.relation === item[0] ? "on" : "",
        type: "button",
        onclick: function () { state.relation = item[0]; render(); }
      }, [item[1]]);
    })));
    var search = el("input", { class: "field search", type: "search", placeholder: "Find en virksomhed", value: state.reviewQuery });
    search.addEventListener("input", function () { state.reviewQuery = search.value; paintReview(); });
    root.appendChild(search);
    if (state.notice) root.appendChild(el("p", { class: "quiet" }, [state.notice]));
    if (state.error) root.appendChild(el("p", { class: "error" }, [state.error]));
    if (state.busy) {
      root.appendChild(el("p", { class: "hint" }, ["Henter profiler…"]));
      return;
    }
    root.appendChild(el("div", { id: "review" }));
    paintReview();
  }

  function paintReview() {
    var list = document.getElementById("review");
    if (!list) return;
    clear(list);
    var q = state.reviewQuery.trim().toLowerCase();
    var pool = (state.research || []).filter(function (row) {
      var relation = row.relationship_status || "new";
      var relationOk = state.relation === "all" || relation === state.relation;
      var queryOk = q.length < 2 || (row.name || "").toLowerCase().indexOf(q) !== -1;
      return relationOk && queryOk;
    });
    var rows = state.relation === "all" && q.length < 2 ? reviewSet(pool) : pool.slice(0, 40);
    if (!rows.length) {
      list.appendChild(el("p", { class: "hint" }, [
        q ? "Ingen virksomhed med det navn." : "Ingen virksomheder med den relation."
      ]));
      return;
    }
    if (state.relation !== "all" || q.length >= 2) {
      list.appendChild(el("p", { class: "quiet" }, [
        pool.length === 1 ? "1 virksomhed." : pool.length + " virksomheder."
      ]));
    }
    rows.forEach(function (row) { list.appendChild(reviewCard(row, q.length >= 2)); });
  }

  function reviewCard(row, searching) {
    var kind = typeLabels[row.customer_type] || "Ikke afklaret";
    var role = businessRole(row);
    var line = role
      ? (row.biography || "Beskrivelsen mangler.")
      : (row.profile_updated_at ? (row.lead_hypothesis || "Hypotesen mangler.") : "Profilen er ikke kørt endnu.");
    return el("article", { class: "review" }, [
      el("button", { class: "review-open", type: "button", onclick: function () { openProfile(row.id); } }, [
        el("b", null, [row.name]),
        el("span", { class: "badges" }, [
          role ? el("span", { class: "pill outline" }, [role]) : null,
          el("span", { class: badgeClass(row.customer_type) }, [kind]),
          el("span", { class: "pill" }, [visitValues[row.visit_value] || "Besøgsværdi ikke sat"]),
          el("span", { class: "pill score" }, [String(row.match_score || 0)]),
          (row.relationship_status && row.relationship_status !== "new")
            ? el("span", { class: "pill outline" }, [relations[row.relationship_status] || ""])
            : null
        ]),
        el("span", { class: "hyp" }, [line])
      ]),
      searching ? el("button", { class: "choice slim", type: "button", onclick: function () { rerun(row); } }, ["Kør igen"]) : null
    ]);
  }

  function badgeClass(type) {
    if (type === "potential_customer") return "pill customer";
    if (type === "low_relevance") return "pill low";
    return "pill outline";
  }

  function shortCompany(name) {
    return String(name || "").replace(/\s+(GmbH(?:\s*&\s*Co\.?)?|AG|SE|KG|Corp\.?|Inc\.?|A\/S|ApS)\.?$/i, "").trim();
  }

  async function openProfile(companyId, back) {
    state.returnTo = back || "research";
    state.page = "profile";
    state.error = "";
    state.notice = "";
    state.busy = true;
    state.relationOpen = false;
    state.folds = {};
    state.contactDraft = null;
    state.noteDraft = "";
    state.noteSaving = false;
    state.noteError = "";
    state.profileToken = companyId;
    state.photoError = "";
    state.voiceError = "";
    state.profile = { id: companyId, name: "Henter…" };
    render();
    try {
      var rows = await call("/rest/v1/companies?select=id,name,country,website,biography,about,industry,match_score,match_reason,conversation_topics,qualification_questions,visit_value,customer_type,pain_points,lead_hypothesis,profile_confidence,profile_sources,profile_updated_at,relationship_status&id=eq." + encodeURIComponent(companyId));
      if (state.profileToken !== companyId) return;
      state.profile = rows[0] || null;
      if (!state.profile) state.error = "Profilen blev ikke fundet.";
    } catch (err) {
      var known = exhibitorRow(companyId);
      if (known) {
        state.profile = Object.assign({ id: known.company_id || companyId, name: known.name }, known.profile || {});
      } else {
        state.error = "Profilen kunne ikke hentes.";
      }
    }
    state.busy = false;
    render();
  }

  function renderProfile() {
    var profile = state.profile || {};
    var stand = standFor(profile.id);
    var exhibitor = exhibitorRow(profile.id);
    var role = businessRole(profile);
    root.appendChild(topBar("Tilbage", function () { state.page = state.returnTo || "research"; render(); }, stand || "Research"));
    root.appendChild(el("h1", { class: "voice" }, [profile.name || (exhibitor && exhibitor.name) || "Virksomhed"]));
    if (exhibitor) {
      var companySync = syncLine(exhibitor.id);
      if (companySync) root.appendChild(companySync);
    }
    root.appendChild(el("div", { class: "badges" }, [
      role ? el("span", { class: "pill outline" }, [role]) : null,
      el("span", { class: badgeClass(profile.customer_type) }, [typeLabels[profile.customer_type] || "Ikke afklaret"]),
      exhibitor ? el("span", { class: "pill outline" }, [mateLabel(exhibitor)]) : null,
      el("span", { class: "pill score" }, ["Score " + (profile.match_score || 0)])
    ]));
    if (exhibitor) root.appendChild(placeCard(exhibitor));
    renderRelation(profile);
    renderProfileContacts(exhibitor);
    renderLeadStatus(exhibitor);
    renderVisitPack(exhibitor);
    if (state.busy) {
      root.appendChild(el("p", { class: "hint" }, ["Henter profilen…"]));
    } else {
      renderProfileBackground(profile, role);
      if (exhibitor && exhibitor.suggestion_reason) {
        foldCard("reason", "Forslagets grund", [el("p", { class: "quiet" }, [exhibitor.suggestion_reason])]);
      }
    }
    if (state.notice) root.appendChild(el("p", { class: "quiet" }, [state.notice]));
    if (state.error) root.appendChild(el("p", { class: "error" }, [state.error]));
  }

  function renderLeadStatus(exhibitor) {
    var status = exhibitor && outcomes[exhibitor.relevance];
    var level = exhibitor && levels[exhibitor.sales_opportunity];
    var next = exhibitor && (exhibitor.next_step || "").trim();
    root.appendChild(el("p", { class: "kicker section" }, ["Lead"]));
    root.appendChild(el("p", { class: "status-line" }, [status || "Ingen status endnu"]));
    if (level) root.appendChild(el("p", { class: "quiet" }, [level]));
    root.appendChild(el("p", { class: "next-step" }, [
      "Næste handling",
      el("b", null, [next || "Ingen"])
    ]));
    if (exhibitor && suggestions[exhibitor.suggestion]) {
      root.appendChild(el("p", { class: "quiet" }, ["Forslag: " + suggestions[exhibitor.suggestion]]));
    }
  }

  function renderVisitPack(exhibitor) {
    root.appendChild(el("p", { class: "kicker section" }, ["Messebesøg"]));
    renderProfileNotes(exhibitor);
    if (!exhibitor) {
      root.appendChild(el("p", { class: "quiet" }, ["Stemmenoter og billeder hører til besøget."]));
      return;
    }
    renderVoices(exhibitor.id, "inside");
    renderPhotos(exhibitor.id, "inside");
    if (exhibitor.fair_summary) {
      root.appendChild(el("p", { class: "kicker sub" }, ["Samtalen"]));
      root.appendChild(el("p", { class: "ask" }, [exhibitor.fair_summary]));
    }
  }

  function profileNotes(exhibitor) {
    if (!exhibitor) return [];
    var notes = knownNotes(exhibitor.id).filter(function (item) {
      return (item.body || "").trim();
    });
    var summary = (exhibitor.summary || "").trim();
    if (summary && !notes.some(function (item) { return (item.body || "").trim() === summary; })) {
      notes.push({ body: summary, created_at: exhibitor.updated_at || exhibitor.visited_at || "" });
    }
    return notes.sort(byNewest);
  }

  function noteWhen(value) {
    if (!value) return "";
    var date = new Date(value);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function renderProfileNotes(exhibitor) {
    root.appendChild(el("p", { class: "kicker sub" }, ["Noter"]));
    if (!exhibitor) {
      root.appendChild(el("p", { class: "quiet" }, ["Ingen noter endnu."]));
      return;
    }
    var box = el("textarea", { class: "area", placeholder: "Skriv note..." });
    box.value = state.noteDraft || "";
    box.addEventListener("input", function () {
      state.noteDraft = box.value;
      state.noteError = "";
    });
    root.appendChild(box);
    if (state.noteError) root.appendChild(el("p", { class: "error" }, [state.noteError]));
    root.appendChild(el("button", {
      class: "choice slim",
      type: "button",
      disabled: state.noteSaving ? "" : null,
      onclick: function () { saveProfileNote(exhibitor); }
    }, [state.noteSaving ? "Gemmer…" : "Gem note"]));
    var notes = profileNotes(exhibitor);
    if (!notes.length) {
      root.appendChild(el("p", { class: "quiet" }, ["Ingen noter endnu."]));
      return;
    }
    notes.forEach(function (item) {
      var when = noteWhen(item.created_at);
      root.appendChild(el("article", { class: "note-item" }, [
        el("p", { class: "ask" }, [item.body.trim()]),
        when ? el("p", { class: "quiet" }, [when]) : null
      ]));
    });
  }

  async function saveProfileNote(exhibitor) {
    if (!exhibitor || state.noteSaving) return;
    var text = (state.noteDraft || "").trim();
    if (!text) {
      state.noteError = "Skriv en note.";
      render();
      return;
    }
    var duplicate = knownNotes(exhibitor.id).some(function (item) {
      return (item.body || "").trim() === text;
    });
    var summarySame = (exhibitor.summary || "").trim() === text;
    if (duplicate && summarySame) {
      state.noteDraft = "";
      state.noteError = "";
      render();
      return;
    }
    state.noteSaving = true;
    state.noteError = "";
    render();
    var when = new Date().toISOString();
    try {
      if (!duplicate) {
        var op = textOp(exhibitor.id, "note", {
          id: "",
          company_id: exhibitor.id,
          body: text,
          created_at: when
        }, when);
        await rememberAll([op]);
        state.notes = [op.body].concat(state.notes || []);
      }
      if (!summarySame) {
        await enqueueVisit(exhibitor.id, { summary: text, updated_at: when });
        exhibitor.summary = text;
        if (state.captureFor && state.captureFor.id === exhibitor.id && state.form && !state.form.touched.notes) {
          state.form.notes = text;
          if (state.form.snapshot) state.form.snapshot.notes = text;
        }
      }
      state.noteDraft = "";
      state.noteSaving = false;
      flush();
      saveFair();
      render();
    } catch (err) {
      state.noteSaving = false;
      state.noteError = "Noten kunne ikke gemmes.";
      render();
    }
  }

  function renderProfileContacts(exhibitor) {
    root.appendChild(el("p", { class: "kicker section" }, ["Kontaktpersoner"]));
    var people = exhibitor ? knownContacts(exhibitor.id) : [];
    if (!people.length) root.appendChild(el("p", { class: "quiet" }, ["Ingen kontaktperson endnu."]));
    people.forEach(function (contact) { root.appendChild(contactCard(contact)); });
    if (!exhibitor) return;
    if (!state.contactDraft) {
      root.appendChild(el("button", {
        class: "choice slim",
        type: "button",
        onclick: function () {
          state.contactDraft = { name: "", title: "", email: "", phone: "", linkedin: "", saving: false, error: "" };
          render();
        }
      }, ["+ Tilføj kontaktperson"]));
      return;
    }
    root.appendChild(draftField("name", "Navn", "text"));
    root.appendChild(draftField("title", "Titel", "text"));
    root.appendChild(draftField("email", "Email", "email"));
    root.appendChild(draftField("phone", "Telefon", "tel"));
    root.appendChild(draftField("linkedin", "LinkedIn", "text"));
    if (state.contactDraft.error) root.appendChild(el("p", { class: "error" }, [state.contactDraft.error]));
    root.appendChild(el("div", { class: "pair" }, [
      el("button", {
        class: "choice",
        type: "button",
        disabled: state.contactDraft.saving ? "" : null,
        onclick: function () { saveProfileContact(exhibitor.id); }
      }, [state.contactDraft.saving ? "Gemmer…" : "Gem kontakt"]),
      el("button", {
        class: "choice",
        type: "button",
        onclick: function () { state.contactDraft = null; render(); }
      }, ["Annuller"])
    ]));
  }

  function contactCard(contact) {
    var lines = [];
    if ((contact.email || "").trim()) lines.push(el("a", { href: "mailto:" + contact.email.trim() }, [contact.email.trim()]));
    if ((contact.phone || "").trim()) lines.push(el("a", { href: "tel:" + contact.phone.replace(/\s/g, "") }, [contact.phone.trim()]));
    var linkedin = (contact.linkedin || "").trim();
    if (linkedin) {
      var href = linkedin.indexOf("http") === 0 ? linkedin : (linkedin.indexOf("linkedin.com") >= 0 ? "https://" + linkedin : "");
      lines.push(href ? el("a", { href: href, target: "_blank", rel: "noopener" }, ["LinkedIn"]) : el("span", null, [linkedin]));
    }
    if (!contact.name && !contact.title && !lines.length) return null;
    return el("article", { class: "card person" }, [
      contact.name ? el("p", { class: "person-name" }, [contact.name]) : null,
      contact.title ? el("p", { class: "meta" }, [contact.title]) : null
    ].concat(lines.map(function (line) { return el("p", { class: "quiet" }, [line]); })));
  }

  function draftField(key, placeholder, type) {
    var input = el("input", { class: "field", type: type, placeholder: placeholder, value: state.contactDraft[key] || "", autocomplete: "off" });
    input.addEventListener("input", function () { state.contactDraft[key] = input.value; });
    return input;
  }

  async function saveProfileContact(exhibitorId) {
    var draft = state.contactDraft;
    if (!draft || draft.saving) return;
    var name = (draft.name || "").trim();
    if (!name) {
      draft.error = "Skriv et navn.";
      render();
      return;
    }
    draft.saving = true;
    draft.error = "";
    render();
    var when = new Date().toISOString();
    var op = textOp(exhibitorId, "contact", {
      id: "",
      company_id: exhibitorId,
      name: name,
      title: (draft.title || "").trim(),
      email: (draft.email || "").trim(),
      phone: (draft.phone || "").trim(),
      linkedin: (draft.linkedin || "").trim(),
      source: "fair",
      created_at: when
    }, when);
    try {
      await rememberAll([op]);
      state.contacts = [op.body].concat(state.contacts || []);
      state.contactDraft = null;
      flush();
      saveFair();
      render();
    } catch (err) {
      if (state.contactDraft) {
        state.contactDraft.saving = false;
        state.contactDraft.error = "Kontakten kunne ikke gemmes.";
      }
      render();
    }
  }

  function renderProfileBackground(profile, role) {
    var business = [];
    if (profile.biography) business.push(el("p", { class: "ask serif" }, [profile.biography]));
    if (!role && profile.about) business.push(el("p", { class: "quiet" }, [profile.about]));
    if (visitValues[profile.visit_value]) business.push(el("p", { class: "quiet" }, [visitValues[profile.visit_value]]));
    if (profile.profile_confidence === "thin") business.push(el("p", { class: "quiet" }, ["Tyndt grundlag"]));
    var site = (profile.website || "").trim();
    if (site) {
      var href = site.indexOf("http") === 0 ? site : "https://" + site;
      business.push(el("p", { class: "quiet" }, [el("a", { href: href, target: "_blank", rel: "noopener" }, [site])]));
    }
    foldCard("business", "Forretning", business);
    foldCard("hypothesis", "Lead Hypothesis", [
      el("p", { class: "ask serif" }, [profile.lead_hypothesis || "Der er ikke skrevet en hypotese endnu."])
    ]);
    var asks = asList(profile.qualification_questions);
    if (asks.length) {
      foldCard("questions", "Kvalificerende spørgsmål", asks.map(function (item) {
        return el("p", { class: "ask" }, [item]);
      }));
    }
    var pains = asList(profile.pain_points);
    if (pains.length) foldCard("pains", "Smertepunkter", [chipLine(pains)]);
    var topics = asList(profile.conversation_topics);
    if (topics.length) foldCard("topics", "Samtaleemner", [chipLine(topics)]);
    var reasons = asList(profile.match_reason);
    if (reasons.length) foldCard("score", "Hvorfor scoren", [el("p", { class: "quiet" }, [reasons.join(" · ")])]);
  }

  function chipLine(items) {
    return el("div", { class: "badges" }, items.map(function (item) {
      return el("span", { class: "pill outline" }, [item]);
    }));
  }

  function foldCard(id, title, nodes) {
    if (!nodes || !nodes.length) return;
    var open = !!state.folds[id];
    root.appendChild(el("article", { class: "card fold" + (open ? " open" : "") }, [
      el("button", {
        class: "fold-toggle",
        type: "button",
        onclick: function () {
          state.folds[id] = !open;
          render();
        }
      }, [
        el("span", null, [title]),
        el("span", { class: "fold-chevron", "aria-hidden": "true" }, [">"])
      ]),
      open ? el("div", { class: "fold-body" }, nodes) : null
    ]));
  }

  function renderRelation(profile) {
    var current = relationCode(profile);
    if (!state.relationOpen) {
      root.appendChild(el("button", {
        class: "relation-line",
        type: "button",
        onclick: function () { state.relationOpen = true; render(); }
      }, ["Relation: " + (relations[current] || "Ny virksomhed")]));
      return;
    }
    root.appendChild(el("p", { class: "kicker section" }, ["Relation"]));
    root.appendChild(el("div", { class: "chips" }, Object.keys(relations).map(function (id) {
      return el("button", {
        class: current === id ? "on" : "",
        type: "button",
        onclick: function () {
          state.relationOpen = false;
          saveRelation(profile, id);
        }
      }, [relations[id]]);
    })));
  }

  function relationCode(profile) {
    if (profile && profile.relationship_status) return profile.relationship_status;
    var row = profile && exhibitorRow(profile.id);
    return (row && row.relationship_status) || "new";
  }

  function standFor(companyId) {
    var row = state.rows.find(function (item) {
      return item.id === companyId || item.company_id === companyId;
    });
    return row ? standLabel(row) : "";
  }

  async function saveRelation(profile, status) {
    if (!profile || !profile.id || relationCode(profile) === status) {
      state.relationOpen = false;
      render();
      return;
    }
    var previous = relationCode(profile);
    profile.relationship_status = status;
    applyRelation(profile.id, status);
    state.error = "";
    render();
    try {
      await call("/rest/v1/companies?id=eq." + encodeURIComponent(profile.id), {
        method: "PATCH",
        prefer: "return=minimal",
        body: { relationship_status: status }
      });
      (state.research || []).forEach(function (row) {
        if (row.id === profile.id) row.relationship_status = status;
      });
    } catch (err) {
      profile.relationship_status = previous;
      applyRelation(profile.id, previous);
      state.error = "Relationen kunne ikke gemmes.";
      render();
    }
  }

  function applyRelation(companyId, status) {
    state.rows.forEach(function (row) {
      if (row.company_id !== companyId && row.id !== companyId) return;
      row.relationship_status = status;
      if (row.profile) row.profile.relationship_status = status;
      if (row.companies) row.companies.relationship_status = status;
    });
  }

  async function rerun(row) {
    if (!row || !row.id) return;
    state.error = "";
    var queued = (state.jobs || []).some(function (job) {
      return job.company_id === row.id && (job.status === "pending" || job.status === "running");
    });
    if (queued) {
      state.notice = row.name + " står allerede i kø.";
      render();
      return;
    }
    try {
      var created = await call("/rest/v1/profile_jobs", {
        method: "POST",
        prefer: "return=representation",
        body: { company_id: row.id, status: "pending" }
      });
      var job = Array.isArray(created) ? created[0] : created;
      if (job) state.jobs = [job].concat(state.jobs || []);
      state.notice = row.name + " står i kø. MacBooken kører profilen igen.";
      render();
    } catch (err) {
      state.error = "Genkørslen kunne ikke startes.";
      render();
    }
  }

  function afterKey(row) {
    var outcome = { hot: 0, interesting: 1, maybe: 2, not_interesting: 3 }[row.relevance];
    if (outcome == null) outcome = 4;
    var action = row.next_step ? 0 : 1;
    var suggest = { warm: 0, follow: 1, cold: 2, thin: 3 }[row.suggestion];
    if (suggest == null) suggest = 4;
    return [outcome, action, suggest, -(row.match_score || 0), row.name || ""];
  }

  function compareAfter(a, b) {
    var left = afterKey(a);
    var right = afterKey(b);
    for (var i = 0; i < left.length; i += 1) {
      if (left[i] < right[i]) return -1;
      if (left[i] > right[i]) return 1;
    }
    return 0;
  }

  function openFollowup(companyId) {
    return allFollowups().filter(function (item) {
      return item.company_id === companyId && !item.done;
    }).sort(byNewest)[0] || null;
  }

  function latestRun() {
    return (state.runs || [])[0] || null;
  }

  function runActive(run) {
    return run && (run.status === "pending" || run.status === "running");
  }

  async function refreshAfter() {
    try {
      state.runs = await call("/rest/v1/fair_runs?select=id,status,step,note,error,created_at&order=created_at.desc&limit=1");
      state.followups = await call("/rest/v1/followups?select=id,company_id,title,done,created_at&limit=1000");
      state.afterError = "";
    } catch (err) {
      state.afterError = "Analysen er ikke klar endnu.";
    }
    if (state.page === "after") render();
  }

  async function openAfter() {
    state.page = "after";
    state.afterNotice = "";
    state.afterError = "";
    render();
    await refreshAfter();
    if (!state.afterTimer) {
      state.afterTimer = setInterval(function () {
        if (state.page === "after" && runActive(latestRun())) refreshAfter();
      }, 4000);
    }
  }

  async function startAnalysis() {
    if (mine().length) {
      state.afterNotice = "Der er noget, der ikke er sendt endnu. Synk først.";
      render();
      return;
    }
    if (runActive(latestRun()) || state.afterBusy) return;
    state.afterBusy = true;
    state.afterNotice = "";
    state.afterError = "";
    render();
    try {
      await call("/rest/v1/fair_runs", {
        method: "POST",
        prefer: "return=minimal",
        body: { event_id: state.eventId, status: "pending", step: "voice", note: "Analysen er i gang.", error: "" }
      });
      state.afterBusy = false;
      await refreshAfter();
    } catch (err) {
      state.afterBusy = false;
      state.afterError = "Analysen kunne ikke startes.";
      render();
    }
  }

  async function markFollowup(item) {
    var previous = item.done;
    item.done = true;
    state.afterError = "";
    render();
    try {
      await call("/rest/v1/followups?id=eq." + encodeURIComponent(item.id), {
        method: "PATCH",
        prefer: "return=minimal",
        body: { done: true }
      });
    } catch (err) {
      item.done = previous;
      state.afterError = "Opfølgningen blev ikke gemt.";
      render();
    }
  }

  function renderAfter() {
    var run = latestRun();
    root.appendChild(el("p", { class: "eyebrow" }, ["Efter messen"]));
    root.appendChild(el("h1", null, ["Opfølgning."]));
    if (runActive(run)) {
      root.appendChild(el("p", { class: "quiet" }, [run.note || "Analysen er i gang."]));
    } else if (run && run.status === "done") {
      root.appendChild(el("p", { class: "quiet" }, [run.note || "Analysen er kørt."]));
    } else if (run && run.status === "error") {
      root.appendChild(el("p", { class: "error" }, [run.error || "Analysen stoppede. Prøv igen."]));
    } else {
      root.appendChild(el("p", { class: "quiet" }, ["Analysen venter, til du starter den."]));
    }
    if (state.afterNotice) root.appendChild(el("p", { class: "error" }, [state.afterNotice]));
    if (state.afterError) root.appendChild(el("p", { class: "error" }, [state.afterError]));
    if (!runActive(run)) {
      root.appendChild(el("button", {
        class: "action",
        type: "button",
        onclick: startAnalysis
      }, [state.afterBusy ? "Starter…" : (run && run.status === "error" ? "Prøv igen" : "Start analysen")]));
    }
    var search = el("input", { class: "field search", type: "search", placeholder: "Navn eller stand", value: state.afterQuery });
    search.addEventListener("input", function () { state.afterQuery = search.value; paintAfter(); });
    root.appendChild(search);
    root.appendChild(el("div", { id: "after-list" }));
    paintAfter();
  }

  function afterBucket(row) {
    if (row.relevance === "hot") return "hot";
    var followup = openFollowup(row.id);
    var byTitle = {
      "Book demo": "demo",
      "Partnerdialog": "partner",
      "Send mail": "email",
      "Ring": "call",
      "Besøg igen": "again"
    };
    if (followup) return byTitle[followup.title] || ("other:" + followup.title);
    if (row.relevance === "interesting") return "interesting";
    if (row.relevance === "maybe") return "maybe";
    if (row.relevance === "not_interesting") return "cold";
    return "";
  }

  function paintAfter() {
    var list = document.getElementById("after-list");
    if (!list) return;
    clear(list);
    var q = (state.afterQuery || "").trim().toLowerCase();
    var searching = q.length >= 2;
    var rows = state.rows.filter(function (row) {
      if (!(outcomes[row.relevance] || openFollowup(row.id))) return false;
      if (!searching) return true;
      return (row.name || "").toLowerCase().indexOf(q) !== -1 || (row.stand_number || "").toLowerCase().indexOf(q) !== -1;
    });
    if (!rows.length) {
      list.appendChild(el("p", { class: "hint" }, [searching ? "Ingen virksomhed med det navn." : "Ingen opfølgninger endnu."]));
      return;
    }
    var order = [
      ["hot", "Hot Lead"],
      ["demo", "Book demo"],
      ["partner", "Partnerdialog"],
      ["email", "Send mail"],
      ["call", "Ring"],
      ["again", "Besøg igen"],
      ["interesting", "Interessant"],
      ["maybe", "Måske interessant"],
      ["cold", "Ikke interessant"]
    ];
    var buckets = {};
    rows.forEach(function (row) {
      var key = afterBucket(row);
      if (!key) return;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(row);
    });
    Object.keys(buckets).forEach(function (key) {
      if (order.some(function (item) { return item[0] === key; })) return;
      order.splice(6, 0, [key, key.slice(6) || key]);
    });
    order.forEach(function (item) {
      var group = buckets[item[0]];
      if (!group || !group.length) return;
      group.sort(function (a, b) { return a.name.localeCompare(b.name, "da"); });
      if (item[0] === "cold" && !state.afterColdOpen && !searching) {
        list.appendChild(el("button", {
          class: "choice slim",
          type: "button",
          onclick: function () { state.afterColdOpen = true; paintAfter(); }
        }, ["Ikke interessant · " + group.length]));
        return;
      }
      list.appendChild(el("p", { class: "kicker section" }, [item[1]]));
      group.forEach(function (row) { list.appendChild(afterRow(row, item[1])); });
    });
  }

  function afterRow(row, groupTitle) {
    var followup = openFollowup(row.id);
    var bits = [standLabel(row)];
    if (outcomes[row.relevance] && outcomes[row.relevance] !== groupTitle) bits.push(outcomes[row.relevance]);
    if (followup && followup.title !== groupTitle) bits.push(followup.title);
    if (suggestions[row.suggestion]) bits.push("Forslag: " + suggestions[row.suggestion]);
    return el("article", null, [
      el("button", {
        class: "company",
        type: "button",
        onclick: function () { openProfile(row.company_id || row.id, "after"); }
      }, [
        el("b", null, [row.name]),
        el("span", null, [bits.join(" · ")])
      ]),
      followup ? el("button", {
        class: "choice slim",
        type: "button",
        onclick: function () { markFollowup(followup); }
      }, ["Marker som gjort"]) : null
    ]);
  }

  function placeCard(row) {
    return el("div", { class: "place" }, [
      el("p", { class: "status-line" }, ["Hal: " + (row.hall === "Galeria" ? "Galeria" : (row.hall || "–"))]),
      el("p", { class: "quiet" }, [row.stand_number ? "Stand: " + row.stand_number : "Uden standnummer"]),
      row.hall ? el("button", {
        class: "action",
        type: "button",
        onclick: function () { openMap(row, "profile"); }
      }, ["Vis på kort"]) : null
    ]);
  }

  function hallCountButton(hall) {
    var work = hallWork(hall);
    return el("button", {
      class: "hall" + (state.page === "map" && state.mapHall === hall ? " on" : ""),
      type: "button",
      onclick: function () {
        state.mapHall = hall;
        state.mapFocusId = "";
        state.mapView = "floor";
        state.page = "map";
        render();
      }
    }, [
      el("span", { class: "hallname" }, [
        el("b", null, [hallLabel(hall)]),
        el("span", null, [work.high + " høj prioritet"]),
        el("span", null, [work.open === 1 ? "1 ubesøgt" : work.open + " ubesøgte"])
      ])
    ]);
  }

  var mapCam = { scale: 1, x: 0, y: 0, fit: 1, iw: 1, ih: 1, lastTap: 0 };

  function renderMap() {
    if (state.mapView !== "floor") {
      root.appendChild(el("h1", null, ["Messekort"]));
      root.appendChild(el("p", { class: "quiet" }, ["Vælg en hal. Kortet åbner i fuld skærm."]));
      root.appendChild(el("div", { class: "legend" }, [
        legendDot("high", "Høj prioritet"),
        legendDot("medium", "Mellem"),
        legendDot("low", "Lav prioritet"),
        legendDot("visited", "Besøgt")
      ]));
      mapHallOrder().forEach(function (name) { root.appendChild(hallCountButton(name)); });
      return;
    }
    var focus = state.rows.filter(function (row) { return row.id === state.mapFocusId; })[0] || null;
    var hall = (focus && focus.hall) || state.mapHall || "1";
    state.mapHall = hall;
    var target = focusPin(focus);
    var screen = el("div", { class: "map-screen" + (state.mapMode === "orient" ? " orient" : "") });
    var stage = el("div", { class: "map-stage" });
    var world = el("div", { class: mapWorldClass() });
    var file = (mapData().halls || {})[hall];
    var image = file ? el("img", { alt: hallLabel(hall), src: file, draggable: "false" }) : null;
    if (image) world.appendChild(image);
    (mapData().pins || []).filter(function (item) { return item.hall === hall; }).forEach(function (item) {
      var rows = pinRows(item);
      if (!rows.length) return;
      var marked = target && item.x === target.x && item.y === target.y && item.stand === target.stand && item.id === target.id;
      var labelName = rows.length > 1 ? rows.length + " virksomheder" : rows[0].name;
      world.appendChild(el("button", {
        class: "pin " + pinTone(item) + (marked ? " on" : ""),
        type: "button",
        style: "left:" + (item.x * 100) + "%;top:" + (item.y * 100) + "%",
        onclick: function (event) {
          event.stopPropagation();
          event.preventDefault();
          var chosen = focus && rows.some(function (row) { return row.id === focus.id; }) ? focus : rows[0];
          state.mapFocusId = chosen.id;
          state.mapHall = chosen.hall;
          state.mapView = "floor";
          render();
        }
      }, [
        el("i", { class: "pin-dot" }),
        el("span", { class: "pin-label" }, [
          el("b", null, [item.stand || rows[0].stand_number || hallLabel(rows[0].hall)]),
          el("small", null, [labelName])
        ])
      ]));
    });
    stage.appendChild(world);
    screen.appendChild(el("div", { class: "map-bar" }, [
      el("button", {
        class: "map-back",
        type: "button",
        onclick: function () {
          state.mapView = "list";
          state.mapFocusId = "";
          render();
        }
      }, ["Tilbage til haller"]),
      el("div", { class: "map-modes" }, [
        mapModeButton("orient", "Orientering"),
        mapModeButton("mission", "Mission")
      ])
    ]));
    screen.appendChild(stage);
    if (target) {
      screen.appendChild(standSheet(pinRows(target), focus));
    } else if (focus) {
      screen.appendChild(el("div", { class: "map-miss" }, [
        el("b", null, [focus.stand_number ? "Stand " + focus.stand_number : hallLabel(focus.hall)]),
        el("span", null, [focus.name]),
        el("span", null, ["Standen står ikke på kortet."])
      ]));
    }
    screen.appendChild(el("div", {
      class: "map-layers",
      hidden: state.mapMode === "mission" ? null : "hidden"
    }, [
      mapLayerButton("mapPriority", "Vis prioriteringer"),
      mapLayerButton("mapVisited", "Vis besøgte"),
      mapLayerButton("mapLabels", "Vis labels")
    ]));
    root.appendChild(screen);
    if (image) mountFloor(stage, world, image, target);
  }

  function standSheet(rows, focus) {
    var ordered = rows.slice().sort(function (a, b) {
      if (focus && a.id === focus.id) return -1;
      if (focus && b.id === focus.id) return 1;
      return a.name.localeCompare(b.name, "da");
    });
    var stand = ordered[0] && ordered[0].stand_number;
    return el("div", { class: "map-stand" }, [
      el("b", null, [stand ? "Stand " + stand : "Virksomheder"])
    ].concat(ordered.map(function (row) {
      return el("button", {
        type: "button",
        onclick: function () { openProfile(row.company_id || row.id, "map"); }
      }, [row.name]);
    })));
  }

  function mapWorldClass() {
    return "map-world"
      + (state.mapMode === "mission" ? " mode-mission" : "")
      + (state.mapPriority ? " show-priority" : "")
      + (state.mapVisited ? " show-visited" : "")
      + (state.mapLabels ? " show-labels" : "");
  }

  function mapModeButton(mode, label) {
    return el("button", {
      class: "map-mode" + (state.mapMode === mode ? " on" : ""),
      type: "button",
      "data-mode": mode,
      onclick: function () {
        if (state.mapMode === mode) return;
        state.mapMode = mode;
        saveMapPrefs();
        paintMapChrome();
      }
    }, [label]);
  }

  function mapLayerButton(key, label) {
    return el("button", {
      class: "map-layer" + (state[key] ? " on" : ""),
      type: "button",
      "data-layer": key,
      "aria-pressed": state[key] ? "true" : "false",
      onclick: function () {
        state[key] = !state[key];
        saveMapPrefs();
        paintMapChrome();
      }
    }, [label]);
  }

  function paintMapChrome() {
    var screen = document.querySelector(".map-screen");
    var world = document.querySelector(".map-world");
    var stage = document.querySelector(".map-stage");
    var layers = document.querySelector(".map-layers");
    if (screen) screen.classList.toggle("orient", state.mapMode !== "mission");
    if (layers) layers.hidden = state.mapMode !== "mission";
    if (world) {
      world.classList.toggle("mode-mission", state.mapMode === "mission");
      world.classList.toggle("show-priority", !!state.mapPriority);
      world.classList.toggle("show-visited", !!state.mapVisited);
      world.classList.toggle("show-labels", !!state.mapLabels);
    }
    document.querySelectorAll(".map-mode").forEach(function (button) {
      button.classList.toggle("on", button.getAttribute("data-mode") === state.mapMode);
    });
    document.querySelectorAll(".map-layer").forEach(function (button) {
      var on = !!state[button.getAttribute("data-layer")];
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (stage && world) {
      clampPan(stage);
      applyCam(world);
    }
  }

  function legendDot(tone, label) {
    return el("span", null, [
      el("i", { class: "dot " + tone }),
      label
    ]);
  }

  function applyCam(world) {
    var zoom = mapCam.scale / (mapCam.fit || 1);
    world.style.transform = "translate(" + mapCam.x + "px," + mapCam.y + "px) scale(" + mapCam.scale + ")";
    world.style.setProperty("--s", String(mapCam.scale));
    world.setAttribute("data-zoom", zoom >= 2.5 ? "name" : (zoom >= 1.5 ? "stand" : "dots"));
    world.classList.toggle("z-stand", zoom >= 1.5);
    world.classList.toggle("z-name", zoom >= 2.5);
  }

  function clampPan(stage) {
    var viewW = stage.clientWidth;
    var viewH = stage.clientHeight;
    var width = mapCam.iw * mapCam.scale;
    var height = mapCam.ih * mapCam.scale;
    var slack = 48;
    if (width <= viewW) mapCam.x = (viewW - width) / 2;
    else mapCam.x = Math.min(slack, Math.max(viewW - width - slack, mapCam.x));
    if (height <= viewH) mapCam.y = (viewH - height) / 2;
    else mapCam.y = Math.min(slack, Math.max(viewH - height - slack, mapCam.y));
  }

  function zoomBy(stage, world, clientX, clientY, factor) {
    var rect = stage.getBoundingClientRect();
    var px = clientX - rect.left;
    var py = clientY - rect.top;
    var next = Math.max(mapCam.fit, Math.min(mapCam.fit * 8, mapCam.scale * factor));
    var change = next / mapCam.scale;
    mapCam.x = px - (px - mapCam.x) * change;
    mapCam.y = py - (py - mapCam.y) * change;
    mapCam.scale = next;
    clampPan(stage);
    applyCam(world);
  }

  function frameCam(stage, world, frac) {
    mapCam.fit = Math.min(stage.clientWidth / mapCam.iw, stage.clientHeight / mapCam.ih) || 1;
    mapCam.scale = frac ? mapCam.fit * 2.2 : mapCam.fit;
    var width = mapCam.iw * mapCam.scale;
    var height = mapCam.ih * mapCam.scale;
    if (frac) {
      mapCam.x = stage.clientWidth / 2 - frac.x * width;
      mapCam.y = stage.clientHeight / 2 - frac.y * height;
    } else {
      mapCam.x = (stage.clientWidth - width) / 2;
      mapCam.y = (stage.clientHeight - height) / 2;
    }
    clampPan(stage);
    applyCam(world);
  }

  function mountFloor(stage, world, image, target) {
    function ready() {
      mapCam.iw = image.naturalWidth || image.width || 1;
      mapCam.ih = image.naturalHeight || image.height || 1;
      frameCam(stage, world, target);
      bindMapGestures(stage, world);
    }
    if (image.complete && image.naturalWidth) ready();
    else image.addEventListener("load", ready);
  }

  function bindMapGestures(stage, world) {
    var points = {};
    var pinch = 0;
    var moved = false;
    var downEl = null;
    function live() {
      return Object.keys(points).map(function (id) { return points[id]; });
    }
    function span(list) {
      var dx = list[0].x - list[1].x;
      var dy = list[0].y - list[1].y;
      return Math.sqrt(dx * dx + dy * dy) || 1;
    }
    stage.addEventListener("pointerdown", function (event) {
      if (event.target.closest && event.target.closest(".map-back")) return;
      downEl = event.target;
      points[event.pointerId] = { x: event.clientX, y: event.clientY };
      try { stage.setPointerCapture(event.pointerId); } catch (err) { /* synthetic events */ }
      moved = false;
      var list = live();
      pinch = list.length >= 2 ? span(list) : 0;
    });
    stage.addEventListener("pointermove", function (event) {
      if (!points[event.pointerId]) return;
      var prev = points[event.pointerId];
      points[event.pointerId] = { x: event.clientX, y: event.clientY };
      var list = live();
      if (list.length >= 2) {
        var next = span(list);
        var midX = (list[0].x + list[1].x) / 2;
        var midY = (list[0].y + list[1].y) / 2;
        if (pinch) zoomBy(stage, world, midX, midY, next / pinch);
        pinch = next;
        moved = true;
        return;
      }
      var dx = event.clientX - prev.x;
      var dy = event.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      mapCam.x += dx;
      mapCam.y += dy;
      clampPan(stage);
      applyCam(world);
    });
    stage.addEventListener("pointerup", function (event) {
      delete points[event.pointerId];
      if (live().length < 2) pinch = 0;
      if (moved || live().length) return;
      if (downEl && downEl.closest && downEl.closest(".pin")) return;
      var now = Date.now();
      if (now - mapCam.lastTap < 320 && mapCam.scale < mapCam.fit * 7.5) {
        zoomBy(stage, world, event.clientX, event.clientY, 2);
        mapCam.lastTap = 0;
      } else mapCam.lastTap = now;
    });
    stage.addEventListener("pointercancel", function (event) { delete points[event.pointerId]; });
    stage.addEventListener("wheel", function (event) {
      event.preventDefault();
      zoomBy(stage, world, event.clientX, event.clientY, event.deltaY < 0 ? 1.15 : 0.87);
    }, { passive: false });
    stage.addEventListener("touchmove", function (event) { event.preventDefault(); }, { passive: false });
    stage.addEventListener("gesturestart", function (event) { event.preventDefault(); });
  }

  function renderNav() {
    var bar = el("nav", { class: "nav" }, [
      navButton("home", "Home"),
      navButton("map", "Kort"),
      navButton("research", "Research"),
      navButton("archive", "Arkiv"),
      navButton("after", "Efter")
    ]);
    document.body.appendChild(bar);
  }

  function navButton(page, label) {
    return el("button", {
      class: state.page === page ? "on" : "",
      type: "button",
      onclick: function () {
        if (page === "research") openResearch();
        else if (page === "after") openAfter();
        else if (page === "map") {
          state.mapFocusId = "";
          state.mapView = "list";
          state.mapBack = "home";
          if (!state.mapHall) state.mapHall = (state.here && state.here.hall) || "1";
          state.page = "map";
          state.notice = "";
          render();
        }
        else { state.page = page; state.notice = ""; render(); }
      }
    }, [label]);
  }

  function bootNav() {
    var old = document.querySelector(".nav");
    if (old) old.remove();
  }

  var originalRender = render;
  render = function () {
    bootNav();
    originalRender();
  };

  window.addEventListener("pagehide", function () { finishRecording(true); });
  window.addEventListener("online", function () {
    flush();
    if (!state.dayFresh) refreshDay();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") finishRecording(true);
    else {
      flush();
      if (!state.dayFresh) refreshDay();
    }
  });

  var mapPrefs = loadMapPrefs();
  if (mapPrefs) {
    state.mapMode = mapPrefs.mode;
    state.mapPriority = mapPrefs.priority;
    state.mapVisited = mapPrefs.visited;
    state.mapLabels = mapPrefs.labels;
  }

  state.session = loadSession();
  if (state.session) boot();
  else render();
})();
