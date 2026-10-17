(function () {
  var root = document.getElementById("app");
  var cfg = window.DEVICELAB || {};
  var state = {
    session: null,
    events: [],
    eventId: "",
    rows: [],
    query: "",
    company: null,
    error: "",
    busy: false
  };

  var relevance = {
    unset: "Ny",
    not_relevant: "Ikke relevant",
    maybe: "Måske",
    relevant: "Relevant",
    hot: "Hot"
  };

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
    try {
      return JSON.parse(localStorage.getItem("dl-session") || "null");
    } catch (err) {
      return null;
    }
  }

  function saveSession(session) {
    state.session = session;
    if (session) localStorage.setItem("dl-session", JSON.stringify(session));
    else localStorage.removeItem("dl-session");
  }

  async function call(path, options) {
    options = options || {};
    var token = options.token || (state.session && state.session.access_token) || cfg.key;
    var headers = {
      apikey: cfg.key,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    };
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
      var message = (data && (data.msg || data.error_description || data.message)) || "Noget gik galt";
      var error = new Error(message);
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

  function tone(value) {
    return "tone-" + (relevance[value] ? value : "unset");
  }

  function label(value) {
    return relevance[value] || relevance.unset;
  }

  function place(row) {
    var bits = [];
    if (row.hall) bits.push("Hal " + row.hall);
    if (row.stand_number) bits.push("Stand " + row.stand_number);
    if (row.country) bits.push(row.country);
    return bits.join(" · ");
  }

  function filtered() {
    var q = state.query.trim().toLowerCase();
    if (!q) return state.rows;
    return state.rows.filter(function (row) {
      return (row.name || "").toLowerCase().indexOf(q) !== -1
        || (row.country || "").toLowerCase().indexOf(q) !== -1
        || (row.stand_number || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  function render() {
    clear(root);
    if (!cfg.url || !cfg.key) {
      root.appendChild(el("p", { class: "error" }, ["Appen mangler forbindelsen til Supabase."]));
      return;
    }
    if (!state.session) renderLogin();
    else if (state.company) renderCompany();
    else renderList();
  }

  function renderLogin() {
    var email = el("input", { class: "field", type: "email", autocomplete: "username", placeholder: "E-mail" });
    var password = el("input", { class: "field", type: "password", autocomplete: "current-password", placeholder: "Adgangskode" });
    var button = el("button", { class: "btn primary wide", type: "button" }, [state.busy ? "Logger ind…" : "Log ind"]);
    button.disabled = state.busy;
    button.addEventListener("click", function () { signIn(email.value, password.value); });
    password.addEventListener("keydown", function (event) {
      if (event.key === "Enter") signIn(email.value, password.value);
    });
    root.appendChild(el("header", { id: "top" }, [
      el("h1", { class: "brand" }, ["DeviceLab"]),
      el("p", { class: "sub" }, ["Log ind for at se virksomhederne"])
    ]));
    root.appendChild(el("form", { class: "card stack", onsubmit: function (event) { event.preventDefault(); } }, [
      email,
      password,
      state.error ? el("p", { class: "error" }, [state.error]) : null,
      button
    ]));
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
      await openEvent();
    } catch (err) {
      state.error = "Forkert e-mail eller adgangskode.";
      state.busy = false;
      render();
    }
  }

  async function openEvent() {
    state.busy = true;
    state.error = "";
    render();
    try {
      await ensureSession();
      state.events = await call("/rest/v1/events?select=id,name,year&order=year.desc");
      if (!state.eventId && state.events.length) state.eventId = state.events[0].id;
      await loadRows();
    } catch (err) {
      if (err.status === 401) saveSession(null);
      state.error = "Listen kunne ikke hentes. Tjek forbindelsen og prøv igen.";
      state.busy = false;
      render();
    }
  }

  async function loadRows() {
    state.busy = true;
    render();
    var query = "/rest/v1/exhibitors?select=id,name,hall,stand_number,country,website,relevance,lead_score,next_step,company_id,event_id"
      + "&event_id=eq." + encodeURIComponent(state.eventId)
      + "&order=name.asc&limit=1000";
    state.rows = await call(query);
    state.busy = false;
    render();
  }

  function renderList() {
    var search = el("input", { class: "search", type: "search", placeholder: "Søg virksomhed, land eller stand", value: state.query });
    search.addEventListener("input", function () {
      state.query = search.value;
      paintCompanies();
    });
    root.appendChild(el("header", { id: "top" }, [
      el("div", { class: "row" }, [
        el("div", { class: "grow" }, [
          el("h1", { class: "brand" }, ["DeviceLab"]),
          el("p", { class: "sub" }, ["Virksomheder på messen"])
        ]),
        el("button", { class: "btn ghost", type: "button", onclick: signOut }, ["Log ud"])
      ])
    ]));
    if (state.events.length) {
      root.appendChild(el("div", { class: "wrap", style: "margin-bottom:12px" }, state.events.map(function (event) {
        return el("button", {
          class: "chip" + (event.id === state.eventId ? " on" : ""),
          type: "button",
          onclick: function () { chooseEvent(event.id); }
        }, [event.name || ("År " + event.year)]);
      })));
    }
    root.appendChild(search);
    root.appendChild(el("div", { class: "row", style: "margin:12px 0" }, [
      el("button", { class: "btn", type: "button", onclick: function () { exportFile("csv"); } }, ["CSV"]),
      el("button", { class: "btn", type: "button", onclick: function () { exportFile("xlsx"); } }, ["Excel"])
    ]));
    root.appendChild(el("p", { class: "hint", style: "margin-top:0" }, ["Eksporten indeholder virksomheder, kontakter og leads."]));
    if (state.error) root.appendChild(el("p", { class: "error" }, [state.error]));
    var list = el("div", { id: "list" });
    root.appendChild(list);
    paintCompanies();
  }

  function paintCompanies() {
    var list = document.getElementById("list");
    if (!list) return;
    clear(list);
    if (state.busy) {
      list.appendChild(el("p", { class: "hint" }, ["Henter virksomheder…"]));
      return;
    }
    var rows = filtered();
    if (!rows.length) {
      list.appendChild(el("p", { class: "hint" }, ["Ingen virksomheder matcher."]));
      return;
    }
    rows.forEach(function (row) {
      list.appendChild(el("button", { class: "company", type: "button", onclick: function () { state.company = row; render(); } }, [
        el("span", { class: "bar " + tone(row.relevance) }),
        el("span", { class: "company-body" }, [
          el("span", { class: "company-top" }, [
            el("span", { class: "name" }, [row.name || "Ukendt"]),
            el("span", { class: "pill " + tone(row.relevance) }, [label(row.relevance)])
          ]),
          el("span", { class: "place" }, [place(row) || "Stand er ikke udfyldt"])
        ])
      ]));
    });
  }

  async function chooseEvent(id) {
    state.eventId = id;
    state.company = null;
    state.error = "";
    try {
      await loadRows();
    } catch (err) {
      state.error = "Listen kunne ikke hentes.";
      state.busy = false;
      render();
    }
  }

  function renderCompany() {
    var row = state.company;
    var site = (row.website || "").trim();
    var href = site && site.indexOf("http") !== 0 ? "https://" + site : site;
    root.appendChild(el("header", { id: "top" }, [
      el("button", { class: "back", type: "button", onclick: function () { state.company = null; render(); } }, ["← Virksomheder"])
    ]));
    root.appendChild(el("article", { class: "card" }, [
      el("h1", { class: "name" }, [row.name || "Ukendt"]),
      el("div", { class: "gap" }),
      el("span", { class: "pill " + tone(row.relevance) }, [label(row.relevance)]),
      el("div", { class: "gap" }),
      fact("Hal", row.hall || "—"),
      fact("Stand", row.stand_number || "—"),
      fact("Land", row.country || "—"),
      el("p", { class: "fact" }, [
        el("b", null, ["Hjemmeside"]),
        href
          ? el("a", { href: href, target: "_blank", rel: "noopener" }, [site])
          : document.createTextNode("—")
      ]),
      el("p", { class: "hint" }, ["Noter, billeder og stemme er ikke med i denne version."])
    ]));
  }

  function fact(title, value) {
    return el("p", { class: "fact" }, [el("b", null, [title]), value]);
  }

  function signOut() {
    saveSession(null);
    state.rows = [];
    state.company = null;
    state.error = "";
    render();
  }

  async function exportFile(kind) {
    state.error = "";
    try {
      await ensureSession();
      var pack = await exportData();
      if (kind === "csv") downloadZip(pack);
      else downloadWorkbook(pack);
    } catch (err) {
      state.error = "Eksporten kunne ikke laves.";
      render();
    }
  }

  async function exportData() {
    var companies = await call("/rest/v1/companies?select=name,country,website&order=name.asc&limit=1000");
    var contacts = await call("/rest/v1/contacts?select=name,title,email,phone,linkedin,decision_maker,technical,sales,company_id&limit=1000");
    var leads = await call("/rest/v1/exhibitors?select=name,hall,stand_number,country,website,relevance,lead_score,next_step,event_id,events(name,year)&order=name.asc&limit=1000");
    var names = {};
    leads.forEach(function (row) { names[row.id] = row.name; });
    var exhibitorNames = await call("/rest/v1/exhibitors?select=id,name&limit=1000");
    exhibitorNames.forEach(function (row) { names[row.id] = row.name; });
    return {
      companies: [["Navn", "Land", "Hjemmeside"]].concat(companies.map(function (row) {
        return [row.name, row.country, row.website];
      })),
      contacts: [["Virksomhed", "Navn", "Titel", "E-mail", "Telefon", "LinkedIn", "Beslutningstager", "Teknisk", "Salg"]].concat(contacts.map(function (row) {
        return [names[row.company_id] || "", row.name, row.title, row.email, row.phone, row.linkedin, yesNo(row.decision_maker), yesNo(row.technical), yesNo(row.sales)];
      })),
      leads: [["Messe", "Virksomhed", "Hal", "Stand", "Land", "Hjemmeside", "Relevans", "Score", "Næste skridt"]].concat(leads.map(function (row) {
        var event = row.events || {};
        return [event.name || "", row.name, row.hall, row.stand_number, row.country, row.website, label(row.relevance), row.lead_score || 0, row.next_step || ""];
      }))
    };
  }

  function yesNo(value) {
    return value ? "Ja" : "Nej";
  }

  function downloadZip(pack) {
    var files = [
      file("virksomheder.csv", csv(pack.companies)),
      file("kontakter.csv", csv(pack.contacts)),
      file("leads.csv", csv(pack.leads))
    ];
    saveBlob("devicelab-csv.zip", zipStore(files), "application/zip");
  }

  function downloadWorkbook(pack) {
    var sheets = [
      ["Virksomheder", pack.companies],
      ["Kontakter", pack.contacts],
      ["Leads", pack.leads]
    ];
    var files = [
      file("[Content_Types].xml", contentTypes()),
      file("_rels/.rels", rootRels()),
      file("xl/workbook.xml", workbook(sheets)),
      file("xl/_rels/workbook.xml.rels", workbookRels(sheets.length)),
      file("xl/styles.xml", styles())
    ];
    sheets.forEach(function (sheet, index) {
      files.push(file("xl/worksheets/sheet" + (index + 1) + ".xml", worksheet(sheet[1])));
    });
    saveBlob("devicelab.xlsx", zipStore(files), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  function csv(rows) {
    var text = rows.map(function (row) {
      return row.map(function (value) {
        var cell = String(value == null ? "" : value).replace(/"/g, '""');
        return '"' + cell + '"';
      }).join(";");
    }).join("\r\n");
    return new TextEncoder().encode("\uFEFF" + text);
  }

  function file(name, data) {
    return { name: name, data: typeof data === "string" ? new TextEncoder().encode(data) : data };
  }

  function xml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function column(index) {
    var name = "";
    var n = index + 1;
    while (n) {
      var mod = (n - 1) % 26;
      name = String.fromCharCode(65 + mod) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function worksheet(rows) {
    var body = rows.map(function (row, r) {
      var cells = row.map(function (value, c) {
        var ref = column(c) + (r + 1);
        if (typeof value === "number") return '<c r="' + ref + '"><v>' + value + "</v></c>";
        return '<c r="' + ref + '" t="inlineStr"><is><t>' + xml(value) + "</t></is></c>";
      }).join("");
      return '<row r="' + (r + 1) + '">' + cells + "</row>";
    }).join("");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + body + "</sheetData></worksheet>";
  }

  function contentTypes() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + "</Types>";
  }

  function rootRels() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + "</Relationships>";
  }

  function workbook(sheets) {
    var items = sheets.map(function (sheet, index) {
      return '<sheet name="' + xml(sheet[0]) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>';
    }).join("");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + items + "</sheets></workbook>";
  }

  function workbookRels(count) {
    var items = "";
    for (var i = 1; i <= count; i += 1) {
      items += '<Relationship Id="rId' + i + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + i + '.xml"/>';
    }
    items += '<Relationship Id="rId' + (count + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + items + "</Relationships>";
  }

  function styles() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>';
  }

  function zipStore(files) {
    var parts = [];
    var central = [];
    var offset = 0;
    files.forEach(function (entry) {
      var name = new TextEncoder().encode(entry.name);
      var data = entry.data;
      var crc = crc32(data);
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(8, 0, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      var localBytes = concat([new Uint8Array(local.buffer), name, data]);
      parts.push(localBytes);
      var cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(concat([new Uint8Array(cen.buffer), name]));
      offset += localBytes.length;
    });
    var centralBytes = concat(central);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralBytes.length, true);
    end.setUint32(16, offset, true);
    return concat(parts.concat([centralBytes, new Uint8Array(end.buffer)]));
  }

  function concat(chunks) {
    var length = chunks.reduce(function (sum, chunk) { return sum + chunk.length; }, 0);
    var out = new Uint8Array(length);
    var cursor = 0;
    chunks.forEach(function (chunk) {
      out.set(chunk, cursor);
      cursor += chunk.length;
    });
    return out;
  }

  function crc32(data) {
    if (!crc32.table) {
      crc32.table = new Uint32Array(256);
      for (var n = 0; n < 256; n += 1) {
        var c = n;
        for (var k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc32.table[n] = c >>> 0;
      }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < data.length; i += 1) crc = crc32.table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function saveBlob(name, bytes, type) {
    var blob = new Blob([bytes], { type: type });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  state.session = loadSession();
  render();
  if (state.session) {
    openEvent().catch(function () {
      saveSession(null);
      render();
    });
  }
})();
