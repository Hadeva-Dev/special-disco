/**
 * AI-powered URL classification using Claude API
 */

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export type DomainClassification = {
  domain: string;
  isOffTask: boolean;
  category: string;
  confidence: number;
  reasoning: string;
};

export type VisualVerification = {
  isOffTask: boolean;
  confidence: number;
  reasoning: string;
  detectedContent: string; // What the AI saw on screen
  recommendation: "focus" | "warning" | "ok";
};

/**
 * Classifies a batch of domains using Claude AI
 */
export async function classifyDomainsWithAI(
  domains: string[],
  activeTabUrl: string
): Promise<DomainClassification[]> {
  if (domains.length === 0) {
    return [];
  }

  const prompt = `You are analyzing browser network activity for productivity tracking.

Active tab URL: ${activeTabUrl}

Background domains being accessed:
${domains.map((d, i) => `${i + 1}. ${d}`).join("\n")}

For each domain, determine:
1. Is it off-task (distracting/unproductive)?
2. What category does it belong to?
3. Confidence level (0-1)
4. Brief reasoning

Consider:
- Context matters: YouTube embeds in coding tutorials = on-task, but youtube.com main page = off-task
- CDNs, analytics, ads are neutral (not off-task)
- Social media is usually off-task
- Shopping is usually off-task
- Gaming is off-task
- Developer tools, docs, GitHub, Stack Overflow = on-task

Return ONLY a JSON array (no markdown, no extra text), one object per domain:
[
  {
    "domain": "example.com",
    "isOffTask": false,
    "category": "cdn",
    "confidence": 0.9,
    "reasoning": "Content delivery network"
  }
]`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[AI Classifier] API error:", response.status);
      return [];
    }

    const data = await response.json();
    const content = data.content[0].text;

    // Parse JSON response with validation
    let classifications: DomainClassification[];
    try {
      const parsed = JSON.parse(content);

      // Validate structure
      if (!Array.isArray(parsed)) {
        throw new Error("Expected array of classifications");
      }

      // Validate each item has required fields
      classifications = parsed.filter(item => {
        if (typeof item.domain !== 'string' || typeof item.category !== 'string') {
          console.warn("[AI Classifier] Invalid classification item:", item);
          return false;
        }
        return true;
      });
    } catch (parseError) {
      console.error("[AI Classifier] Invalid JSON response:", parseError);
      return [];
    }

    console.log("[AI Classifier] Classifications:", classifications);
    return classifications;
  } catch (error) {
    console.error("[AI Classifier] Error:", error);
    return [];
  }
}

/**
 * Analyzes patterns across domains to detect suspicious activity
 */
export function detectSuspiciousPatterns(
  classifications: DomainClassification[],
  activeTabUrl: string
): string[] {
  const patterns: string[] = [];
  const offTaskDomains = classifications.filter((c) => c.isOffTask);

  if (offTaskDomains.length === 0) {
    return patterns;
  }

  // Pattern: Multiple off-task domains while supposedly working
  if (offTaskDomains.length >= 3) {
    patterns.push(`${offTaskDomains.length} off-task domains active in background`);
  }

  // Pattern: Social media while on work site
  const socialDomains = offTaskDomains.filter(
    (c) => c.category === "social" || c.domain.includes("twitter") || c.domain.includes("facebook")
  );
  if (socialDomains.length > 0 && activeTabUrl.includes("github")) {
    patterns.push(
      `Social media (${socialDomains.map((d) => d.domain).join(", ")}) detected while on GitHub`
    );
  }

  // Pattern: Video streaming in background
  const videoDomains = offTaskDomains.filter(
    (c) => c.category === "video" || c.domain.includes("youtube") || c.domain.includes("twitch")
  );
  if (videoDomains.length > 0) {
    patterns.push(`Video streaming detected: ${videoDomains.map((d) => d.domain).join(", ")}`);
  }

  // Pattern: Shopping while working
  const shoppingDomains = offTaskDomains.filter((c) => c.category === "shopping");
  if (shoppingDomains.length > 0) {
    patterns.push(`Shopping activity detected: ${shoppingDomains.map((d) => d.domain).join(", ")}`);
  }

  return patterns;
}

/**
 * Verifies if screen content is on-task using Gemini Vision API (Flash model)
 * This is the secondary verification after network analysis flags suspicious activity
 * Uses Gemini Flash for 500x cheaper cost than Claude Vision
 */
