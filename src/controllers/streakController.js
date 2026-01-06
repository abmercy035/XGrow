const { PrismaClient } = require('@prisma/client');
const { TwitterApi } = require('twitter-api-v2');
const prisma = new PrismaClient();

// Confirm that user posted and update streak
exports.confirmPost = async (req, res) => {
	if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

	try {
		const user = await prisma.user.findUnique({
			where: { id: req.session.userId }
		});

		if (!user) return res.status(404).json({ error: 'User not found' });

		// 1. Verify with Twitter API
		if (!user.accessToken) {
			return res.status(400).json({ error: 'Please log in with Twitter first to verify your streaks.' });
		}

		const client = new TwitterApi(user.accessToken);

		// Fetch last 5 original tweets (no retweets/replies)
		// If getting "Unauthorized", users might need to re-login to refresh tokens
		const timeline = await client.v2.userTimeline(user.twitterId, {
			max_results: 5,
			"tweet.fields": ["created_at"],
			exclude: ["retweets", "replies"]
		});

		const tweets = timeline.data.data || [];

		// Check if ANY tweet was posted today (UTC)
		const today = new Date();
		const startOfDay = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

		const postedToday = tweets.some(t => {
			const tweetDate = new Date(t.created_at);
			return tweetDate >= startOfDay;
		});

		if (!postedToday) {
			return res.status(400).json({
				error: 'No tweet found for today! Please post on Twitter first, then click here.'
			});
		}

		// 2. Update Streak Logic (Existing)
		const lastPostDate = user.lastPostDate ? new Date(user.lastPostDate) : null;
		if (lastPostDate) lastPostDate.setHours(0, 0, 0, 0);

		// Check if already updated locally
		// Note: Even if they posted 5 times, we only count streak once per day
		const todayLocal = new Date();
		todayLocal.setHours(0, 0, 0, 0);

		if (lastPostDate && lastPostDate.getTime() === todayLocal.getTime()) {
			return res.json({
				message: 'Streak already updated for today!',
				currentStreak: user.currentStreak,
				longestStreak: user.longestStreak
			});
		}

		let newStreak = user.currentStreak;

		// Calculate streak
		if (!lastPostDate) {
			newStreak = 1;
		} else {
			const yesterday = new Date(todayLocal);
			yesterday.setDate(yesterday.getDate() - 1);

			if (lastPostDate.getTime() === yesterday.getTime()) {
				// Posted yesterday → continue streak
				newStreak = user.currentStreak + 1;
			} else {
				// Missed days → reset streak
				newStreak = 1;
			}
		}

		// Update longest streak if needed
		const newLongestStreak = Math.max(newStreak, user.longestStreak);

		// Update user
		const updatedUser = await prisma.user.update({
			where: { id: user.id },
			data: {
				currentStreak: newStreak,
				longestStreak: newLongestStreak,
				lastPostDate: new Date()
			}
		});

		res.json({
			message: '🔥 Verified! Streak updated!',
			currentStreak: updatedUser.currentStreak,
			longestStreak: updatedUser.longestStreak,
			isNewRecord: newStreak > user.longestStreak
		});

	} catch (err) {
		console.error("Streak Verification Error:", err);
		if (err.code === 401) {
			return res.status(401).json({ error: 'Twitter session expired. Please logout and login again.' });
		}
		res.status(500).json({ error: 'Failed to verify tweet. Try again.' });
	}
};
