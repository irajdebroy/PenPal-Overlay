import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@latest";

let visionPipeline = null;

// Lazy-load model on first use
export async function analyzeImage(base64Image) {
    try {
        if (!visionPipeline) {
            visionPipeline = await pipeline("image-to-text", "Xenova/phi-3-vision");
        }

        const blob = await (await fetch(base64Image)).blob();
        const output = await visionPipeline(blob);
        return output[0].generated_text;
    } catch (error) {
        console.error("AI analysis error:", error);
        return "Error analyzing image.";
    }
}
