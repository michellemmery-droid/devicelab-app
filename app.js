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
    saved: ""
  };

  var results = {
    not_relevant: "Ikke relevant",
    interesting: "Interessant",
    ready: "Klar til ledelsen",
    meeting: "Møde arrangeret"
  };
  var potentials = { low: "Lav", medium: "Mellem", high: "Høj" };
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

  function blankForm() {
    return { result: "", name: "", title: "", email: "", phone: "", potential: "", follow: "", date: "", notes: "" };
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
    var data = await call("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      token: cfg.key,
      body: { refresh_token: session.refresh_token }
    });
    saveSession(storeToken(data));
    return true;
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
    row.visit_plan = row.visit_plan || "unset";
    row.relevance = row.relevance || "unset";
    return row;
  }

  function interesting(row) {
    return row.profile.profile_updated_at && types[row.profile.customer_type];
  }

  function openRow(row) {
    return row.visit_plan !== "visited" && row.visit_plan !== "skip";
  }

  function byRoute(a, b) {
    var later = (a.visit_plan === "return_later") - (b.visit_plan === "return_later");
    return later || (b.match_score - a.match_score) || a.name.localeCompare(b.name, "da");
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
    var best = "";
    var score = -1;
    var counts = {};
    open.forEach(function (row) { counts[row.hall] = (counts[row.hall] || 0) + 1; });
    open.forEach(function (row) {
      var better = row.match_score > score;
      var tie = row.match_score === score && (counts[row.hall] || 0) > (counts[best] || 0);
      if (better || tie) {
        best = row.hall;
        score = row.match_score;
      }
    });
    return best;
  }

  function hallLabel(hall) {
    if (!hall) return "Uden hal";
    return String(hall).indexOf("Hal") === 0 ? hall : "Hal " + hall;
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
    clear(root);
    root.className = "phone" + (state.page === "mission" || state.page === "capture" || state.page === "profile" ? " bare" : "");
    if (!state.session) return renderLogin();
    if (state.busy && !state.rows.length) {
      root.appendChild(el("p", { class: "hint" }, ["Henter dagen…"]));
      return;
    }
    if (state.page === "mission") renderMission();
    else if (state.page === "capture") renderCapture();
    else if (state.page === "archive") renderArchive();
    else if (state.page === "research") renderResearch();
    else if (state.page === "profile") renderProfile();
    else renderHome();
    if (state.page === "home" || state.page === "archive" || state.page === "research") renderNav();
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
    state.busy = true;
    state.error = "";
    render();
    try {
      await ensureSession();
      var events = await call("/rest/v1/events?select=id,name&order=year.desc");
      state.eventId = events.length ? events[0].id : "";
      await loadRows();
    } catch (err) {
      if (err.status === 401) saveSession(null);
      state.error = "Dagen kunne ikke hentes.";
      state.busy = false;
      render();
    }
  }

  async function loadRows() {
    var query = "/rest/v1/exhibitors?select=id,company_id,name,hall,stand_number,relevance,visit_plan,next_step,summary,sales_opportunity,visited_at,"
      + "companies(match_score,match_reason,conversation_topics,qualification_questions,customer_type,profile_updated_at)"
      + "&event_id=eq." + encodeURIComponent(state.eventId)
      + "&limit=1000";
    state.rows = (await call(query)).map(attach);
    state.busy = false;
    render();
  }

  function renderHome() {
    var day = plan();
    var next = day.next;
    root.appendChild(el("div", { class: "top" }, [
      el("p", { class: "eyebrow" }, [state.here ? "Du er ved " + state.here.name : "Du er ikke startet"])
    ]));
    root.appendChild(el("h1", null, [greeting() + ", Michell."]));
    var achieved = todayCount("ready") + todayCount("meeting");
    if (achieved) {
      root.appendChild(el("p", { class: "quiet" }, [
        "I dag er " + todayCount("interesting") + " interessante, " + todayCount("ready") + " sendt videre og " + todayCount("meeting") + " møder sat."
      ]));
    }
    root.appendChild(el("p", { class: "lead" }, [
      day.open.length + " interessante mangler."
    ]));
    if (!next) {
      root.appendChild(el("p", { class: "quiet" }, ["Der er ikke flere åbne stande i de interessante haller."]));
      return;
    }
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
    if (state.error) root.appendChild(el("p", { class: "error" }, [state.error]));
  }

  function startMission() {
    var day = plan();
    state.mission = day.queue;
    state.index = 0;
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
    root.appendChild(el("div", { class: "top" }, [
      el("p", { class: "eyebrow" }, [(state.index + 1) + " af " + state.mission.length + " · " + hallLabel(row.hall)]),
      el("button", { class: "link", type: "button", onclick: function () { state.page = "home"; render(); } }, ["Luk"])
    ]));
    root.appendChild(el("h1", null, [row.name]));
    root.appendChild(el("p", { class: "meta" }, [standLabel(row) + " · Score " + row.match_score]));
    root.appendChild(el("section", { class: "card" }, [
      el("p", { class: "kicker" }, ["Hvorfor"]),
      el("p", { class: "why" }, [why(row).join(" · ") || "Profilen er tynd."])
    ]));
    var asks = questions(row);
    if (asks.length) {
      root.appendChild(el("section", { class: "card" }, [
        el("p", { class: "kicker" }, ["Spørg"])
      ].concat(asks.map(function (item) { return el("p", { class: "ask" }, [item]); }))));
    }
    root.appendChild(el("button", { class: "action", type: "button", onclick: function () { openCapture(row); } }, ["Besøgt"]));
    root.appendChild(el("div", { class: "pair" }, [
      el("button", { class: "choice", type: "button", onclick: function () { mark(row, "return_later"); } }, ["Senere"]),
      el("button", { class: "choice", type: "button", onclick: function () { mark(row, "skip"); } }, ["Spring over"])
    ]));
    if (state.error) root.appendChild(el("p", { class: "error" }, [state.error]));
  }

  function openCapture(row) {
    state.captureFor = row;
    state.form = blankForm();
    state.page = "capture";
    state.error = "";
    state.saved = "";
    render();
  }

  async function mark(row, planName) {
    state.error = "";
    try {
      await call("/rest/v1/exhibitors?id=eq." + encodeURIComponent(row.id), {
        method: "PATCH",
        prefer: "return=minimal",
        body: { visit_plan: planName, updated_at: new Date().toISOString() }
      });
      row.visit_plan = planName;
      saveHere(row);
      advance();
    } catch (err) {
      state.error = "Status kunne ikke gemmes.";
      render();
    }
  }

  function advance() {
    state.index += 1;
    if (!current()) state.page = "home";
    else state.page = "mission";
    render();
  }

  function renderCapture() {
    var row = state.captureFor;
    var form = state.form;
    root.appendChild(el("div", { class: "top" }, [
      el("button", { class: "link", type: "button", onclick: function () { state.page = "mission"; render(); } }, ["Tilbage"])
    ]));
    root.appendChild(el("p", { class: "eyebrow" }, [row.name]));
    root.appendChild(el("h1", null, ["Hvad kom der ud af det?"]));
    root.appendChild(el("div", { class: "grid2" }, Object.keys(results).map(function (id) {
      return el("button", {
        class: "choice" + (form.result === id ? " on" : ""),
        type: "button",
        onclick: function () { form.result = id; render(); }
      }, [results[id]]);
    })));
    root.appendChild(field("Kontaktperson", "name", "text"));
    root.appendChild(field("Titel", "title", "text"));
    root.appendChild(field("Telefon", "phone", "tel"));
    root.appendChild(field("E-mail", "email", "email"));
    root.appendChild(el("div", { class: "pair" }, Object.keys(potentials).map(function (id) {
      return el("button", {
        class: "choice" + (form.potential === id ? " on" : ""),
        type: "button",
        onclick: function () { form.potential = id; render(); }
      }, ["Potentiale " + potentials[id]]);
    })));
    root.appendChild(field("Aftalt opfølgning", "follow", "text"));
    root.appendChild(el("p", { class: "kicker", style: "margin-top:18px" }, ["Opfølgningsdato"]));
    root.appendChild(field("Dato", "date", "date"));
    var notes = el("textarea", { class: "area", placeholder: "Noter" });
    notes.value = form.notes;
    notes.addEventListener("input", function () { form.notes = notes.value; });
    root.appendChild(notes);
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      root.appendChild(el("button", { class: "choice", type: "button", onclick: dictate }, ["Tal noten"]));
    }
    if (state.error) root.appendChild(el("p", { class: "error" }, [state.error]));
    if (state.saved) root.appendChild(el("p", { class: "quiet" }, [state.saved]));
    root.appendChild(el("button", { class: "action", type: "button", onclick: saveCapture }, [state.busy ? "Gemmer…" : "Gem samtalen"]));
  }

  function field(label, key, type) {
    var input = el("input", { class: "field", type: type, placeholder: label, value: state.form[key] });
    input.addEventListener("input", function () { state.form[key] = input.value; });
    return input;
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

  async function saveCapture() {
    var row = state.captureFor;
    var form = state.form;
    if (!form.result) {
      state.error = "Vælg hvad samtalen blev til.";
      render();
      return;
    }
    state.busy = true;
    state.error = "";
    render();
    var when = new Date().toISOString();
    var follow = form.follow.trim();
    if (form.date) follow = (follow ? follow + " · " : "") + form.date;
    try {
      if (!form.exhibitorSaved) {
        await call("/rest/v1/exhibitors?id=eq." + encodeURIComponent(row.id), {
          method: "PATCH",
          prefer: "return=minimal",
          body: {
            visit_plan: "visited",
            relevance: form.result,
            next_step: follow,
            summary: form.notes.trim(),
            sales_opportunity: form.potential || "low",
            visited_at: when,
            updated_at: when
          }
        });
        form.exhibitorSaved = true;
      }
      if (form.name.trim() && !form.contactSaved) {
        await call("/rest/v1/contacts", {
          method: "POST",
          prefer: "return=minimal",
          body: {
            id: crypto.randomUUID(),
            company_id: row.id,
            name: form.name.trim(),
            title: form.title.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            source: "fair",
            created_at: when
          }
        });
        form.contactSaved = true;
      }
      if (form.notes.trim() && !form.noteSaved) {
        await call("/rest/v1/notes", {
          method: "POST",
          prefer: "return=minimal",
          body: { id: crypto.randomUUID(), company_id: row.id, body: form.notes.trim(), created_at: when }
        });
        form.noteSaved = true;
      }
      if (follow && !form.followSaved) {
        await call("/rest/v1/followups", {
          method: "POST",
          prefer: "return=minimal",
          body: { id: crypto.randomUUID(), company_id: row.id, title: follow, source: "fair", created_at: when }
        });
        form.followSaved = true;
      }
      row.visit_plan = "visited";
      row.relevance = form.result;
      row.next_step = follow;
      row.summary = form.notes.trim();
      saveHere(row);
      state.busy = false;
      advance();
    } catch (err) {
      state.busy = false;
      state.error = "Samtalen kunne ikke gemmes. Prøv igen, før du går videre.";
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
      state.research = await call("/rest/v1/companies?select=id,name,match_score,visit_value,customer_type,lead_hypothesis,profile_confidence,profile_updated_at,relationship_status&order=name.asc&limit=1000");
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
    return el("article", { class: "review" }, [
      el("button", { class: "review-open", type: "button", onclick: function () { openProfile(row.id); } }, [
        el("b", null, [row.name]),
        el("span", { class: "badges" }, [
          el("span", { class: badgeClass(row.customer_type) }, [kind]),
          el("span", { class: "pill" }, [visitValues[row.visit_value] || "Besøgsværdi ikke sat"]),
          el("span", { class: "pill score" }, [String(row.match_score || 0)]),
          (row.relationship_status && row.relationship_status !== "new")
            ? el("span", { class: "pill outline" }, [relations[row.relationship_status] || ""])
            : null
        ]),
        el("span", { class: "hyp" }, [row.profile_updated_at ? (row.lead_hypothesis || "Hypotesen mangler.") : "Profilen er ikke kørt endnu."])
      ]),
      searching ? el("button", { class: "choice slim", type: "button", onclick: function () { rerun(row); } }, ["Kør igen"]) : null
    ]);
  }

  function badgeClass(type) {
    if (type === "potential_customer") return "pill customer";
    if (type === "low_relevance") return "pill low";
    return "pill outline";
  }

  async function openProfile(companyId) {
    state.page = "profile";
    state.error = "";
    state.notice = "";
    state.busy = true;
    state.profileToken = companyId;
    state.profile = { id: companyId, name: "Henter…" };
    render();
    try {
      var rows = await call("/rest/v1/companies?select=id,name,country,website,biography,about,match_score,match_reason,conversation_topics,qualification_questions,visit_value,customer_type,pain_points,lead_hypothesis,profile_confidence,profile_sources,profile_updated_at,relationship_status&id=eq." + encodeURIComponent(companyId));
      if (state.profileToken !== companyId) return;
      state.profile = rows[0] || null;
      if (!state.profile) state.error = "Profilen blev ikke fundet.";
    } catch (err) {
      state.error = "Profilen kunne ikke hentes.";
    }
    state.busy = false;
    render();
  }

  function renderProfile() {
    var profile = state.profile || {};
    var stand = standFor(profile.id);
    root.appendChild(el("div", { class: "top" }, [
      el("p", { class: "eyebrow" }, [stand || "Research"]),
      el("button", { class: "link", type: "button", onclick: function () { state.page = "research"; render(); } }, ["Tilbage"])
    ]));
    root.appendChild(el("h1", { class: "voice" }, [profile.name || "Virksomhed"]));
    root.appendChild(el("div", { class: "badges" }, [
      el("span", { class: badgeClass(profile.customer_type) }, [typeLabels[profile.customer_type] || "Ikke afklaret"]),
      el("span", { class: "pill" }, [visitValues[profile.visit_value] || "Besøgsværdi ikke sat"]),
      el("span", { class: "pill score" }, ["Score " + (profile.match_score || 0)]),
      profile.profile_confidence === "thin" ? el("span", { class: "pill low" }, ["Tyndt grundlag"]) : null
    ]));
    if (state.busy) {
      root.appendChild(el("p", { class: "hint" }, ["Henter profilen…"]));
      return;
    }
    root.appendChild(el("section", { class: "card" }, [
      el("p", { class: "kicker" }, ["Relation"]),
      el("div", { class: "relate" }, Object.keys(relations).map(function (id) {
        return el("button", {
          class: "choice" + ((profile.relationship_status || "new") === id ? " on" : ""),
          type: "button",
          onclick: function () { saveRelation(profile, id); }
        }, [relations[id]]);
      }))
    ]));
    root.appendChild(el("article", { class: "card qcard" }, [
      el("p", { class: "kicker" }, ["Lead Hypothesis"]),
      el("p", { class: "ask serif" }, [profile.lead_hypothesis || "Der er ikke skrevet en hypotese endnu."])
    ]));
    var asks = asList(profile.qualification_questions);
    if (asks.length) {
      root.appendChild(el("article", { class: "card qcard" }, [
        el("p", { class: "kicker" }, ["Kvalificerende spørgsmål"])
      ].concat(asks.map(function (item) { return el("p", { class: "ask" }, [item]); }))));
    }
    chipBlock("Smertepunkter", profile.pain_points);
    chipBlock("Samtaleemner", profile.conversation_topics);
    var reasons = asList(profile.match_reason);
    if (reasons.length) {
      root.appendChild(el("section", { class: "hour" }, [
        el("p", { class: "kicker" }, ["Hvorfor scoren"]),
        el("p", { class: "quiet" }, [reasons.join(" · ")])
      ]));
    }
    if (profile.biography) root.appendChild(el("p", { class: "quiet" }, [profile.biography]));
    if (profile.about) root.appendChild(el("p", { class: "quiet" }, [profile.about]));
    var site = (profile.website || "").trim();
    if (site) {
      var href = site.indexOf("http") === 0 ? site : "https://" + site;
      root.appendChild(el("p", { class: "quiet" }, [el("a", { href: href, target: "_blank", rel: "noopener" }, [site])]));
    }
    if (state.notice) root.appendChild(el("p", { class: "quiet" }, [state.notice]));
    if (state.error) root.appendChild(el("p", { class: "error" }, [state.error]));
    root.appendChild(el("button", {
      class: "action",
      type: "button",
      onclick: function () { rerun(profile); }
    }, ["Kør profilen igen"]));
  }

  function chipBlock(title, value) {
    var items = asList(value);
    if (!items.length) return;
    root.appendChild(el("section", { class: "hour" }, [
      el("p", { class: "kicker" }, [title]),
      el("div", { class: "badges" }, items.map(function (item) {
        return el("span", { class: "pill outline" }, [item]);
      }))
    ]));
  }

  function standFor(companyId) {
    var row = state.rows.find(function (item) {
      return item.id === companyId || item.company_id === companyId;
    });
    return row ? standLabel(row) : "";
  }

  async function saveRelation(profile, status) {
    if (!profile || !profile.id || profile.relationship_status === status) return;
    var previous = profile.relationship_status || "new";
    profile.relationship_status = status;
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
      state.error = "Relationen kunne ikke gemmes.";
      render();
    }
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

  function renderNav() {
    var bar = el("nav", { class: "nav" }, [
      navButton("home", "Home"),
      navButton("research", "Research"),
      navButton("archive", "Arkiv")
    ]);
    document.body.appendChild(bar);
  }

  function navButton(page, label) {
    return el("button", {
      class: state.page === page ? "on" : "",
      type: "button",
      onclick: function () {
        if (page === "research") openResearch();
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

  state.session = loadSession();
  if (state.session) boot();
  else render();
})();
