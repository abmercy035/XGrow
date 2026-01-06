require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Models with approximate limits - prioritization order
const CANDIDATE_MODELS = [
	"gemma-3-27b-it"     // High Quota (~1500/day) - Primary
];

// Global cooldown tracking
const modelCooldowns = new Map(); // Map<string, { until: number, reason: string }>

// --- Resilience Logic --- 

function isModelOnCooldown(modelName) {
	const cooldown = modelCooldowns.get(modelName);
	if (!cooldown) return false;

	if (Date.now() > cooldown.until) {
		modelCooldowns.delete(modelName);
		console.log(`[AI Service] Cooldown expired for ${modelName}`);
		return false;
	}
	return true;
}

function setModelCooldown(modelName, errorMessage) {
	let cooldownSeconds = 60; // Default 1 min

	const retryMatch = errorMessage.match(/retry in (\d+)/i);
	if (retryMatch) {
		cooldownSeconds = parseInt(retryMatch[1], 10);
	}

	if (errorMessage.includes('PerDay') || errorMessage.includes('daily') || errorMessage.includes('quota')) {
		cooldownSeconds = 3600; // 1 hour for hard limits
	}

	modelCooldowns.set(modelName, {
		until: Date.now() + (cooldownSeconds * 1000),
		reason: errorMessage.substring(0, 100)
	});

	console.warn(`[AI Service] ${modelName} on cooldown for ${cooldownSeconds}s due to: ${errorMessage.substring(0, 50)}...`);
}

function getAvailableModels() {
	return CANDIDATE_MODELS.filter(m => !isModelOnCooldown(m));
}

// --- Helper Functions ---

async function getUserStyle(user) {
	if (user.auditData) {
		const audit = JSON.parse(user.auditData);
		return `Tone: ${audit.tone}. Topics: ${audit.topics.join(', ')}. Avg Length: ${audit.avgLength} chars.`;
	}
	return "casual, lowercase, short sentences, minimal emojis. authentic individual, not corporate.";
}

// --- Main Generation Logic ---

