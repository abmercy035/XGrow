const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getDashboardStats = async (req, res) => {
	if (!req.session.userId) return res.status(401).send('Unauthorized');

	// Check Admin
	const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
	if (!user || !user.isAdmin) return res.status(403).send('Forbidden');

	try {
		const totalUsers = await prisma.user.count();
		const proUsers = await prisma.user.count({ where: { isPro: true } });

		// Calculate Revenue (sum of all successful transactions)
		const revenueAgg = await prisma.transaction.aggregate({
			_sum: { amount: true },
			where: { status: 'SUCCESS' }
		});
		const totalRevenue = (revenueAgg._sum.amount || 0) / 100; // Convert kobo to NGN

		res.json({
			totalUsers,
			proUsers,
			totalRevenue,
			conversionRate: totalUsers > 0 ? ((proUsers / totalUsers) * 100).toFixed(1) : 0
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to fetch stats' });
	}
};

exports.getUsers = async (req, res) => {
	if (!req.session.userId) return res.status(401).send('Unauthorized');

	const admin = await prisma.user.findUnique({ where: { id: req.session.userId } });
	if (!admin || !admin.isAdmin) return res.status(403).send('Forbidden');

	try {
		const users = await prisma.user.findMany({
			take: 50,
			orderBy: { createdAt: 'desc' },
			include: {
				_count: { select: { boards: true } }
			}
		});
		res.json(users);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to fetch users' });
	}
};

exports.updateUser = async (req, res) => {
	if (!req.session.userId) return res.status(401).send('Unauthorized');

	const admin = await prisma.user.findUnique({ where: { id: req.session.userId } });
	if (!admin || !admin.isAdmin) return res.status(403).send('Forbidden');

	const { userId } = req.params;
	const { action } = req.body; // 'reset_trial', 'grant_pro', 'ban'

	try {
		if (action === 'reset_trial') {
			await prisma.user.update({ where: { id: userId }, data: { generationCount: 0 } });
		} else if (action === 'grant_pro') {
			await prisma.user.update({ where: { id: userId }, data: { isPro: true } });
		} else if (action === 'revoke_pro') {
			await prisma.user.update({ where: { id: userId }, data: { isPro: false } });
		}
		res.json({ success: true });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Action failed' });
	}
};
