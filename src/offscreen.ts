/**
 * Offscreen Document for Camera-Based Drowsiness Detection
 * Runs in extension context (no CSP restrictions)
 * Communicates with background script via chrome.runtime.sendMessage
 */

import { startFaceTracking, type FaceLandmarks } from "./attention/faceLandmarks";
import { computeAverageEAR } from "./attention/ear";
import { AttentionState, AttentionSettings } from "./shared/types";
import { getAttentionSettings } from "./attentionSettings";

console.log("[Offscreen] Camera detection offscreen document loaded");

// State
let videoElement: HTMLVideoElement | null = null;
let stream: MediaStream | null = null;
let stopTracking: (() => void) | null = null;
let isRunning = false;

// Tracking state
let eyesClosedStartTime: number | null = null;
let currentAttentionState: AttentionState = "awake";
let closedFrameCount = 0;
const MIN_CLOSED_FRAMES = 15; // ~0.5s at 30fps

// Debug counters
let frameCount = 0;
let lastLogTime = Date.now();

/**
 * Determine attention state based on EAR and duration
 */
function determineAttentionState(ear: number, settings: AttentionSettings): AttentionState {
  const now = Date.now();

  if (ear < settings.thresholds.earThreshold) {
    closedFrameCount++;

    if (closedFrameCount >= MIN_CLOSED_FRAMES) {
      if (eyesClosedStartTime === null) {
        eyesClosedStartTime = now;
      }

      const closedDuration = (now - eyesClosedStartTime) / 1000;

      // Check for microsleep
      if (settings.detectors.microsleep && closedDuration >= settings.thresholds.microsleepSeconds) {
        return "microsleep";
      }

      // Check for drowsiness
      if (settings.detectors.drowsiness && closedDuration >= settings.thresholds.drowsySeconds) {
        return "drowsy";
      }
    }

    return "awake";
  } else {
    // Eyes open - reset
    closedFrameCount = 0;
    eyesClosedStartTime = null;
    return "awake";
  }
}

/**
 * Handle face landmarks and detect drowsiness
 */
async function handleLandmarks(landmarks: FaceLandmarks | null): Promise<void> {
  try {
    frameCount++;

    // Log every 30 frames (once per second)
    if (frameCount % 30 === 0) {
      const now = Date.now();
      const fps = (30 * 1000) / (now - lastLogTime);
      console.log(`[Offscreen] Running at ${fps.toFixed(1)} FPS - Frame ${frameCount}`);
      lastLogTime = now;
    }

    const settings = await getAttentionSettings();
    if (!settings.enabled) {
      return;
    }

    if (!landmarks) {
      // No face detected
      closedFrameCount++;

      if (closedFrameCount === MIN_CLOSED_FRAMES) {
        console.log("[Offscreen] ⚠️ No face detected for 0.5s");
      }

      if (closedFrameCount >= MIN_CLOSED_FRAMES) {
        if (eyesClosedStartTime === null) {
          eyesClosedStartTime = Date.now();
        }

        const closedDuration = (Date.now() - eyesClosedStartTime) / 1000;

        if (closedDuration >= settings.thresholds.microsleepSeconds) {
          if (currentAttentionState !== "microsleep") {
            currentAttentionState = "microsleep";
            console.log(`[Offscreen] 🚨 MICROSLEEP! Duration: ${closedDuration.toFixed(1)}s`);
            triggerDrowsinessAlert("microsleep", 0.99, closedDuration);
          }
        } else if (closedDuration >= settings.thresholds.drowsySeconds) {
          if (currentAttentionState !== "drowsy") {
            currentAttentionState = "drowsy";
            console.log(`[Offscreen] ⚠️ DROWSY! Duration: ${closedDuration.toFixed(1)}s`);
            triggerDrowsinessAlert("drowsy", 0.94, closedDuration);
          }
        }
      }
      return;
    }

    // Calculate EAR
    const ear = computeAverageEAR(landmarks.leftEyeEAR, landmarks.rightEyeEAR);

    if (frameCount % 30 === 0) {
      console.log(`[Offscreen] EAR: ${ear.toFixed(3)} | Threshold: ${settings.thresholds.earThreshold} | State: ${currentAttentionState}`);
    }

    // Determine attention state
    const newState = determineAttentionState(ear, settings);

    // Trigger alert on state change
    if (newState !== currentAttentionState && (newState === "drowsy" || newState === "microsleep")) {
      const eyesClosedDuration = eyesClosedStartTime
        ? (Date.now() - eyesClosedStartTime) / 1000
        : 0;

      console.log(`[Offscreen] 🚨 STATE CHANGE: ${currentAttentionState} -> ${newState}`);
      triggerDrowsinessAlert(newState, 1.0 - (ear / settings.thresholds.earThreshold), eyesClosedDuration);
    }

    currentAttentionState = newState;

    // Send periodic updates
    sendAttentionUpdate(currentAttentionState, ear);
  } catch (error) {
    console.error("[Offscreen] Error handling landmarks:", error);
  }
}

