require('dotenv').config();

const key = process.env.GEMINI_API_KEY;

if (!key) {
	console.log("Key is missing/undefined");
} else {
	console.log("Key length:", key.length);
	console.log("First 4:", key.substring(0, 4));
	console.log("Last 4:", key.substring(key.length - 4));
	console.log("Contains whitespace:", /\s/.test(key));
	console.log("Raw string representation:", JSON.stringify(key));
}
