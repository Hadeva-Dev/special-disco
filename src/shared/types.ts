export type ScreenState = "on_task" | "off_task";

export type AttentionState = "awake" | "drowsy" | "microsleep" | "distracted";

export type AppCategory =
  | "code"
  | "docs"
  | "video"
  | "social"
  | "games"
  | "shopping"
  | "sports"
  | "news"
  | "other";

export type SessionContext = {
  workTask: string; // User's declared task (e.g., "working on Python project", "shopping for furniture")
  timestamp: number;
  declared: boolean;
};

// Tracking mode settings
export type TrackingSettings = {
  webTrackingEnabled: boolean; // Screen activity + AI vision detection
  cameraTrackingEnabled: boolean; // Webcam-based drowsiness detection
};

// Attention detection settings
export type AttentionSettings = {
  enabled: boolean;
  detectors: {
    drowsiness: boolean; // EAR-based eye closure
    microsleep: boolean; // Extended eye closure
    yawning: boolean; // Mouth aspect ratio
    gazeDirection: boolean; // Looking away from screen
    headPose: boolean; // Head tilt/pitch
    blinkRate: boolean; // Abnormal blinking patterns
  };
  thresholds: {
    earThreshold: number; // Default 0.22
    drowsySeconds: number; // Default 1.5
    microsleepSeconds: number; // Default 3.0
  };
};

export type ScreenSnapshot = {
  t: number;
  state: ScreenState;
  confidence: number;
  context?: {
    activeUrl?: string;
    activeTitle?: string;
    appCategory?: AppCategory;
    idleMs?: number;
    // Session context - what user is working on
    sessionContext?: SessionContext;
    // Network tracking
    backgroundDomains?: string[]; // domains loaded in background
    requestCount?: number; // total requests in time window
    suspiciousPatterns?: string[]; // AI-detected off-task patterns
    offTaskDomains?: string[]; // domains classified as off-task
    // Visual verification (when screenshot was taken)
    visualVerification?: {
      verified: boolean; // was visual verification performed?
      isOffTask: boolean;
      confidence: number;
      detectedContent: string; // what AI saw on screen
      reasoning: string;
      recommendation: "focus" | "warning" | "ok";
    };
    // Attention/drowsiness detection (from webcam)
    attentionState?: {
      state: AttentionState;
      confidence: number;
      metrics: {
        earValue?: number; // Eye aspect ratio
        eyesClosedDuration?: number; // Seconds
        blinkRate?: number; // Blinks per minute
        gazeOffScreen?: boolean;
        headTiltAngle?: number;
        yawning?: boolean;
      };
      timestamp: number;
    };
  };
};
