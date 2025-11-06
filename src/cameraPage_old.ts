/**
 * Camera tracking UI page for Chrome extension
 */

import { AttentionSettings, AttentionState } from "./shared/types";
import {
  getAttentionSettings,
  saveAttentionSettings,
  resetAttentionSettings,
} from "./attentionSettings";

// DOM Elements
const webcam = document.getElementById("webcam") as HTMLVideoElement;
const toggleCameraBtn = document.getElementById("toggle-camera") as HTMLButtonElement;
const toggleOverlayBtn = document.getElementById("toggle-overlay") as HTMLButtonElement;

// Metric elements
const attentionStateEl = document.getElementById("attention-state") as HTMLDivElement;
const earValueEl = document.getElementById("ear-value") as HTMLDivElement;
const closedDurationEl = document.getElementById("closed-duration") as HTMLDivElement;
const confidenceEl = document.getElementById("confidence") as HTMLDivElement;

// Settings elements
const enableDetectionCheckbox = document.getElementById("enable-detection") as HTMLInputElement;
const detectorCheckboxes = {
  drowsiness: document.getElementById("detector-drowsiness") as HTMLInputElement,
  microsleep: document.getElementById("detector-microsleep") as HTMLInputElement,
  yawning: document.getElementById("detector-yawning") as HTMLInputElement,
  gazeDirection: document.getElementById("detector-gaze") as HTMLInputElement,
  headPose: document.getElementById("detector-head-pose") as HTMLInputElement,
  blinkRate: document.getElementById("detector-blink-rate") as HTMLInputElement,
};

const thresholdSliders = {
  ear: document.getElementById("threshold-ear") as HTMLInputElement,
  drowsy: document.getElementById("threshold-drowsy") as HTMLInputElement,
  microsleep: document.getElementById("threshold-microsleep") as HTMLInputElement,
};

const thresholdValues = {
  ear: document.getElementById("ear-threshold-value") as HTMLSpanElement,
  drowsy: document.getElementById("drowsy-seconds-value") as HTMLSpanElement,
  microsleep: document.getElementById("microsleep-seconds-value") as HTMLSpanElement,
};

const saveSettingsBtn = document.getElementById("save-settings") as HTMLButtonElement;
const resetSettingsBtn = document.getElementById("reset-settings") as HTMLButtonElement;

// State
let cameraActive = false;
let stream: MediaStream | null = null;
let settings: AttentionSettings;

/**
 * Initialize the page
 */
async function init() {
  // Load settings
  settings = await getAttentionSettings();
  populateSettingsUI(settings);

  // Setup event listeners
  setupEventListeners();

  // Listen for attention state updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "ATTENTION_UPDATE") {
      updateMetricsUI(message.payload);
    }
  });

  console.log("[CameraPage] Initialized");
}

/**
 * Populate settings UI with current settings
 */
function populateSettingsUI(settings: AttentionSettings) {
  enableDetectionCheckbox.checked = settings.enabled;

  Object.entries(settings.detectors).forEach(([key, value]) => {
    if (detectorCheckboxes[key as keyof typeof detectorCheckboxes]) {
      detectorCheckboxes[key as keyof typeof detectorCheckboxes].checked = value;
    }
  });

  thresholdSliders.ear.value = settings.thresholds.earThreshold.toString();
  thresholdSliders.drowsy.value = settings.thresholds.drowsySeconds.toString();
  thresholdSliders.microsleep.value = settings.thresholds.microsleepSeconds.toString();

  thresholdValues.ear.textContent = settings.thresholds.earThreshold.toFixed(2);
  thresholdValues.drowsy.textContent = settings.thresholds.drowsySeconds.toFixed(1);
  thresholdValues.microsleep.textContent = settings.thresholds.microsleepSeconds.toFixed(1);

  document.getElementById("ear-threshold")!.textContent = settings.thresholds.earThreshold.toFixed(2);

  // Show/hide optional metric cards based on enabled detectors
  updateVisibleMetricCards(settings);
}

/**
 * Show/hide metric cards based on enabled detectors
 */
function updateVisibleMetricCards(settings: AttentionSettings) {
  const cards = {
    "blink-rate-card": settings.detectors.blinkRate,
    "gaze-card": settings.detectors.gazeDirection,
    "head-pose-card": settings.detectors.headPose,
    "yawning-card": settings.detectors.yawning,
  };

  Object.entries(cards).forEach(([id, show]) => {
    const card = document.getElementById(id);
    if (card) {
      card.style.display = show ? "block" : "none";
    }
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Camera toggle
  toggleCameraBtn.addEventListener("click", toggleCamera);

  // Threshold sliders
  thresholdSliders.ear.addEventListener("input", (e) => {
    thresholdValues.ear.textContent = (e.target as HTMLInputElement).value;
  });
  thresholdSliders.drowsy.addEventListener("input", (e) => {
    thresholdValues.drowsy.textContent = parseFloat((e.target as HTMLInputElement).value).toFixed(1);
  });
  thresholdSliders.microsleep.addEventListener("input", (e) => {
    thresholdValues.microsleep.textContent = parseFloat((e.target as HTMLInputElement).value).toFixed(1);
  });

  // Settings buttons
  saveSettingsBtn.addEventListener("click", saveSettings);
  resetSettingsBtn.addEventListener("click", resetSettings);

  // Detector checkboxes - update visible cards
  Object.values(detectorCheckboxes).forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const tempSettings = getSettingsFromUI();
      updateVisibleMetricCards(tempSettings);
    });
  });
}

