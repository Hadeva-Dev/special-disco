/**
 * Camera preview page for testing attention detection
 */

import { AttentionSettings, AttentionState } from "./shared/types";
import { getAttentionSettings } from "./attentionSettings";

// DOM Elements
const webcam = document.getElementById("webcam") as HTMLVideoElement;
const overlayCanvas = document.getElementById("overlay-canvas") as HTMLCanvasElement;
const statusIndicator = document.getElementById("status-indicator") as HTMLDivElement;
const startCameraBtn = document.getElementById("start-camera-btn") as HTMLButtonElement;
const stopCameraBtn = document.getElementById("stop-camera-btn") as HTMLButtonElement;
const cameraError = document.getElementById("camera-error") as HTMLDivElement;
const backToSettingsBtn = document.getElementById("back-to-settings") as HTMLButtonElement;

// Metric elements
const attentionStateEl = document.getElementById("attention-state") as HTMLDivElement;
const earValueEl = document.getElementById("ear-value") as HTMLDivElement;
const closedDurationEl = document.getElementById("closed-duration") as HTMLDivElement;
const confidenceEl = document.getElementById("confidence") as HTMLDivElement;

// State
let stream: MediaStream | null = null;
let settings: AttentionSettings;
let ctx: CanvasRenderingContext2D | null = null;

/**
 * Initialize the page
 */
async function init() {
  // Load settings
  settings = await getAttentionSettings();

  // Show/hide optional metric cards based on enabled detectors
  updateVisibleMetricCards(settings);

  // Setup canvas
  if (overlayCanvas) {
    ctx = overlayCanvas.getContext("2d");
  }

  // Setup event listeners
  setupEventListeners();

  // Listen for attention state updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "ATTENTION_UPDATE") {
      updateMetricsUI(message.payload);
    }
  });

  console.log("[CameraPreview] Initialized");
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  startCameraBtn.addEventListener("click", startCamera);
  stopCameraBtn.addEventListener("click", stopCamera);
  backToSettingsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/camera.html") });
    window.close();
  });
}

/**
 * Start camera
 */
async function startCamera() {
  try {
    cameraError.style.display = "none";

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
      }
    });

    webcam.srcObject = stream;

    // Update canvas size to match video
    webcam.addEventListener("loadedmetadata", () => {
      overlayCanvas.width = webcam.videoWidth;
      overlayCanvas.height = webcam.videoHeight;
    });

    // Update UI
    statusIndicator.classList.add("active");
    startCameraBtn.disabled = true;
    stopCameraBtn.disabled = false;

    console.log("[CameraPreview] Camera started successfully");

    // Start detection (simulated for now)
    startDetectionSimulation();
  } catch (error) {
    console.error("[CameraPreview] Failed to start camera:", error);
    cameraError.textContent = `Failed to access camera: ${(error as Error).message}. Please check permissions.`;
    cameraError.style.display = "block";
  }
}

/**
 * Stop camera
 */
function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
    webcam.srcObject = null;
  }

  statusIndicator.classList.remove("active");
  startCameraBtn.disabled = false;
  stopCameraBtn.disabled = true;

  console.log("[CameraPreview] Camera stopped");
}

/**
 * Start detection simulation
 * Note: This is a placeholder. Real detection would use MediaPipe Face Mesh
 */
function startDetectionSimulation() {
  // This would be replaced with actual face detection logic
  // For now, show demo data
  const demoData = {
    state: "awake" as AttentionState,
    confidence: 0.85,
    metrics: {
      earValue: 0.25,
      eyesClosedDuration: 0,
      blinkRate: settings.detectors.blinkRate ? 15 : undefined,
      gazeOffScreen: settings.detectors.gazeDirection ? false : undefined,
      headTiltAngle: settings.detectors.headPose ? 5 : undefined,
      yawning: settings.detectors.yawning ? false : undefined,
    },
    timestamp: Date.now(),
  };

  updateMetricsUI(demoData);
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

  if (data.confidence !== undefined) {
    confidenceEl.textContent = (data.confidence * 100).toFixed(0) + "%";
  }

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

// Initialize on load
init();

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  stopCamera();
});
