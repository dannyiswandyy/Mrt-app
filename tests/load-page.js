"use strict";

const vm = require("vm");

/* Runs the app page's timetable script (the plain script tagged mrt-main) far enough
   to define the train counts and headway functions. The page's buttons are not there,
   so later setup is ignored; the timetable functions themselves do not need them. */
function element() {
  const el = {
    style: { setProperty() {}, getPropertyValue() { return ""; }, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    dataset: {},
    hidden: false,
    children: [],
    innerHTML: "",
    textContent: "",
    value: "",
    className: "",
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return element(); },
    appendChild() {},
    removeChild() {},
    setAttribute() {},
    getAttribute() { return ""; },
    removeAttribute() {},
    getBoundingClientRect() { return { width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600 }; },
    focus() {},
    click() {},
  };
  return el;
}

function extractScript(html) {
  const plain = html.indexOf('<script type="text/plain" id="mrt-main">');
  if (plain >= 0) {
    const close = html.indexOf("</script>", plain);
    if (close < 0) throw new Error("page has no mrt-main script");
    return html.slice(html.indexOf(">", plain) + 1, close);
  }
  const re = /<script\b[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const close = html.indexOf("</script>", m.index);
    const body = html.slice(m.index + m[0].length, close);
    if (body.includes("function headway") && body.includes("NSL_TRAINS")) return body;
  }
  throw new Error("page has no timetable script");
}

function loadPage(html) {
  const src = extractScript(html);
  const document = {
    getElementById: element,
    querySelector: element,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: element,
    documentElement: element(),
    body: element(),
    hidden: false,
    title: "",
    fonts: { ready: new Promise(() => {}) },
  };
  const sandbox = {
    document,
    console,
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    requestAnimationFrame() { return 0; },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    Map, Set, WeakMap, Promise, Date, Math, JSON, Object, Array, Number, String,
    Boolean, RegExp, Error, Symbol, parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, URL, URLSearchParams, atob, btoa, Intl,
    fetch: async () => { throw new Error("network is not used by the timetable checks"); },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    navigator: {},
    location: { hash: "", protocol: "http:", hostname: "localhost", href: "http://localhost/" },
    history: { pushState() {}, back() {}, replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext(src, sandbox, { filename: "mrt-main.js" });
  } catch (e) {
    /* Setup after the timetable model touches buttons this check does not build. */
  }
  const api = vm.runInContext(`({
    LINES, headway, trainsOn, dayOf, dayBase, countsFor, PH_DAYS,
    NSL_TRAINS, EWL_TRAINS, CG_TRAINS, NEL_TRAINS, TEL_TRAINS, CCL_TRAINS
  })`, sandbox);
  if (!api.LINES || typeof api.headway !== "function" || typeof api.trainsOn !== "function") {
    throw new Error("the page script did not define the timetable functions");
  }
  return api;
}

function mainScript(html) {
  const open = html.indexOf('<script type="text/plain" id="mrt-main">');
  const close = html.indexOf("</script>", open);
  return html.slice(html.indexOf(">", open) + 1, close);
}

module.exports = { loadPage, mainScript };
