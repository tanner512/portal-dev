// Tracker theme: auto / light / dark.
//
// Auto follows the sun: dark from sunset to sunrise wherever the viewer is. The
// location is estimated from the browser's time zone, so there is no location
// prompt; within one zone the switch can be off by a few minutes from the
// viewer's exact sunset, which is the price of not asking.
//
// Load it in <head> without async/defer so <html data-theme> is set before the
// first paint (no flash of the wrong theme). Pages opt in by styling
// html[data-theme="dark"]; a page without dark styles is unaffected.
(function () {
  var KEY = 'tracker-theme';            // 'auto' | 'light' | 'dark', per browser
  var MODES = ['auto', 'light', 'dark'];

  // A representative city per zone. Where the team actually works, use the team's
  // city rather than the zone's namesake: America/Denver is Salt Lake City, whose
  // sunset is ~28 minutes later than Denver's.
  var ZONES = {
    'America/Denver': [40.76, -111.89], 'America/Boise': [43.62, -116.20],
    'America/Phoenix': [33.45, -112.07], 'America/Los_Angeles': [36.17, -115.14],
    'America/Chicago': [36.16, -86.78], 'America/New_York': [40.71, -74.01],
    'America/Kentucky/Louisville': [38.25, -85.76], 'America/Detroit': [42.33, -83.05],
    'America/Indiana/Indianapolis': [39.77, -86.16], 'America/Anchorage': [61.22, -149.90],
    'Pacific/Honolulu': [21.31, -157.86], 'America/Puerto_Rico': [18.47, -66.11],
    'Europe/London': [51.51, -0.13], 'Asia/Manila': [14.60, 120.98],
    'Asia/Kolkata': [28.61, 77.21]
  };

  function store(k, v) {
    try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); }
    catch (e) { return null; }      // private mode / blocked storage: just default to auto
  }

  function place() {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    if (ZONES[tz]) return ZONES[tz];
    // Unknown zone: longitude from the zone's STANDARD offset (DST would skew it
    // by 15°), latitude a mid-latitude guess.
    var y = new Date().getFullYear();
    var std = Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset());
    return [40, -std / 4];
  }

  // NOAA solar equations (gml.noaa.gov/grad/solcalc/solareqns.PDF): sunrise and
  // sunset for the viewer's local calendar day, as Dates. Accurate to ~1 minute
  // for a known point; null for polar day/night.
  function sunTimes(d) {
    var p = place(), lat = p[0], lon = p[1], rad = Math.PI / 180;
    var start = Date.UTC(d.getFullYear(), 0, 0);
    var doy = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 864e5);
    var g = 2 * Math.PI / 365 * (doy - 1);
    var eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
            - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
             - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
             - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var x = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl))
          - Math.tan(lat * rad) * Math.tan(decl);
    if (x > 1) return { polar: 'night' };
    if (x < -1) return { polar: 'day' };
    var ha = Math.acos(x) / rad;
    var day0 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return {
      rise: new Date(day0 + (720 - 4 * (lon + ha) - eqt) * 6e4),
      set:  new Date(day0 + (720 - 4 * (lon - ha) - eqt) * 6e4)
    };
  }

  function sunIsDown(now) {
    var s = sunTimes(now);
    if (s.polar) return s.polar === 'night';
    return now < s.rise || now >= s.set;
  }

  function mode() {
    var m = store(KEY);
    return MODES.indexOf(m) >= 0 ? m : 'auto';
  }

  function resolved() {
    var m = mode();
    return m === 'auto' ? (sunIsDown(new Date()) ? 'dark' : 'light') : m;
  }

  function apply() {
    var t = resolved(), el = document.documentElement;
    if (el.getAttribute('data-theme') !== t) el.setAttribute('data-theme', t);
    el.style.colorScheme = t;           // native controls and scrollbars follow too
    var b = document.getElementById('theme-btn');
    if (b) { b.textContent = { auto: '◐', light: '☀', dark: '☾' }[mode()]; b.title = describe(); }
  }

  function fmt(d) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

  // Tooltip text: what the button does now, and when auto will next switch.
  function describe() {
    var m = mode(), now = new Date();
    if (m !== 'auto') return 'Theme: ' + m + ' (fixed). Click to change — auto follows sunrise and sunset.';
    var s = sunTimes(now);
    if (s.polar) return 'Theme: auto — ' + (s.polar === 'night' ? 'dark' : 'light') + ' all day here. Click to change.';
    var next = now < s.rise ? 'light at ' + fmt(s.rise) + ' (sunrise)'
             : now < s.set  ? 'dark at ' + fmt(s.set) + ' (sunset)'
             : 'light at sunrise tomorrow';
    return 'Theme: auto — ' + (sunIsDown(now) ? 'dark' : 'light') + ' now, ' + next + '. Click to change.';
  }

  function cycle() {
    store(KEY, MODES[(MODES.indexOf(mode()) + 1) % MODES.length]);
    apply();
  }

  window.trackerTheme = { mode: mode, resolved: resolved, cycle: cycle, describe: describe, sunTimes: sunTimes };

  apply();
  // Catch sunrise/sunset while the page stays open, and after the laptop wakes.
  setInterval(apply, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) apply(); });
  document.addEventListener('DOMContentLoaded', apply);   // label the button once it exists
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(); });  // other tabs
})();
