const cron = require('node-cron');
const { TwitterApi } = require('twitter-api-v2');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Track follower count daily (runs at midnight)
cron.schedule('0 0 * * *', async () => {
	console.log('Running daily follower tracking...');

	try {
		// Get all Pro users
		const proUsers = await prisma.user.findMany({
			where: { isPro: true },
			select: { id: true, twitterId: true, accessToken: true }
		});

		for (const user of proUsers) {
			try {
				// Fetch current follower count from Twitter
				const client = new TwitterApi(user.accessToken);
				const { data } = await client.v2.user(user.twitterId, {
					'user.fields': ['public_metrics']
				});

				const followerCount = data.public_metrics?.followers_count || 0;

				// Store in history
				await prisma.followerHistory.create({
					data: {
						userId: user.id,
						count: followerCount,
						date: new Date()
					}
				});

				// Update user's current count
				await prisma.user.update({
					where: { id: user.id },
					data: {
						previousFollowerCount: user.followerCount || 0,
						followerCount: followerCount
					}
				});

				console.log(`Tracked ${followerCount} followers for user ${user.id}`);
			} catch (err) {
				console.error(`Failed to track followers for user ${user.id}:`, err.message);
			}
		}

		console.log('Daily follower tracking complete');
	} catch (err) {
		console.error('Follower tracking job error:', err);
	}
});

console.log('Daily follower tracking job scheduled');
