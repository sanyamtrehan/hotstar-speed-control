(() => {
  "use strict";

  /*
   * ============================================================
   * State
   * ============================================================
   */

  const STORAGE_KEY = "hotstar-playback-speed";

  const PLAYER_MENU_SELECTOR = 'button[data-testid="player-menu"]';

  let video = null;

  let controls = null;

  let hideTimer = null;

  let currentSpeed =
    parseFloat(localStorage.getItem(STORAGE_KEY)) || SPEED_CONFIG.defaultSpeed;

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

    if (newVideo && newVideo !== video) {
      console.log("[Hotstar Speed] New video detected");

      video = newVideo;

      video.playbackRate = currentSpeed;
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

    setupMouseDetection();

    setupKeyboard();

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
