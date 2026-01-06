const cron = require('node-cron');
const prisma = require('@prisma/client').PrismaClient;
const db = new prisma();
const contentService = require('../services/contentService');

// Run every day at midnight (or user's trusted time)
// For now, we run it globally at 00:00 UTC
cron.schedule('0 0 * * *', async () => {
	console.log('Running daily content generation...');

	// Find all boards that need content (Frequency: daily)
	const boards = await db.board.findMany({
		where: { frequency: 'daily' }, // simplistic
		include: { user: true }
	});

	for (const board of boards) {
		try {
			// Check if already has PENDING tweet for today? 
			// Simplified: Just generate.
			await contentService.generateDailyTweet(board.id);
		} catch (e) {
			console.error(`Failed gen for board ${board.id}`, e);
		}
	}
});

// Run every hour to check if tweets were posted
cron.schedule('0 * * * *', async () => {
	console.log('Running verification...');
	// TODO: contentVerificationService.verifyPendingTweets();
});

module.exports = {};
