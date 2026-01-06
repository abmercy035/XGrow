const https = require('https');

const apiKey = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

console.log('Fetching models from:', url.replace(apiKey, 'HIDDEN'));

https.get(url, (res) => {
	let data = '';
	res.on('data', (chunk) => data += chunk);
	res.on('end', () => {
		console.log('Status:', res.statusCode);
		if (res.statusCode === 200) {
			const json = JSON.parse(data);
			console.log('Available Models:');
			json.models.forEach(m => console.log('-', m.name));
		} else {
			console.log('Error:', data);
		}
	});
}).on('error', (e) => {
	console.error("Request error:", e);
});