/**
 * Toggle camera on/off
 */
async function toggleCamera() {
  if (!cameraActive) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
      webcam.srcObject = stream;
      cameraActive = true;
      toggleCameraBtn.textContent = "Stop Camera";

      // Notify background that camera is active
      chrome.runtime.sendMessage({ type: "CAMERA_STARTED" });

      console.log("[CameraPage] Camera started");
    } catch (error) {
      console.error("[CameraPage] Failed to start camera:", error);
      alert("Failed to access camera. Please check permissions.");
    }
  } else {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      webcam.srcObject = null;
      stream = null;
    }
    cameraActive = false;
    toggleCameraBtn.textContent = "Start Camera";

    // Notify background that camera stopped
    chrome.runtime.sendMessage({ type: "CAMERA_STOPPED" });

    console.log("[CameraPage] Camera stopped");
  }
}

/**
 * Update metrics UI with attention data
 */
function updateMetricsUI(data: any) {
  // Update attention state
  const state = data.state as AttentionState;
  attentionStateEl.textContent = state.toUpperCase();
  attentionStateEl.className = `metric-value state-${state}`;

  // Update metrics
  if (data.metrics.earValue !== undefined) {
    earValueEl.textContent = data.metrics.earValue.toFixed(3);
  }

  if (data.metrics.eyesClosedDuration !== undefined) {
    closedDurationEl.textContent = data.metrics.eyesClosedDuration.toFixed(1) + "s";
  }

  confidenceEl.textContent = (data.confidence * 100).toFixed(0) + "%";

  // Update optional metrics
  if (data.metrics.blinkRate !== undefined) {
    const blinkRateEl = document.getElementById("blink-rate");
    if (blinkRateEl) blinkRateEl.textContent = data.metrics.blinkRate.toFixed(0) + " bpm";
  }

  if (data.metrics.gazeOffScreen !== undefined) {
    const gazeEl = document.getElementById("gaze-direction");
    if (gazeEl) gazeEl.textContent = data.metrics.gazeOffScreen ? "Off-screen" : "On-screen";
  }

  if (data.metrics.headTiltAngle !== undefined) {
    const headTiltEl = document.getElementById("head-tilt");
    if (headTiltEl) headTiltEl.textContent = data.metrics.headTiltAngle.toFixed(0) + "°";
  }

  if (data.metrics.yawning !== undefined) {
    const yawningEl = document.getElementById("yawning-status");
    if (yawningEl) yawningEl.textContent = data.metrics.yawning ? "Yes" : "No";
  }
}

/**
 * Get settings from UI
 */
function getSettingsFromUI(): AttentionSettings {
  return {
    enabled: enableDetectionCheckbox.checked,
    detectors: {
      drowsiness: detectorCheckboxes.drowsiness.checked,
      microsleep: detectorCheckboxes.microsleep.checked,
      yawning: detectorCheckboxes.yawning.checked,
      gazeDirection: detectorCheckboxes.gazeDirection.checked,
      headPose: detectorCheckboxes.headPose.checked,
      blinkRate: detectorCheckboxes.blinkRate.checked,
    },
    thresholds: {
      earThreshold: parseFloat(thresholdSliders.ear.value),
      drowsySeconds: parseFloat(thresholdSliders.drowsy.value),
      microsleepSeconds: parseFloat(thresholdSliders.microsleep.value),
    },
  };
}

/**
 * Save settings
 */
async function saveSettings() {
  try {
    settings = getSettingsFromUI();
    await saveAttentionSettings(settings);

    // Update UI
    document.getElementById("ear-threshold")!.textContent = settings.thresholds.earThreshold.toFixed(2);

    // Notify background
    chrome.runtime.sendMessage({
      type: "ATTENTION_SETTINGS_UPDATED",
      payload: settings,
    });

    // Show feedback
    saveSettingsBtn.textContent = "Saved!";
    setTimeout(() => {
      saveSettingsBtn.textContent = "Save Settings";
    }, 2000);

    console.log("[CameraPage] Settings saved:", settings);
  } catch (error) {
    console.error("[CameraPage] Failed to save settings:", error);
    alert("Failed to save settings");
  }
}

/**
 * Reset settings to defaults
 */
async function resetSettings() {
  if (confirm("Reset all settings to defaults?")) {
    try {
      settings = await resetAttentionSettings();
      populateSettingsUI(settings);

      // Notify background
      chrome.runtime.sendMessage({
        type: "ATTENTION_SETTINGS_UPDATED",
        payload: settings,
      });

      console.log("[CameraPage] Settings reset to defaults");
    } catch (error) {
      console.error("[CameraPage] Failed to reset settings:", error);
      alert("Failed to reset settings");
    }
  }
}

// Initialize on load
init();
