(() => {
  "use strict";

  /*
   * ============================================================
   * State
   * ============================================================
   */

  const STORAGE_KEY = "hotstar-playback-speed";

  const AUDIO_ENABLED_STORAGE_KEY = "hotstar-audio-boost-enabled";

  const AUDIO_GAIN_STORAGE_KEY = "hotstar-audio-boost-gain";

  const PLAYER_MENU_SELECTOR = 'button[data-testid="player-menu"]';

  let video = null;

  let controls = null;

  let hideTimer = null;

  let currentSpeed =
    parseFloat(localStorage.getItem(STORAGE_KEY)) || SPEED_CONFIG.defaultSpeed;

  let audioEnabled =
    localStorage.getItem(AUDIO_ENABLED_STORAGE_KEY) === "true" ||
    (localStorage.getItem(AUDIO_ENABLED_STORAGE_KEY) === null &&
      SPEED_CONFIG.audio.defaultEnabled);

  const storedAudioGain = parseFloat(
    localStorage.getItem(AUDIO_GAIN_STORAGE_KEY),
  );

  let audioGain = Number.isFinite(storedAudioGain)
    ? Math.max(
        SPEED_CONFIG.audio.minGain,
        Math.min(SPEED_CONFIG.audio.maxGain, storedAudioGain),
      )
    : SPEED_CONFIG.audio.defaultGain;

  let audioContext = null;

  let gainNode = null;

  let compressorNode = null;

  let activeAudioSource = null;

  let activeAudioVideo = null;

  const audioSources = new WeakMap();

  /*
   * ============================================================
   * Video helpers
   * ============================================================
   */

  function findVideo() {
    return document.querySelector("video");
  }

  function applySpeed() {
    video = findVideo();

    if (!video) {
      return;
    }

    video.playbackRate = currentSpeed;
  }

  function setSpeed(speed) {
    speed = Number(speed);

    if (!Number.isFinite(speed)) {
      return;
    }

    currentSpeed = speed;

    localStorage.setItem(STORAGE_KEY, String(currentSpeed));

    if (video) {
      video.playbackRate = currentSpeed;
    }

    updateUI();
  }

  function changeSpeed(amount) {
    const speeds = SPEED_CONFIG.speeds;

    let currentIndex = speeds.findIndex((speed) => speed === currentSpeed);

    /*
     * If the stored speed isn't one of our
     * configured values, find the closest one.
     */

    if (currentIndex === -1) {
      let closestDistance = Infinity;

      speeds.forEach((speed, index) => {
        const distance = Math.abs(speed - currentSpeed);

        if (distance < closestDistance) {
          closestDistance = distance;

          currentIndex = index;
        }
      });
    }

    const direction = amount > 0 ? 1 : -1;

    let newIndex = currentIndex + direction;

    newIndex = Math.max(0, Math.min(speeds.length - 1, newIndex));

    setSpeed(speeds[newIndex]);
  }

  /*
   * ============================================================
   * Audio boost
   * ============================================================
   */

  function clampAudioGain(gain) {
    return Math.max(
      SPEED_CONFIG.audio.minGain,
      Math.min(SPEED_CONFIG.audio.maxGain, gain),
    );
  }

  function ensureAudioContext() {
    if (audioContext) {
      return audioContext;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      console.warn("[Hotstar Speed] Web Audio is not supported");

      return null;
    }

    audioContext = new AudioContextClass();
    gainNode = audioContext.createGain();
    compressorNode = audioContext.createDynamicsCompressor();

    /*
     * Limit only the boosted peaks. With a ratio of 1 the
     * compressor becomes transparent when boost is disabled.
     */

    compressorNode.threshold.value = -3;
    compressorNode.knee.value = 0;
    compressorNode.attack.value = 0.003;
    compressorNode.release.value = 0.25;

    gainNode.connect(compressorNode);
    compressorNode.connect(audioContext.destination);

    updateAudioGraph();

    return audioContext;
  }

  function updateAudioGraph() {
    if (!audioContext || !gainNode || !compressorNode) {
      return;
    }

    const now = audioContext.currentTime;
    const effectiveGain = audioEnabled ? audioGain : 1;
    const compressorRatio = audioEnabled && audioGain > 1 ? 20 : 1;

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setTargetAtTime(effectiveGain, now, 0.015);

    compressorNode.ratio.cancelScheduledValues(now);
    compressorNode.ratio.setTargetAtTime(compressorRatio, now, 0.015);
  }

  function disconnectActiveAudioSource() {
    if (activeAudioSource) {
      activeAudioSource.disconnect();
    }

    activeAudioSource = null;
    activeAudioVideo = null;
  }

  function connectAudioSource(targetVideo) {
    if (!audioContext || !gainNode || activeAudioVideo === targetVideo) {
      return;
    }

    disconnectActiveAudioSource();

    let source = audioSources.get(targetVideo);

    try {
      if (!source) {
        source = audioContext.createMediaElementSource(targetVideo);
        audioSources.set(targetVideo, source);
      }

      source.connect(gainNode);

      activeAudioSource = source;
      activeAudioVideo = targetVideo;
    } catch (error) {
      console.warn("[Hotstar Speed] Could not connect audio boost", error);
    }
  }

  async function activateAudioBoost(targetVideo = video) {
    if (!audioEnabled || !targetVideo) {
      return;
    }

    const context = ensureAudioContext();

    if (!context) {
      return;
    }

    try {
      if (context.state !== "running") {
        await context.resume();
      }

      if (
        audioEnabled &&
        targetVideo === video &&
        context.state === "running"
      ) {
        connectAudioSource(targetVideo);
        updateAudioGraph();
      }
    } catch (error) {
      console.warn("[Hotstar Speed] Could not start audio boost", error);
    }
  }

  function setAudioEnabled(enabled) {
    audioEnabled = Boolean(enabled);

    localStorage.setItem(AUDIO_ENABLED_STORAGE_KEY, String(audioEnabled));

    updateAudioGraph();
    updateAudioUI();

    if (audioEnabled) {
      void activateAudioBoost();
    } else if (audioContext?.state === "suspended") {
      void audioContext.resume().catch((error) => {
        console.warn("[Hotstar Speed] Could not resume audio output", error);
      });
    }
  }

  function setAudioGain(gain) {
    gain = Number(gain);

    if (!Number.isFinite(gain)) {
      return;
    }

    audioGain = Math.round(clampAudioGain(gain) * 100) / 100;

    localStorage.setItem(AUDIO_GAIN_STORAGE_KEY, String(audioGain));

    updateAudioGraph();
    updateAudioUI();
  }

  function changeAudioGain(amount) {
    setAudioGain(audioGain + amount);
  }

  /*
   * ============================================================
   * Formatting
   * ============================================================
   */

  function formatSpeed(speed) {
    return `${speed}×`;
  }

  /*
   * ============================================================
   * Position controls
   * ============================================================
   */

  function positionControls() {
    if (!controls) {
      return;
    }

    const playerMenu = document.querySelector(PLAYER_MENU_SELECTOR);

    if (playerMenu?.parentNode) {
      clearTimeout(hideTimer);

      controls.classList.add("embedded");
      controls.classList.remove("hidden");
      controls.style.removeProperty("top");
      controls.style.removeProperty("right");

      if (
        controls.parentNode !== playerMenu.parentNode ||
        controls.nextSibling !== playerMenu
      ) {
        playerMenu.parentNode.insertBefore(controls, playerMenu);
      }

      return;
    }

    const wasEmbedded = controls.classList.contains("embedded");

    controls.classList.remove("embedded");
    controls.style.top = `${SPEED_CONFIG.position.top}px`;
    controls.style.right = SPEED_CONFIG.position.right;

    if (controls.parentNode !== document.body) {
      document.body.appendChild(controls);
    }

    if (wasEmbedded) {
      showControls();
    }
  }

  /*
   * ============================================================
   * Create UI
   * ============================================================
   */

  function createControls() {
    if (controls) {
      return;
    }

    console.log("[Hotstar Speed] Creating controls");

    controls = document.createElement("div");

    controls.id = "hotstar-speed-controls";

    controls.innerHTML = `
      ${
        SPEED_CONFIG.showStepButtons
          ? `
            <button
              class="hotstar-speed-step"
              data-action="decrease"
              title="Decrease speed"
            >
              −
            </button>
          `
          : ""
      }

      <button
        class="hotstar-speed-main"
        title="Playback speed"
      >
        1×
      </button>

      ${
        SPEED_CONFIG.showStepButtons
          ? `
            <button
              class="hotstar-speed-step"
              data-action="increase"
              title="Increase speed"
            >
              +
            </button>
          `
          : ""
      }

      <div class="hotstar-speed-menu"></div>

      <span class="hotstar-control-divider" aria-hidden="true"></span>

      <button
        class="hotstar-audio-main"
        title="Audio boost"
        aria-label="Audio boost"
        aria-expanded="false"
        aria-pressed="false"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4Z"></path>
          <path d="M16 8.5a5 5 0 0 1 0 7"></path>
          <path d="M18.5 6a8.5 8.5 0 0 1 0 12"></path>
        </svg>
      </button>

      <div class="hotstar-audio-menu">
        <button
          class="hotstar-audio-toggle"
          data-audio-action="toggle"
          role="switch"
          aria-checked="false"
        >
          <span>Audio boost</span>
          <span class="hotstar-audio-status">Off</span>
        </button>

        <div class="hotstar-audio-adjustment">
          <button
            data-audio-action="decrease"
            title="Decrease audio boost"
            aria-label="Decrease audio boost"
          >
            −
          </button>

          <span class="hotstar-audio-value">2×</span>

          <button
            data-audio-action="increase"
            title="Increase audio boost"
            aria-label="Increase audio boost"
          >
            +
          </button>
        </div>

        <button
          class="hotstar-audio-reset"
          data-audio-action="reset"
        >
          Reset to 1×
        </button>
      </div>
    `;

    /*
     * ----------------------------------------------------------
     * Prevent clicks from reaching Hotstar
     * ----------------------------------------------------------
     */

    controls.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    controls.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });

    /*
     * ----------------------------------------------------------
     * Decrease
     * ----------------------------------------------------------
     */

    const decrease = controls.querySelector('[data-action="decrease"]');

    if (decrease) {
      decrease.addEventListener("click", () => {
        changeSpeed(-SPEED_CONFIG.step);

        showControls();
      });
    }

    /*
     * ----------------------------------------------------------
     * Increase
     * ----------------------------------------------------------
     */

    const increase = controls.querySelector('[data-action="increase"]');

    if (increase) {
      increase.addEventListener("click", () => {
        changeSpeed(SPEED_CONFIG.step);

        showControls();
      });
    }

    /*
     * ----------------------------------------------------------
     * Main speed button
     * ----------------------------------------------------------
     */

    const mainButton = controls.querySelector(".hotstar-speed-main");

    mainButton.addEventListener("click", () => {
      hideAudioMenu();

      controls.classList.toggle("menu-open");

      showControls();
    });

    /*
     * ----------------------------------------------------------
     * Speed menu
     * ----------------------------------------------------------
     */

    const menu = controls.querySelector(".hotstar-speed-menu");

    SPEED_CONFIG.speeds.forEach((speed) => {
      const option = document.createElement("button");

      option.className = "hotstar-speed-option";

      option.dataset.speed = speed;

      option.textContent = formatSpeed(speed);

      option.addEventListener("click", (event) => {
        event.stopPropagation();

        setSpeed(speed);

        hideSpeedMenu();

        showControls();
      });

      menu.appendChild(option);
    });

    /*
     * ----------------------------------------------------------
     * Audio boost
     * ----------------------------------------------------------
     */

    const audioButton = controls.querySelector(".hotstar-audio-main");

    audioButton.addEventListener("click", () => {
      hideSpeedMenu();

      controls.classList.toggle("audio-menu-open");

      audioButton.setAttribute(
        "aria-expanded",
        String(controls.classList.contains("audio-menu-open")),
      );

      showControls();
    });

    controls
      .querySelector('[data-audio-action="toggle"]')
      .addEventListener("click", () => {
        setAudioEnabled(!audioEnabled);
        showControls();
      });

    controls
      .querySelector('[data-audio-action="decrease"]')
      .addEventListener("click", () => {
        changeAudioGain(-SPEED_CONFIG.audio.step);
        showControls();
      });

    controls
      .querySelector('[data-audio-action="increase"]')
      .addEventListener("click", () => {
        changeAudioGain(SPEED_CONFIG.audio.step);
        showControls();
      });

    controls
      .querySelector('[data-audio-action="reset"]')
      .addEventListener("click", () => {
        setAudioGain(1);
        showControls();
      });

    /*
     * Appearance variables
     */

    controls.style.setProperty(
      "--hs-background",
      SPEED_CONFIG.appearance.background,
    );

    controls.style.setProperty(
      "--hs-foreground",
      SPEED_CONFIG.appearance.foreground,
    );

    controls.style.setProperty(
      "--hs-radius",
      `${SPEED_CONFIG.appearance.borderRadius}px`,
    );

    controls.style.setProperty("--hs-opacity", SPEED_CONFIG.appearance.opacity);

    controls.style.setProperty(
      "--hs-blur",
      `${SPEED_CONFIG.appearance.blur}px`,
    );

    controls.style.setProperty(
      "--hs-button-size",
      `${SPEED_CONFIG.appearance.buttonSize}px`,
    );

    controls.style.setProperty(
      "--hs-font-size",
      `${SPEED_CONFIG.appearance.fontSize}px`,
    );

    controls.style.setProperty("--hs-gap", `${SPEED_CONFIG.appearance.gap}px`);

    positionControls();

    if (!controls.classList.contains("embedded")) {
      controls.classList.add("hidden");
    }

    console.log("[Hotstar Speed] Controls added:", controls);

    updateUI();
    updateAudioUI();
  }

  /*
   * ============================================================
   * UI updates
   * ============================================================
   */

  function updateUI() {
    if (!controls) {
      return;
    }

    const mainButton = controls.querySelector(".hotstar-speed-main");

    if (mainButton) {
      mainButton.textContent = formatSpeed(currentSpeed);
    }

    controls.querySelectorAll(".hotstar-speed-option").forEach((option) => {
      const speed = parseFloat(option.dataset.speed);

      option.classList.toggle("active", speed === currentSpeed);
    });
  }

  function updateAudioUI() {
    if (!controls) {
      return;
    }

    const audioButton = controls.querySelector(".hotstar-audio-main");
    const toggle = controls.querySelector(".hotstar-audio-toggle");
    const status = controls.querySelector(".hotstar-audio-status");
    const value = controls.querySelector(".hotstar-audio-value");

    audioButton?.classList.toggle("active", audioEnabled);
    audioButton?.setAttribute("aria-pressed", String(audioEnabled));

    if (audioButton) {
      audioButton.title = audioEnabled
        ? `Audio boost: ${formatSpeed(audioGain)}`
        : "Audio boost: Off";
    }

    toggle?.classList.toggle("active", audioEnabled);
    toggle?.setAttribute("aria-checked", String(audioEnabled));

    if (status) {
      status.textContent = audioEnabled ? "On" : "Off";
    }

    if (value) {
      value.textContent = formatSpeed(audioGain);
    }
  }

  /*
   * ============================================================
   * Menu
   * ============================================================
   */

  function hideSpeedMenu() {
    if (!controls) {
      return;
    }

    controls.classList.remove("menu-open");
  }

  function hideAudioMenu() {
    if (!controls) {
      return;
    }

    controls.classList.remove("audio-menu-open");

    controls
      .querySelector(".hotstar-audio-main")
      ?.setAttribute("aria-expanded", "false");
  }

  /*
   * ============================================================
   * Show / hide controls
   * ============================================================
   */

  function showControls() {
    if (!controls) {
      return;
    }

    controls.classList.remove("hidden");

    clearTimeout(hideTimer);

    if (controls.classList.contains("embedded")) {
      return;
    }

    hideTimer = setTimeout(() => {
      hideSpeedMenu();
      hideAudioMenu();

      controls.classList.add("hidden");
    }, SPEED_CONFIG.hideDelay);
  }

  /*
   * ============================================================
   * Mouse movement
   * ============================================================
   *
   * Don't depend on event.target being <video>.
   *
   * Hotstar has multiple layers over the video.
   */

  function setupMouseDetection() {
    document.addEventListener(
      "mousemove",
      (event) => {
        if (!video) {
          return;
        }

        const rect = video.getBoundingClientRect();

        const insideVideo =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;

        if (insideVideo) {
          showControls();
        }
      },
      true,
    );
  }

  /*
   * ============================================================
   * Keyboard shortcuts
   * ============================================================
   */

  function setupKeyboard() {
    if (!SPEED_CONFIG.keyboard.enabled) {
      return;
    }

    document.addEventListener("keydown", (event) => {
      const target = event.target;

      /*
       * Don't interfere with text fields.
       */

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      /*
       * Increase
       */

      if (event.key === SPEED_CONFIG.keyboard.increase) {
        event.preventDefault();

        changeSpeed(SPEED_CONFIG.step);

        showControls();

        return;
      }

      /*
       * Decrease
       */

      if (event.key === SPEED_CONFIG.keyboard.decrease) {
        event.preventDefault();

        changeSpeed(-SPEED_CONFIG.step);

        showControls();

        return;
      }

      /*
       * Reset
       */

      if (event.key === SPEED_CONFIG.keyboard.reset) {
        event.preventDefault();

        setSpeed(SPEED_CONFIG.defaultSpeed);

        showControls();
      }
    });
  }

  function setupAudioResume() {
    const resumeAudio = () => {
      if (audioEnabled && audioContext?.state !== "running") {
        void activateAudioBoost();
      }
    };

    document.addEventListener("pointerdown", resumeAudio, true);
    document.addEventListener("keydown", resumeAudio, true);
  }

  /*
   * ============================================================
   * Detect video replacement
   * ============================================================
   *
   * Hotstar can destroy the current video element and create
   * another one when changing episodes.
   */

  function checkVideo() {
    const newVideo = findVideo();

    if (!newVideo && video) {
      disconnectActiveAudioSource();
      video = null;
    }

    if (newVideo && newVideo !== video) {
      console.log("[Hotstar Speed] New video detected");

      disconnectActiveAudioSource();

      video = newVideo;

      video.playbackRate = currentSpeed;

      if (audioEnabled) {
        void activateAudioBoost(newVideo);
      }
    }

    /*
     * If the controls somehow disappeared,
     * recreate them.
     */

    if (!document.querySelector("#hotstar-speed-controls")) {
      controls = null;

      createControls();
    }

    positionControls();
  }

  /*
   * ============================================================
   * Mutation observer
   * ============================================================
   */

  function watchForChanges() {
    const observer = new MutationObserver(() => {
      checkVideo();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  /*
   * ============================================================
   * Initialization
   * ============================================================
   */

  function init() {
    console.log("[Hotstar Speed] Initializing");

    createControls();

    applySpeed();

    if (audioEnabled) {
      void activateAudioBoost();
    }

    setupMouseDetection();

    setupKeyboard();

    setupAudioResume();

    watchForChanges();

    /*
     * Fallback check.
     *
     * This is intentionally slow because the MutationObserver
     * handles most cases.
     */

    setInterval(checkVideo, 1000);

    /*
     * Start hidden.
     */

    if (controls && !controls.classList.contains("embedded")) {
      controls.classList.add("hidden");
    }
  }

  /*
   * ============================================================
   * Start
   * ============================================================
   */

  init();
})();
