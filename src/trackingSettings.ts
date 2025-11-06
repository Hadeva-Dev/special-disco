/**
 * Settings management for tracking modes (web + camera)
 */

import { TrackingSettings } from "./shared/types";

const SETTINGS_KEY = "trackingSettings";

const DEFAULT_SETTINGS: TrackingSettings = {
  webTrackingEnabled: true, // Screen tracking enabled by default
  cameraTrackingEnabled: false, // Camera tracking disabled by default (requires permissions)
};

/**
 * Get tracking settings
 */
export async function getTrackingSettings(): Promise<TrackingSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return result[SETTINGS_KEY] || DEFAULT_SETTINGS;
}

/**
 * Save tracking settings
 */
export async function saveTrackingSettings(
  settings: TrackingSettings
): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
