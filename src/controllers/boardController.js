const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all boards for the logged-in user
exports.getBoards = async (req, res) => {
	if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

	try {
		const boards = await prisma.board.findMany({
			where: { userId: req.session.userId },
			orderBy: { createdAt: 'desc' },
			include: {
				// Just getting count of pending tweets or something might be nice later
				_count: {
					select: { tweets: { where: { status: 'PENDING' } } }
				}
			}
		});
		res.json(boards);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to fetch boards' });
	}
};

// Create a new board
exports.createBoard = async (req, res) => {
	if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

	const { title, objective, strategy, frequency } = req.body;

	// Freemium Check
	// Fetch fresh user from DB to ensure 'isPro' is up-to-date (session might be stale)
	const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
	
	if (!user.isPro) {
		const count = await prisma.board.count({ where: { userId: user.id } });
		if (count >= 1) {
			return res.status(403).json({ error: 'Free tier limited to 1 board. Upgrade to Pro.' });
		}
	}

	try {
		const board = await prisma.board.create({
			data: {
				userId: req.session.userId,
				title,
				objective,
				strategy,
				frequency: frequency || 'daily',
			},
		});
		res.json(board);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to create board' });
	}
};

// Generate a tweet (Manual Trigger)
const contentService = require('../services/contentService');
exports.generateTweet = async (req, res) => {
	if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

	// Fetch fresh user data for limits
	const user = await prisma.user.findUnique({ where: { id: req.session.userId } });

	// Trial Limit Enforcement
	if (!user.isPro) {
		if (user.generationCount >= 3) {
			return res.status(403).json({
				error: 'LIMIT_REACHED',
				message: 'You have used your 3 free generations. Please upgrade to Pro.'
			});
		}
	}

	const { boardId } = req.params;

	// Validate ownership
	const board = await prisma.board.findUnique({ where: { id: boardId } });
	if (!board || board.userId !== req.session.userId) {
		return res.status(403).json({ error: 'Forbidden' });
	}

	try {
		const { length } = req.body; // Expects 'short' or 'long'
		const tweet = await contentService.generateDailyTweet(boardId, length);

		// Increment usage count
		await prisma.user.update({
			where: { id: req.session.userId },
			data: { generationCount: { increment: 1 } }
		});

		res.json(tweet);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Generation failed' });
	}
};