/**
 * Trigger drowsiness alert - send to background script
 */
function triggerDrowsinessAlert(state: AttentionState, confidence: number, duration: number): void {
  chrome.runtime.sendMessage({
    type: "DROWSINESS_DETECTED",
    payload: {
      state,
      confidence,
      metrics: {
        eyesClosedDuration: duration,
      }
    }
  });

  console.log(`[Offscreen] Sent ${state.toUpperCase()} alert to background`);
}

/**
 * Send periodic attention updates
 */
function sendAttentionUpdate(state: AttentionState, ear: number): void {
  chrome.runtime.sendMessage({
    type: "ATTENTION_UPDATE",
    payload: {
      state,
      confidence: 0.85,
      metrics: {
        earValue: ear,
        eyesClosedDuration: eyesClosedStartTime ? (Date.now() - eyesClosedStartTime) / 1000 : 0,
      },
      timestamp: Date.now()
    }
  });
}

/**
 * Start camera stream
 */
async function startCamera(): Promise<void> {
  try {
    console.log("[Offscreen] Requesting camera access...");

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
      }
    });

    // Create hidden video element
    videoElement = document.createElement("video");
    videoElement.style.display = "none";
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.srcObject = stream;
    document.body.appendChild(videoElement);

    await videoElement.play();

    console.log("[Offscreen] ✓ Camera started");
  } catch (error) {
    console.error("[Offscreen] Failed to start camera:", error);
    throw error;
  }
}

/**
 * Stop camera stream
 */
function stopCamera(): void {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  if (videoElement) {
    videoElement.remove();
    videoElement = null;
  }

  console.log("[Offscreen] Camera stopped");
}

/**
 * Start detection
 */
async function startDetection(): Promise<void> {
  if (isRunning) {
    console.log("[Offscreen] Already running");
    return;
  }

  try {
    console.log("[Offscreen] ========== STARTING CAMERA DETECTION ==========");

    await startCamera();

    if (!videoElement) {
      throw new Error("Video element not created");
    }

    console.log("[Offscreen] Starting MediaPipe face tracking...");
    stopTracking = startFaceTracking(videoElement, handleLandmarks, 30);

    isRunning = true;
    console.log("[Offscreen] ========== ✅ CAMERA DETECTION RUNNING ==========");

    // Notify background that we're ready
    chrome.runtime.sendMessage({ type: "CAMERA_DETECTION_READY" });
  } catch (error) {
    console.error("[Offscreen] ========== ❌ FAILED TO START ==========");
    console.error("[Offscreen] Error:", error);
    throw error;
  }
}

/**
 * Stop detection
 */
function stopDetection(): void {
  if (!isRunning) return;

  if (stopTracking) {
    stopTracking();
    stopTracking = null;
  }

  stopCamera();
  isRunning = false;

  // Reset state
  eyesClosedStartTime = null;
  currentAttentionState = "awake";
  closedFrameCount = 0;
  frameCount = 0;

  console.log("[Offscreen] Detection stopped");
}

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_CAMERA_DETECTION") {
    console.log("[Offscreen] Received START command");
    startDetection()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === "STOP_CAMERA_DETECTION") {
    console.log("[Offscreen] Received STOP command");
    stopDetection();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "GET_CAMERA_STATUS") {
    sendResponse({ isRunning, frameCount });
    return true;
  }
});

console.log("[Offscreen] Ready to receive commands");