async function generateWithFallback(prompt, apiKey) {
	if (!apiKey) throw new Error("API Key missing");

	const availableModels = getAvailableModels();
	if (availableModels.length === 0) {
		throw new Error("All AI models are currently rate-limited or on cooldown.");
	}

	const genAI = new GoogleGenerativeAI(apiKey);
	let lastError = null;

	for (const modelName of availableModels) {
		try {
			console.log(`[AI Service] Attempting generation with: ${modelName}`);
			const model = genAI.getGenerativeModel({
				model: modelName,
				generationConfig: {
					maxOutputTokens: 1000,
					temperature: 0.9, // Higher creativity to avoid repetition
				}
			});

			const result = await model.generateContent(prompt);
			const response = await result.response;
			const text = response.text().trim();

			if (!text) throw new Error("Empty response received");

            // Attempt JSON Parse
            try {
                // Find first { and last } to handle potential markdown wrappers
                const firstBrace = text.indexOf('{');
                const lastBrace = text.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    const jsonStr = text.substring(firstBrace, lastBrace + 1);
                    const json = JSON.parse(jsonStr);
                    if (json.tweet) {
                         console.log(`[AI Service] ✓ Success with ${modelName} (JSON Mode)`);
                         return json.tweet;
                    }
                }
            } catch (e) {
                console.warn("[AI Service] JSON Parse failed, falling back to text cleanup", e);
            }

			// Cleanup: Remove surrounding quotes and excessive markdown symbols
            // Relaxed cleaning to not destroy text
			const cleanText = text
				.replace(/^["']|["']$/g, '')       // Remove quotes
				.replace(/^#+\s+/gm, '')            // Remove headers
                .replace(/```json/g, '')
                .replace(/```/g, '')
				.trim();

			console.log(`[AI Service] ✓ Success with ${modelName} (Text fallback)`);
			return cleanText;

		} catch (error) {
			const msg = error.message || '';
			console.warn(`[AI Service] ✗ ${modelName} failed: ${msg}`);
			lastError = error;

			// Handle Rate Limits / Quotas
			if (msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests') || msg.includes('400')) {
				// Note: 400 usually means invalid key, but sometimes model mismatch. 
				// If key is invalid, ALL will fail, but we'll try anyway.
				setModelCooldown(modelName, msg);
			}
		}
	}

	throw lastError || new Error("All models failed generation");
}

// --- Public Methods ---

exports.generateDailyTweet = async (boardId, lengthPreference = 'short') => {
	const board = await prisma.board.findUnique({
		where: { id: boardId },
		include: { user: true }
	});

	if (!board) throw new Error('Board not found');

	const user = board.user;

	// 1. Context Gathering
	const detectedStyle = await getUserStyle(user);
	const customInstructions = user.user?.customTone ? `User's specific tone instructions: "${user.customTone}"` : '';
	const boardInstructions = board.customPrompt ? `Specific board instructions: "${board.customPrompt}"` : '';

	// Fetch previous recent tweets to prevent repetition
	const previousTweets = await prisma.tweet.findMany({
		where: { boardId: board.id },
		orderBy: { createdAt: 'desc' },
		take: 5,
		select: { content: true }
	});
	const historyContext = previousTweets.map(t => `- "${t.content}"`).join('\n');

	// Dynamic Persona Injection
	const nicheContext = user.niche || "General";

	// Add randomness to prevent identical outputs
	const angles = [
		"A controversial opinion",
		"A common mistake beginners make",
		"A sudden realization",
		"A prediction for the future",
		"A counter-intuitive truth",
		"A personal frustration",
		"A celebration of a small win"
	];
	const randomAngle = angles[Math.floor(Math.random() * angles.length)];

	// Length Logic
	let lengthInstruction = "Strictly under 280 characters. Be punchy.";
	let internalLengthMonologue = "Keep it punchy. Short sentences. One insight only.";

	if (lengthPreference === 'long') {
		// Allow long form for anyone who selects it (they need Twitter Premium to post anyway)
		lengthInstruction = `
CRITICAL: Write a LONG-FORM post.
- MINIMUM 500 characters, MAXIMUM 900 characters.
- Use multiple paragraphs with line breaks.
- Go DEEP into the topic with examples or personal anecdotes.
- Include a list or bullet points if relevant.
- DO NOT write a short tweet. If your output is under 400 characters, you have FAILED.`;
		internalLengthMonologue = "This is a LONG post. Ignore all brevity rules. Expand the idea. Add context, examples, and nuance. Write at least 3-4 paragraphs.";
	}

	// Style Instructions
	const prompt = `
  <Identity>
    You are the "Brain Double" for a practitioner in the ${nicheContext} space, for a specific individual on X (Twitter).
    Your goal is to write a high-engagement, authentic tweet that sounds 100% human and 0% AI.
  </Identity>
 
 <Style_Fingerprint>
- User's unique vibe: ${detectedStyle}
- Specific Tone tweaks: ${customInstructions}
- Writing Rules: No hashtags. ${lengthPreference === 'long' ? 'THIS IS A LONG-FORM POST. DO NOT BE BRIEF.' : 'Keep it short.'}
</Style_Fingerprint>

<Strategic_Intent>
- Niche: ${nicheContext}
- Strategy: ${board.strategy}
- Target Topic: ${board.objective}
- Board-Specific Rules: ${boardInstructions}
- **CREATIVE ANGLE FOR THIS TWEET: ${randomAngle}** (Strictly focus on this angle)
</Strategic_Intent>

<History_Constraints>
The user has recently posted the following tweets. **DO NOT WRITE ANYTHING SIMILAR TO THESE:**
${historyContext}
(Ensure your new tweet is distinct in concept and phrasing from the list above)
</History_Constraints>

<Negative_Constraints>
Do NOT use: delve, unlock, leverage, game-changer, tapestry, realm, vital, pivotal, "the future is," "why it matters," "in today's world."
${lengthPreference === 'long' ? '' : 'Avoid: Perfectly balanced sentences. (Human thoughts are messy; AI thoughts are symmetrical).'}
</Negative_Constraints>

<Internal_Monologue>
Step 1: Identify one specific, non-obvious frustration or "truth" about ${board.objective} within the ${nicheContext} niche.
Step 2: Strip away all the adjectives. 
Step 3: Draft the insight as if you just sent it in a private Slack channel to a colleague.
Step 4: ${internalLengthMonologue}
</Internal_Monologue>

<Task>
Based on the monologue above, write ONE single tweet.
**Length Constraint: ${lengthInstruction}**
${lengthPreference === 'long' ? 'REMINDER: This MUST be over 500 characters. Count them.' : 'Start with a "Pattern Interrupt"—a line that immediately challenges a common belief or states a raw fact.'}
</Task>

<Output_Format>
Return a single JSON object with the key "tweet".
Example: { "tweet": "Your tweet here" }
DO NOT output conversational text.
</Output_Format>
  `;

	let tweetContent = "";
	let rationale = "AI-generated based on your profile style & board goal.";
	const start = Date.now();

	console.log(`[AI Debug] Generating with Angle: "${randomAngle}"`);

	try {
		tweetContent = await generateWithFallback(prompt, process.env.GEMINI_API_KEY);
		console.log(`[AI Debug] Generated Text: "${tweetContent.substring(0, 50)}..."`);
	} catch (e) {
		console.error("[AI Service] FATAL: All models exhausted.", e.message);

		// Ultimate Fallback: High Quality Mock Data
		const mocks = [
			"honestly, consistency is just showing up when you don't feel like it. most people want the prize but hate the process.",
			"stop overthinking your first step. just take it. you can't optimize a blank page.",
			"unpopular opinion: you don't need more tools, you need more focus. delete the apps.",
			"building in public is scary until you realize nobody is watching that closely. just ship it.",
			"the best networking hack? actually be good at what you do. people notice competence.",
			"it's not about being the smartest in the room. it's about being the most persistent. talent is overrated.",
			"growth is 80% showing up and 20% skill. just keep posting.",
			"your first iteration will be bad. that is the point. ship it anyway.",
			"stop waiting for permission to build the thing you want to build.",
			"engagement is just talking to people. treat twitter like a group chat, not a podium."
		];
		tweetContent = mocks[Math.floor(Math.random() * mocks.length)];

		const isAuthError = e.message.includes('400') || e.message.includes('key') || e.message.includes('valid');
		rationale = isAuthError
			? "⚠️ mocked (Invalid API Key - Check .env)"
			: `⚠️ mocked (AI Service Overloaded - Cooldowns active)`;
	}

	// Save to DB
	const tweet = await prisma.tweet.create({
		data: {
			boardId: board.id,
			content: tweetContent,
			rationale: rationale,
			scheduledDate: new Date(),
			status: 'PENDING',
		}
	});

	return tweet;
};

// Also support specific generation route
exports.generateSpecificTweet = async (boardId, customPromptOverride) => {
	return exports.generateDailyTweet(boardId);
};
