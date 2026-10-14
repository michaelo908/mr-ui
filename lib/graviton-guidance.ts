import type { CadenceMode } from "./cadence";

export const GRAVITON_GUIDANCE: Record<string, { description: string; recommendedCadence: CadenceMode | null }> = {
  "What will the decision-maker conclude?": { description: "Best for checking whether a proposal makes a convincing case for approval.", recommendedCadence: "sustained-preserve" },
  "Where does the case lose confidence?": { description: "Best for finding gaps, unclear claims and missing evidence that weaken a proposal.", recommendedCadence: "sustained-preserve" },
  "Full Analysis": {
    "description": "Best for a broad review of how your message lands with readers.",
    "recommendedCadence": "dynamic"
  },
  "What does the visitor experience first?": {
    "description": "Best for checking first impressions and what a visitor notices immediately.",
    "recommendedCadence": "dynamic"
  },
  "Describe the customer journey.": {
    "description": "Best for understanding the path from arrival to a decision.",
    "recommendedCadence": "sustained"
  },
  "What conclusions will readers draw?": {
    "description": "Best for checking what readers infer from your message.",
    "recommendedCadence": "dynamic-preserve"
  },
  "Where does attention drift?": {
    "description": "Best for finding places where readers lose focus.",
    "recommendedCadence": "dynamic-preserve"
  },
  "What weakens engagement?": {
    "description": "Best for finding what makes readers disengage.",
    "recommendedCadence": "dynamic-preserve"
  },
  "What would readers remember?": {
    "description": "Best for checking which ideas stay with readers.",
    "recommendedCadence": "dynamic"
  },
  "What weakens trust?": {
    "description": "Best for finding claims or wording that make readers doubt you.",
    "recommendedCadence": "dynamic-preserve"
  },
  "What builds credibility?": {
    "description": "Best for strengthening evidence and signals of expertise.",
    "recommendedCadence": "sustained-preserve"
  },
  "What creates resistance?": {
    "description": "Best for understanding objections and defensive reactions.",
    "recommendedCadence": "dynamic-preserve"
  },
  "Why isn't this converting?": {
    "description": "Best for diagnosing why readers do not take the intended next step.",
    "recommendedCadence": "dynamic"
  },
  "What prevents action?": {
    "description": "Best for finding friction around the next step you want readers to take.",
    "recommendedCadence": "dynamic"
  },
  "What creates hesitation?": {
    "description": "Best for finding uncertainty that delays a decision.",
    "recommendedCadence": "dynamic-preserve"
  },
  "Should this be a multi-email campaign?": {
    "description": "Best for deciding whether one email contains too many stages or messages.",
    "recommendedCadence": "dynamic"
  },
  "Is this asking for too much?": {
    "description": "Best for checking whether a request matches the reader’s readiness.",
    "recommendedCadence": "dynamic-preserve"
  },
  "What is the primary message?": {
    "description": "Best for clarifying the one main idea readers should take away.",
    "recommendedCadence": "dynamic"
  },
  "Summarise the sales approach.": {
    "description": "Best for understanding how the copy tries to persuade and sell.",
    "recommendedCadence": "sustained"
  },
  "Summarise the positioning.": {
    "description": "Best for understanding the audience, promise and point of difference.",
    "recommendedCadence": "sustained"
  },
  "Summarise the key messages.": {
    "description": "Best for identifying the main ideas across a document.",
    "recommendedCadence": "sustained-preserve"
  },
  "Describe this/these images.": {
    "description": "Best for a clear description of visible image content.",
    "recommendedCadence": null
  },
  "What recurring themes are present?": {
    "description": "Best for spotting ideas repeated across an image set.",
    "recommendedCadence": null
  },
  "What emotional tone emerges?": {
    "description": "Best for understanding the mood an image set conveys.",
    "recommendedCadence": null
  },
  "What common motifs appear?": {
    "description": "Best for finding recurring visual details and symbols.",
    "recommendedCadence": null
  },
  "What narrative is implied?": {
    "description": "Best for exploring the story suggested by the images.",
    "recommendedCadence": null
  },
  "Is there a sense of progression?": {
    "description": "Best for checking whether an image sequence develops or moves forward.",
    "recommendedCadence": null
  },
  "How do these images relate to one another?": {
    "description": "Best for understanding connections and contrasts between images.",
    "recommendedCadence": null
  },
  "What is the likely intent behind this collection?": {
    "description": "Best for exploring the purpose suggested by an image collection.",
    "recommendedCadence": null
  },
  "Which images best fit the narrative and emotional context?": {
    "description": "Best for selecting images that support your story and intended feeling.",
    "recommendedCadence": null
  }
};
