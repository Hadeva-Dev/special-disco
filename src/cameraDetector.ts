/**
 * Camera-based drowsiness detection for Chrome extension
 * Adapts existing MediaPipe code to work in content script
 */

import { startFaceTracking, type FaceLandmarks } from "./attention/faceLandmarks";
import { computeAverageEAR } from "./attention/ear";
import { AttentionState, AttentionSettings } from "./shared/types";
import { getAttentionSettings } from "./attentionSettings";
import { getTrackingSettings } from "./trackingSettings";

// State
let videoElement: HTMLVideoElement | null = null;
let stream: MediaStream | null = null;
let stopTracking: (() => void) | null = null;
let isInitialized = false;

// Tracking state
let eyesClosedStartTime: number | null = null;
let currentAttentionState: AttentionState = "awake";
let closedFrameCount = 0;
const MIN_CLOSED_FRAMES = 15; // ~0.5s at 30fps - filters out blinks

/**
 * Determine attention state based on EAR and duration
 */
function determineAttentionState(ear: number, settings: AttentionSettings): AttentionState {
  const now = Date.now();

  // Check if eyes are closed
  if (ear < settings.thresholds.earThreshold) {
    closedFrameCount++;

    // Only start counting after minimum frames to filter blinks
    if (closedFrameCount >= MIN_CLOSED_FRAMES) {
      if (eyesClosedStartTime === null) {
        eyesClosedStartTime = now;
      }

      const closedDuration = (now - eyesClosedStartTime) / 1000;

      // Check for microsleep (extended closure)
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
    // Eyes are open - reset counters
    closedFrameCount = 0;
    eyesClosedStartTime = null;
    return "awake";
  }
}

/**
 * Start camera stream (reuse existing stream if available)
 */
async function startCamera(): Promise<void> {
  try {
    // Check if we already have an active stream from another tab
    if (stream && stream.active) {
      console.log("[CameraDetector] Reusing existing camera stream");

      // Recreate video element if needed
      if (!videoElement || !document.body.contains(videoElement)) {
        videoElement = document.createElement("video");
        videoElement.style.display = "none";
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.srcObject = stream;
        document.body.appendChild(videoElement);
        await videoElement.play();
      }

      return;
    }

    console.log("[CameraDetector] Requesting new camera stream...");
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

    console.log("[CameraDetector] Camera started successfully");
  } catch (error) {
    console.error("[CameraDetector] Failed to start camera:", error);
    throw error;
  }
}

// Debug counters
let frameCount = 0;
let lastLogTime = Date.now();

/**
 * Handle face landmarks and detect drowsiness
 */
async function handleLandmarks(landmarks: FaceLandmarks | null): Promise<void> {
  try {
    frameCount++;

    // Log every 30 frames (once per second at 30fps)
    if (frameCount % 30 === 0) {
      const now = Date.now();
      const fps = (30 * 1000) / (now - lastLogTime);
      console.log(`[CameraDetector] Running at ${fps.toFixed(1)} FPS - Frame ${frameCount}`);
      lastLogTime = now;
    }

    const settings = await getAttentionSettings();
    if (!settings.enabled) {
      console.log("[CameraDetector] Attention detection is disabled in settings");
      return;
    }

    if (!landmarks) {
      // No face detected - treat as eyes closed
      closedFrameCount++;

      if (closedFrameCount === MIN_CLOSED_FRAMES) {
        console.log("[CameraDetector] ⚠️ No face detected for 0.5s - starting to count as eyes closed");
      }

      if (closedFrameCount >= MIN_CLOSED_FRAMES) {
        if (eyesClosedStartTime === null) {
          eyesClosedStartTime = Date.now();
        }

        const closedDuration = (Date.now() - eyesClosedStartTime) / 1000;

        // Trigger alerts for extended periods without face
        if (closedDuration >= settings.thresholds.microsleepSeconds) {
          if (currentAttentionState !== "microsleep") {
            currentAttentionState = "microsleep";
            console.log(`[CameraDetector] 🚨 MICROSLEEP DETECTED! Duration: ${closedDuration.toFixed(1)}s`);
            triggerDrowsinessAlert("microsleep", 0.99, closedDuration);
          }
        } else if (closedDuration >= settings.thresholds.drowsySeconds) {
          if (currentAttentionState !== "drowsy") {
            currentAttentionState = "drowsy";
            console.log(`[CameraDetector] ⚠️ DROWSINESS DETECTED! Duration: ${closedDuration.toFixed(1)}s`);
            triggerDrowsinessAlert("drowsy", 0.94, closedDuration);
          }
        }
      }
      return;
    }

    // Calculate EAR
    const ear = computeAverageEAR(landmarks.leftEyeEAR, landmarks.rightEyeEAR);

    // Log EAR every 30 frames
    if (frameCount % 30 === 0) {
      console.log(`[CameraDetector] EAR: ${ear.toFixed(3)} | Threshold: ${settings.thresholds.earThreshold} | State: ${currentAttentionState}`);
    }

    // Determine attention state
    const newState = determineAttentionState(ear, settings);

    // Check if state changed and should trigger alert
    if (newState !== currentAttentionState && (newState === "drowsy" || newState === "microsleep")) {
      const eyesClosedDuration = eyesClosedStartTime
        ? (Date.now() - eyesClosedStartTime) / 1000
        : 0;

      console.log(`[CameraDetector] 🚨 STATE CHANGE: ${currentAttentionState} -> ${newState} (${eyesClosedDuration.toFixed(1)}s)`);
      triggerDrowsinessAlert(newState, 1.0 - (ear / settings.thresholds.earThreshold), eyesClosedDuration);
    }

    currentAttentionState = newState;

    // Send periodic updates
    sendAttentionUpdate(currentAttentionState, ear);
  } catch (error) {
    console.error("[CameraDetector] Error handling landmarks:", error);
  }
}

/**
 * Trigger drowsiness alert
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

  console.log(`[CameraDetector] ${state.toUpperCase()} detected - Duration: ${duration.toFixed(1)}s`);
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

  console.log("[CameraDetector] Camera stopped");
}

/**
 * Initialize camera detection system
 */
export async function initCameraDetection(): Promise<void> {
  if (isInitialized) {
    console.log("[CameraDetector] Already initialized");
    return;
  }

  try {
    console.log("[CameraDetector] ========== STARTING INITIALIZATION ==========");

    // Check if camera tracking is enabled
    const trackingSettings = await getTrackingSettings();
    console.log("[CameraDetector] Tracking settings:", trackingSettings);

    if (!trackingSettings.cameraTrackingEnabled) {
      console.log("[CameraDetector] ❌ Camera tracking is DISABLED - enable it in the extension popup");
      return;
    }

    console.log("[CameraDetector] ✓ Camera tracking is enabled");
    console.log("[CameraDetector] Starting camera...");

    await startCamera();

    if (!videoElement) {
      throw new Error("Video element not created");
    }

    console.log("[CameraDetector] ✓ Camera started successfully");
    console.log("[CameraDetector] Starting MediaPipe face tracking at 30fps...");

    // Start face tracking using existing code
    try {
      stopTracking = startFaceTracking(videoElement, handleLandmarks, 30);

      // Wait a moment to see if MediaPipe initialization succeeds
      await new Promise(resolve => setTimeout(resolve, 2000));

      isInitialized = true;
      console.log("[CameraDetector] ========== ✅ INITIALIZED SUCCESSFULLY ==========");
      console.log("[CameraDetector] Face detection is now running. Close your eyes for 2+ seconds to test.");
    } catch (mediapipeError) {
      console.error("[CameraDetector] MediaPipe failed to load (likely CSP restriction on this page)");
      console.log("[CameraDetector] ⚠️ Camera detection disabled on this page due to security restrictions");
      console.log("[CameraDetector] Try visiting: google.com, github.com, or other non-strict-CSP sites");

      // Stop camera since we can't use it without MediaPipe
      stopCamera();
      throw new Error("MediaPipe blocked by CSP - camera detection unavailable on this page");
    }
  } catch (error) {
    console.error("[CameraDetector] ========== ❌ INITIALIZATION FAILED ==========");
    console.error("[CameraDetector] Error:", error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("CSP") || errorMessage.includes("MediaPipe")) {
      console.log("[CameraDetector] 💡 TIP: Camera detection works on most sites, but some (like Gmail) block it");
    }

    throw error;
  }
}

/**
 * Shutdown camera detection system
 */
export function shutdownCameraDetection(): void {
  if (stopTracking) {
    stopTracking();
    stopTracking = null;
  }

  stopCamera();
  isInitialized = false;

  // Reset state
  eyesClosedStartTime = null;
  currentAttentionState = "awake";
  closedFrameCount = 0;

  console.log("[CameraDetector] Shutdown complete");
}

/**
 * Listen for settings changes
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TRACKING_SETTINGS_UPDATED") {
    const settings = message.payload;

    if (settings.cameraTrackingEnabled && !isInitialized) {
      initCameraDetection();
    } else if (!settings.cameraTrackingEnabled && isInitialized) {
      shutdownCameraDetection();
    }
  }
});
