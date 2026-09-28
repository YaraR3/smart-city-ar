(function () {
  const X = window.__fakeXR;
  const L = (m) => X.log.push(m);
  window.addEventListener("error", (e) => L("ERROR " + e.message + " @" + (e.filename || "").split("/").pop() + ":" + e.lineno));
  window.addEventListener("unhandledrejection", (e) => L("REJECTION " + (e.reason && (e.reason.message || e.reason))));
  const $ = (id) => document.getElementById(id);
  const rawWait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Every 50 ms of page time, render 3 XR frames.
  async function wait(ms) { for (let i = 0; i < Math.max(1, Math.round(ms / 50)); i += 1) { X.pump(3); await rawWait(50); } }
  async function until(fn, label, timeout) {
    const t0 = performance.now();
    while (!fn()) { if (performance.now() - t0 > (timeout || 8000)) { L("TIMEOUT waiting: " + label); return false; } await wait(50); }
    return true;
  }
  const mid = (r) => [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
  function worldOf(el) { const v = new THREE.Vector3(); el.object3D.getWorldPosition(v); return v; }
  function finish() {
    const pre = document.createElement("pre"); pre.id = "testlog"; pre.textContent = X.log.join("\n"); document.body.appendChild(pre); document.title = "TESTDONE";
  }
  async function run() {
    const start = $("startAR");
    await until(() => ["prepare", "fallback"].includes(start.dataset.mode), "prepare");
    L("start: mode=" + start.dataset.mode + ' "' + start.textContent + '"');
    start.click();
    await until(() => ["ar", "fallback"].includes(start.dataset.mode), "scene ready", 15000);
    L("loaded: mode=" + start.dataset.mode + ' "' + start.textContent + '" status="' + $("status").textContent + '"');
    start.click();
    const scene = document.querySelector("a-scene");
    if (!await until(() => scene.is("ar-mode"), "ar-mode")) return finish();
    L("in AR: startCard hidden=" + $("startCard").hidden + " frames=" + X.frames);
    const placement = $("placement").components["surface-placement"];
    await until(() => placement.hitTestSource, "hit test source");
    await wait(300);
    L('scanning: status="' + $("status").textContent + '" hint="' + $("placementHint").textContent + '" frames=' + X.frames);
    X.hitVisible = true;
    await until(() => placement.surfaceVisible, "surface visible", 20000);
    await wait(100);
    L('surface: status="' + $("status").textContent + '" hint="' + $("placementHint").textContent + '" reticle=' + $("reticle").object3D.visible);
    const cx = Math.round(innerWidth / 2), cy = Math.round(innerHeight / 2);
    L("center of screen is " + X.describe(document.elementFromPoint(cx, cy)));
    X.tap(cx, cy);
    await wait(200);
    L("placed=" + placement.placed + " cityVisible=" + $("city").object3D.visible + ' status="' + $("status").textContent + '" controls="' + $("controls").className + '"');
    if (!placement.placed) { L("RESULT: FAIL - could not place the city"); return finish(); }
    L("Back link is under " + X.describe(document.elementFromPoint(...mid(document.querySelector(".back").getBoundingClientRect()))));
    L("Hint button is under " + X.describe(document.elementFromPoint(...mid($("hintButton").getBoundingClientRect()))));
    document.addEventListener("smart-system-select", (e) => L("  tap hit " + e.detail.id));
    for (const id of ["energy", "traffic", "waste", "green", "home", "transport"]) {
      const target = document.querySelector('.smart-target[data-system="' + id + '"]');
      const success = $("success");
      for (let attempt = 1; attempt <= 8 && success.hidden; attempt += 1) {
        const aim = worldOf(target);
        X.tap(cx, cy, aim);
        await wait(450);
        if (success.hidden) {
          const q = X.poseFor(aim).transform.orientation;
          const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
          const rc = new THREE.Raycaster(new THREE.Vector3(X.camera.x, X.camera.y, X.camera.z), dir);
          const hits = rc.intersectObjects(placement.targetObjects(), true).map((h) => SmartCity.targetFromObject(h.object).dataset.system + "@" + h.distance.toFixed(2));
          const box = new THREE.Box3().setFromObject(target.object3D);
          L("  miss: aim=" + aim.toArray().map((v) => v.toFixed(2)) + " dir=" + dir.toArray().map((v) => v.toFixed(2)) + " box=" + box.min.toArray().map((v) => v.toFixed(2)) + ".." + box.max.toArray().map((v) => v.toFixed(2)) + " hits=" + hits.join(" "));
        }
      }
      L("mission " + id + ": popup=" + !success.hidden + ' "' + $("successTitle").textContent + '" ' + $("missionCount").textContent);
      if (success.hidden) { L("RESULT: FAIL - mission " + id); return finish(); }
      const [tx, ty] = mid($("successMessage").getBoundingClientRect());
      L("  popup text is under " + X.describe(document.elementFromPoint(tx, ty)));
      X.tap(tx, ty, worldOf(target));
      await wait(500);
      L("  after tapping popup text: popup=" + !success.hidden + ' next="' + $("missionText").textContent + '"');
      if (!success.hidden && id === "transport") {
        // After the sixth find the card turns into the trophy screen; one more tap closes it.
        L('  trophy screen: "' + $("successTitle").textContent + '" button="' + $("nextMission").textContent + '"');
        X.tap(tx, ty, worldOf(target));
        await wait(500);
        L("  after tapping trophy screen: popup=" + !success.hidden);
      }
      if (!success.hidden) { L("RESULT: FAIL - popup stuck"); return finish(); }
    }
    L('all done: "' + $("missionText").textContent + '" ' + $("missionCount").textContent + " badges=" + Object.keys($("city").components["smart-city"].badges).join(","));
    // Simulate a dead XR render loop: ticks stop, so the watchdog should end the
    // session and the page should offer to restart the camera.
    // (The harness runs with a huge stall limit because the software renderer is slow,
    // so fake a frame timestamp far in the past to trigger the watchdog.)
    scene.renderer.xr.setAnimationLoop(null);
    placement.lastFrameTime = -1e12;
    await wait(2500);
    L("watchdog: still in AR=" + scene.is("ar-mode") + " startCard hidden=" + $("startCard").hidden + ' button="' + start.textContent + '" status="' + $("status").textContent + '"');
    if (scene.is("ar-mode") || $("startCard").hidden) { L("RESULT: FAIL - watchdog"); return finish(); }
    L("RESULT: PASS");
    finish();
  }
  window.addEventListener("load", () => run().catch((e) => { L("DRIVER ERROR " + (e && e.stack || e)); finish(); }));
})();