export async function verifyScreenWithVision(
  screenshotBase64: string,
  activeTabUrl: string,
  suspiciousReason: string,
  userWorkTask?: string
): Promise<VisualVerification> {
  const workTaskContext = userWorkTask
    ? `\n- User's declared work task: "${userWorkTask}"\n- IMPORTANT: Judge content based on alignment with this specific task`
    : `\n- User has NOT declared a specific work task\n- Use default context: coding, documentation, research, writing = ON-TASK; social media, games, shopping, videos = OFF-TASK`;

  const prompt = `You are a balanced productivity monitor analyzing if a user is genuinely distracted or productively working.

Context:
- Active tab URL: ${activeTabUrl}
- Why this was flagged: ${suspiciousReason}${workTaskContext}

Analyze the screenshot fairly and objectively:

Flag as OFF-TASK only if you see CLEAR EVIDENCE of distraction:
✗ Social media browsing (scrolling feeds, looking at unrelated posts)
✗ Video entertainment (watching non-educational videos, streams)
✗ Gaming or game-related content
✗ Shopping unrelated to work
✗ News/sports consumption (unless task-related)
✗ Memes, entertainment, or clearly off-task browsing

Flag as ON-TASK if you see:
✓ Coding/programming/development work
✓ Reading technical documentation or learning materials
✓ Research, writing, or content creation
✓ Email, messaging, or professional communication
✓ Task management, planning, or organization
✓ Educational content (even YouTube tutorials)
✓ Any activity aligned with the user's declared task

BALANCED APPROACH:
- If it looks like productive work, mark it ON-TASK
- If it's clearly entertainment/distraction, mark it OFF-TASK
- When uncertain or seeing mixed signals, lean toward ON-TASK (confidence 0.5-0.7)
- Only use high confidence (0.9+) for obvious distractions

Return ONLY a JSON object (no markdown, no extra text):
{
  "isOffTask": false,
  "confidence": 0.6,
  "reasoning": "User appears to be reading technical content",
  "detectedContent": "Documentation or learning material visible",
  "recommendation": "ok"
}

Recommendation values:
- "focus": Clearly off-task with high confidence (obvious entertainment/distraction)
- "warning": Borderline case, unclear if productive
- "ok": Appears to be productive work or learning`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: screenshotBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      console.error("[AI Vision] Gemini API error:", response.status);
      const errorText = await response.text();
      console.error("[AI Vision] Error details:", errorText);
      // Don't trigger alerts on API failures
      return {
        isOffTask: false, // Changed to false to prevent false positives
        confidence: 0, // Changed to 0 so it won't trigger alerts
        reasoning: "Vision API error - not triggering alert to avoid false positives",
        detectedContent: "API error",
        recommendation: "ok", // Changed to "ok" to prevent triggering
      };
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error("[AI Vision] No content in Gemini response:", data);
      // Return API_FAILURE marker so we don't trigger false alerts
      return {
        isOffTask: false, // Changed to false to prevent false positives
        confidence: 0, // Changed to 0 so it won't trigger alerts
        reasoning: "Vision API returned empty response - likely rate limited or blocked",
        detectedContent: "API unavailable",
        recommendation: "ok", // Changed to "ok" to prevent triggering
      };
    }

    // Gemini sometimes wraps JSON in markdown code blocks, clean it up
    const cleanedContent = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    // Parse JSON response with validation
    let verification: VisualVerification;
    try {
      const parsed = JSON.parse(cleanedContent);

      // Validate required fields
      if (typeof parsed.isOffTask !== 'boolean' ||
          typeof parsed.confidence !== 'number' ||
          typeof parsed.reasoning !== 'string' ||
          typeof parsed.detectedContent !== 'string' ||
          typeof parsed.recommendation !== 'string') {
        throw new Error("Invalid vision verification structure");
      }

      // Validate recommendation value
      const validRecommendations = ['focus', 'warning', 'ok'];
      if (!validRecommendations.includes(parsed.recommendation)) {
        console.warn("[AI Vision] Invalid recommendation:", parsed.recommendation);
        parsed.recommendation = 'ok'; // Safe default
      }

      verification = parsed as VisualVerification;
    } catch (parseError) {
      console.error("[AI Vision] Invalid JSON response:", parseError);
      return {
        isOffTask: false,
        confidence: 0,
        reasoning: "Failed to parse vision API response",
        detectedContent: "Parse error",
        recommendation: "ok",
      };
    }

    console.log("[AI Vision] Gemini verification result:", verification);
    return verification;
  } catch (error) {
    console.error("[AI Vision] Error:", error);
    // Don't trigger alerts on API failures/exceptions
    return {
      isOffTask: false, // Changed to false to prevent false positives
      confidence: 0, // Changed to 0 so it won't trigger alerts
      reasoning: "Vision analysis exception - not triggering alert to avoid false positives",
      detectedContent: "API exception",
      recommendation: "ok", // Changed to "ok" to prevent triggering
    };
  }
}
