const { TwitterApi } = require('twitter-api-v2');

// Basic client for initial auth link generation (no user context yet)
const twitterClient = new TwitterApi({
	clientId: process.env.TWITTER_CLIENT_ID,
	clientSecret: process.env.TWITTER_CLIENT_SECRET,
});

const callbackUrl = process.env.TWITTER_CALLBACK_URL;

module.exports = {
	twitterClient,
	callbackUrl
};
