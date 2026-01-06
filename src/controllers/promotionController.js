const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Promote the current user (Mock Payment)
exports.promoteUser = async (req, res) => {
	if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

	const { tagline } = req.body;

	if (!tagline || tagline.length > 50) {
		return res.status(400).json({ error: 'Tagline must be between 1 and 50 characters.' });
	}

	try {
		// Mock Payment Success
		// ... payment logic would go here ...

		// Calculate expiry (24 hours from now)
		const expiresAt = new Date();
		expiresAt.setHours(expiresAt.getHours() + 24);

		// create new promotion
		const promo = await prisma.promotion.create({
			data: {
				userId: req.session.userId,
				tagline: tagline,
				expiresAt: expiresAt
			}
		});

		res.json({ success: true, message: 'Account promoted for 24 hours!', expiresAt });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to promote account' });
	}
};

// Get list of currently promoted users (randomized subset)
exports.getPromotedUsers = async (req, res) => {
	try {
		const now = new Date();

		// fetch active promotions
		const promotions = await prisma.promotion.findMany({
			where: {
				expiresAt: {
					gt: now
				}
			},
			include: {
				user: {
					select: {
						username: true,
						profileImageUrl: true,
						niche: true
					}
				}
			},
			take: 20 // Fetch top 20 valid ones
		});

		// Shuffle and pick 3
		const shuffled = promotions.sort(() => 0.5 - Math.random());
		const selected = shuffled.slice(0, 3);

		res.json({ promotions: selected });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to fetch promoted users' });
	}
};
