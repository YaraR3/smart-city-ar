(function () {
  if (!window.AFRAME) return;

  AFRAME.registerComponent("surface-placement", {
    init: function () {
      this.city = document.getElementById("city");
      this.reticle = document.getElementById("reticle");
      this.placed = false;
      this.surfaceVisible = false;
      this.hitTestSource = null;
      this.referenceSpace = null;
      this.raycaster = new THREE.Raycaster();
      this.onSelect = this.onSelect.bind(this);

      this.el.sceneEl.addEventListener("enter-vr", async () => {
        const scene = this.el.sceneEl;
        if (!scene.is("ar-mode")) return;
        const session = scene.renderer.xr.getSession();
        if (!session) return;
        try {
          const viewerSpace = await session.requestReferenceSpace("viewer");
          this.referenceSpace = scene.renderer.xr.getReferenceSpace();
          this.hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
          session.addEventListener("select", this.onSelect);
          if (window.arUI) window.arUI.scanning();
        } catch (error) {
          if (window.arUI) window.arUI.error("Surface scanning is unavailable on this tablet.");
        }
      });

      // The session can end on its own (back button, notification shade, app switch,
      // screen lock). The old placement belongs to a dead reference space, so start over.
      this.el.sceneEl.addEventListener("exit-vr", () => {
        this.hitTestSource = null;
        this.placed = false;
        this.surfaceVisible = false;
        this.reticle.object3D.visible = false;
        this.city.object3D.visible = false;
      });
    },

    tick: function () {
      if (this.placed || !this.hitTestSource) return;
      const frame = this.el.sceneEl.frame;
      if (!frame) return;
      const referenceSpace = this.el.sceneEl.renderer.xr.getReferenceSpace();
      const hits = frame.getHitTestResults(this.hitTestSource);
      const pose = hits.length ? hits[0].getPose(referenceSpace) : null;
      if (!pose) {
        this.setSurfaceVisible(false);
        return;
      }
      const p = pose.transform.position;
      this.reticle.object3D.position.set(p.x, p.y, p.z);
      this.setSurfaceVisible(true);
    },

    // Only touch the DOM when the state changes. Updating the DOM overlay on every
    // XR frame forces the browser to redraw it 60 times a second and can freeze taps.
    setSurfaceVisible: function (visible) {
      if (this.surfaceVisible === visible) return;
      this.surfaceVisible = visible;
      this.reticle.object3D.visible = visible;
      if (window.arUI) {
        if (visible) window.arUI.surfaceFound();
        else window.arUI.scanning();
      }
    },

    targetObjects: function () {
      if (!this.targets) {
        this.targets = Array.from(this.city.querySelectorAll(".smart-target")).map((el) => el.object3D);
      }
      return this.targets;
    },

    onSelect: function (event) {
      if (!this.placed) {
        if (!this.surfaceVisible) return;
        this.city.object3D.position.copy(this.reticle.object3D.position);
        this.city.object3D.visible = true;
        this.reticle.object3D.visible = false;
        this.placed = true;
        if (window.arUI) window.arUI.placed();
        return;
      }

      const frame = event.frame;
      const input = event.inputSource;
      const referenceSpace = this.el.sceneEl.renderer.xr.getReferenceSpace();
      if (!frame || !input || !input.targetRaySpace || !referenceSpace) return;
      const pose = frame.getPose(input.targetRaySpace, referenceSpace);
      if (!pose) return;

      const origin = pose.transform.position;
      const orientation = pose.transform.orientation;
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
        new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w)
      );
      this.raycaster.set(new THREE.Vector3(origin.x, origin.y, origin.z), direction);
      const intersections = this.raycaster.intersectObjects(this.targetObjects(), true);
      for (const hit of intersections) {
        const target = window.SmartCity.targetFromObject(hit.object);
        if (target) {
          window.SmartCity.selectTarget(target);
          break;
        }
      }
    },

    resetPlacement: function () {
      this.placed = false;
      this.surfaceVisible = false;
      this.city.object3D.visible = false;
      this.reticle.object3D.visible = false;
      if (window.arUI) window.arUI.scanning();
    }
  });

  const missions = [
    { id: "energy", icon: "☀️", prompt: "Find the clean power system.", hint: "Look for blue solar panels on a red roof, or tall white wind turbines.", badge: "Clean Power Scout" },
    { id: "traffic", icon: "🚦", prompt: "Find the light that can see the traffic.", hint: "Look at the corners of the crossing for a traffic light with a little camera eye.", badge: "Traffic Hero" },
    { id: "waste", icon: "🗑️", prompt: "Find the trash can that knows when it is full.", hint: "Look beside the playground for a grey bin that calls the green garbage truck.", badge: "Clean City Helper" },
    { id: "green", icon: "🌿", prompt: "Find the building that helps people breathe easier.", hint: "Look for the two tall towers covered with trees, like in Milan.", badge: "Nature Builder" },
    { id: "home", icon: "🏠", prompt: "Find the home with a smart thermostat.", hint: "Look for the white house with a navy roof and a round 19° control by the door.", badge: "Home Energy Expert" },
    { id: "transport", icon: "🚌", prompt: "Find Lebanon's quiet electric transport.", hint: "Look for the teal bus with a lightning bolt driving on the road.", badge: "Quiet Travel Detective" }
  ];

  function initialize() {
    const scene = document.querySelector("a-scene");
    const city = document.getElementById("city");
    const startCard = document.getElementById("startCard");
    const startButton = document.getElementById("startAR");
    const fallback = document.getElementById("fallback");
    const status = document.getElementById("status");
    const placementHint = document.getElementById("placementHint");
    const controls = document.getElementById("controls");
    const missionText = document.getElementById("missionText");
    const missionIcon = document.getElementById("missionIcon");
    const missionCount = document.getElementById("missionCount");
    const success = document.getElementById("success");
    const successIcon = document.getElementById("successIcon");
    const successTitle = document.getElementById("successTitle");
    const successMessage = document.getElementById("successMessage");
    const badgeEarned = document.getElementById("badgeEarned");
    const nextMission = document.getElementById("nextMission");
    const toast = document.getElementById("toast");
    const progress = document.getElementById("progress");
    const confetti = document.getElementById("confetti");
    const overlay = document.getElementById("overlay");
    let missionIndex = 0;
    const found = new Set();
    let cityScale = .2;
    let finalCelebration = false;
    let launchingAR = false;
    let launchTimer = null;
    let inAR = false;
    let selectLockedUntil = 0;
    let hintsShown = 0;

    missions.forEach(function (mission) {
      const chip = document.createElement("span");
      chip.textContent = mission.icon;
      chip.dataset.mission = mission.id;
      chip.setAttribute("aria-label", mission.prompt);
      progress.appendChild(chip);
    });

    function showMission() {
      const mission = missions[missionIndex];
      missionIcon.textContent = mission.icon;
      missionText.textContent = mission.prompt;
      missionCount.textContent = `${found.size} / ${missions.length} found`;
    }

    function showToast(message) {
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.remove("show"), 1900);
    }

    function celebrate(amount) {
      const colors = ["#08a6d4", "#073b73", "#45e28b", "#f4c843", "#ef5c55", "#ffffff"];
      for (let i = 0; i < amount; i += 1) {
        const piece = document.createElement("i");
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = colors[i % colors.length];
        piece.style.setProperty("--drift", `${Math.round((Math.random() - .5) * 180)}px`);
        piece.style.animationDelay = `${Math.random() * .28}s`;
        confetti.appendChild(piece);
        window.setTimeout(() => piece.remove(), 1700);
      }
      if (navigator.vibrate) navigator.vibrate(60);
    }

    function showFallback(message) {
      status.textContent = "Use the 3D version";
      fallback.querySelector("p").textContent = message || "Markerless AR is unavailable on this tablet. The interactive 3D version has the same city and missions.";
      fallback.hidden = false;
      startCard.hidden = false;
      startButton.disabled = false;
      startButton.dataset.mode = "fallback";
      startButton.textContent = "Open interactive 3D";
    }

    function waitForScene() {
      if (scene.hasLoaded && typeof scene.enterAR === "function") return Promise.resolve();
      return new Promise(function (resolve, reject) {
        const timer = window.setTimeout(function () {
          reject(new Error("The 3D scene took too long to load."));
        }, 10000);
        scene.addEventListener("loaded", function () {
          window.clearTimeout(timer);
          if (typeof scene.enterAR === "function") resolve();
          else reject(new Error("The AR launcher did not load."));
        }, { once: true });
      });
    }

    window.arUI = {
      scanning: function () {
        status.textContent = "Looking for a surface";
        placementHint.textContent = "Move the tablet slowly over a desk or the floor.";
        placementHint.classList.remove("hidden");
        controls.classList.remove("show");
      },
      surfaceFound: function () {
        status.textContent = "Surface found";
        placementHint.textContent = "Tap the glowing circle to place the city.";
      },
      placed: function () {
        status.textContent = "City placed";
        placementHint.classList.add("hidden");
        controls.classList.add("show");
        showToast("City placed! Walk around it or use the controls.");
      },
      error: function (message) {
        status.textContent = "AR unavailable";
        if (scene.is("ar-mode")) scene.exitVR();
        showFallback(message);
      }
    };

    showMission();

    if (!window.isSecureContext) {
      showFallback("Camera AR needs a secure connection. Open the interactive 3D version on this tablet.");
    } else if (!navigator.xr || !navigator.xr.isSessionSupported) {
      showFallback("This browser does not provide markerless WebXR. Use the interactive 3D version, or try Chrome on a compatible Android tablet.");
    } else {
      Promise.all([
        waitForScene(),
        navigator.xr.isSessionSupported("immersive-ar")
      ]).then(function (results) {
        const supported = results[1];
        if (supported) {
          status.textContent = "Camera ready";
          startButton.disabled = false;
          startButton.dataset.mode = "ar";
          startButton.textContent = "Open camera AR";
        } else {
          showFallback("This tablet cannot start markerless AR. Open the interactive 3D version, which keeps all six missions and badges.");
        }
      }).catch(function (error) {
        showFallback(error && error.message ? error.message : "The markerless AR check failed on this browser.");
      });
    }

    function launchAR(event) {
      if (event && event.cancelable) event.preventDefault();
      if (startButton.dataset.mode === "fallback") {
        window.location.href = "preview.html";
        return;
      }
      if (startButton.dataset.mode !== "ar" || launchingAR) return;
      launchingAR = true;
      startButton.disabled = true;
      startButton.textContent = "Opening camera…";
      status.textContent = "Tap received · opening camera";
      if (navigator.vibrate) navigator.vibrate(35);
      let launch;
      try {
        launch = scene.enterAR();
      } catch (error) {
        launchingAR = false;
        showFallback("Markerless AR could not start on this browser. Open the interactive 3D version instead.");
        return;
      }
      Promise.resolve(launch).catch(function (error) {
        launchingAR = false;
        const detail = error && error.name === "NotAllowedError"
          ? "Camera or motion permission was blocked. Allow permission and try again, or open interactive 3D."
          : "This tablet rejected the markerless AR session. Open interactive 3D, or try Chrome on a compatible Android tablet.";
        showFallback(detail);
      });

      window.clearTimeout(launchTimer);
      launchTimer = window.setTimeout(function () {
        if (!scene.is("ar-mode")) {
          launchingAR = false;
          showFallback("The camera did not open. Try again in Chrome, or use the interactive 3D version.");
        }
      }, 20000);
    }

    scene.addEventListener("enter-vr", function () {
      if (!scene.is("ar-mode")) return;
      window.clearTimeout(launchTimer);
      inAR = true;
      launchingAR = false;
      startCard.hidden = true;
      status.textContent = "Move slowly";
    });

    // Without this, a session that ended on its own left the page on a dark screen
    // with the start card hidden and nothing to tap to get the camera back.
    scene.addEventListener("exit-vr", function () {
      if (!inAR) return;
      inAR = false;
      launchingAR = false;
      success.hidden = true;
      controls.classList.remove("show");
      placementHint.classList.add("hidden");
      if (startButton.dataset.mode === "fallback") return;
      document.getElementById("startTitle").textContent = "The camera stopped";
      document.getElementById("startText").textContent = "Tap the button to open the camera again and place the city. Your badges are saved.";
      startCard.hidden = false;
      startButton.disabled = false;
      startButton.dataset.mode = "ar";
      startButton.textContent = "Restart camera AR";
      status.textContent = "Camera paused";
    });

    startButton.addEventListener("click", launchAR);
    startButton.addEventListener("touchend", launchAR, { passive: false });

    document.addEventListener("touchend", function (event) {
      if (startCard.hidden || launchingAR) return;
      if (event.target === startButton || (event.target.closest && event.target.closest("#startAR"))) return;
      if (startButton.dataset.mode !== "ar" || !event.changedTouches || !event.changedTouches.length) return;
      const touch = event.changedTouches[0];
      const rect = startButton.getBoundingClientRect();
      if (touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        launchAR(event);
      }
    }, { capture: true, passive: false });

    // Only taps on the empty overlay go through to the city. Before, a tap on the
    // success card, mission bar or any text (anything that was not a button) also
    // fired an AR tap on the building behind it, which re-opened the popup.
    overlay.addEventListener("beforexrselect", function (event) {
      if (event.target !== overlay) event.preventDefault();
    });

    document.addEventListener("smart-system-select", function (event) {
      // The success card is modal: ignore city taps while it is open and briefly
      // after it closes, so fast repeated taps cannot re-trigger it.
      if (!success.hidden || performance.now() < selectLockedUntil) return;
      selectLockedUntil = performance.now() + 400;
      const selected = event.detail;
      if (found.size === missions.length) {
        window.SmartCity.flashTarget(selected.element, "#45e28b");
        showToast(`${selected.icon} ${selected.title}`);
        return;
      }
      const wanted = missions[missionIndex];
      if (selected.id !== wanted.id) {
        window.SmartCity.flashTarget(selected.element, "#f7a83b");
        showToast(found.has(selected.id)
          ? `You already found ${selected.title}. Keep looking!`
          : `That is ${selected.title}. Keep looking!`);
        return;
      }

      window.SmartCity.flashTarget(selected.element, "#45e28b");
      window.SmartCity.markFound(selected.id);
      found.add(selected.id);
      const chip = progress.querySelector(`[data-mission="${selected.id}"]`);
      if (chip) chip.classList.add("found");
      missionCount.textContent = `${found.size} / ${missions.length} found`;
      successIcon.textContent = selected.icon;
      successTitle.textContent = `Yes! You found ${selected.title}!`;
      successMessage.textContent = selected.message;
      badgeEarned.textContent = `Badge earned: ${wanted.badge}`;
      nextMission.textContent = found.size === missions.length ? "Finish" : "Next mission";
      success.dataset.final = "false";
      success.hidden = false;
      celebrate(14);
    });

    // The whole card continues (the button click bubbles up here), so a child who
    // taps the text instead of the button is not stuck.
    success.addEventListener("click", function () {
      selectLockedUntil = performance.now() + 400;
      if (found.size === missions.length) {
        if (!finalCelebration) {
          finalCelebration = true;
          success.dataset.final = "true";
          successIcon.textContent = "🏆";
          successTitle.textContent = "Smart City Explorer!";
          badgeEarned.textContent = "All six badges collected";
          successMessage.textContent = "You connected clean power, smart sensors, nature, homes, and transport to make the whole city work together.";
          nextMission.textContent = "Keep exploring";
          celebrate(30);
          missionIcon.textContent = "🏆";
          missionText.textContent = "Smart City Explorer complete!";
          missionCount.textContent = "6 / 6 found";
          return;
        }
        success.hidden = true;
        showToast("Amazing work! Walk around the city and use the size controls.");
        return;
      }
      success.hidden = true;
      do {
        missionIndex = (missionIndex + 1) % missions.length;
      } while (found.has(missions[missionIndex].id));
      hintsShown = 0;
      showMission();
    });

    // First tap reads the hint; the next taps make the right system jump.
    document.getElementById("hintButton").addEventListener("click", function () {
      const mission = missions[missionIndex];
      if (found.size === missions.length) return;
      hintsShown += 1;
      if (hintsShown === 1) {
        showToast(`Hint: ${mission.hint}`);
      } else {
        window.SmartCity.bounce(mission.id);
        showToast("Look! Something is jumping. Tap it!");
      }
    });

    function setScale(next) {
      cityScale = Math.max(.12, Math.min(.36, next));
      city.object3D.scale.setScalar(cityScale);
      showToast(cityScale > .2 ? "City made bigger" : cityScale < .2 ? "City made smaller" : "City size reset");
    }

    document.getElementById("larger").addEventListener("click", () => setScale(cityScale + .04));
    document.getElementById("smaller").addEventListener("click", () => setScale(cityScale - .04));
    document.getElementById("turnLeft").addEventListener("click", () => { city.object3D.rotation.y += THREE.MathUtils.degToRad(20); });
    document.getElementById("turnRight").addEventListener("click", () => { city.object3D.rotation.y -= THREE.MathUtils.degToRad(20); });
    document.getElementById("replace").addEventListener("click", function () {
      const component = document.getElementById("placement").components["surface-placement"];
      if (component) component.resetPlacement();
    });
  }

  window.startMarkerlessUI = initialize;
  if (window.__deferMarkerlessInit) {
    return;
  }
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
