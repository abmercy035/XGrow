const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get current user profile
exports.getProfile = async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: {
        id: true,
        email: true,
        username: true,
        niche: true,
        goal: true,
        region: true,
        customTone: true,
        isPro: true,
        currentStreak: true,
        longestStreak: true,
        lastPostDate: true,
        followerCount: true,
        profileImageUrl: true,
        bio: true,
        lastAuditDate: true,
        auditData: true,
        createdAt: true
      }
    });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

// Update profile preferences
exports.updateProfile = async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

  const { niche, goal, region, customTone } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id: req.session.userId },
      data: {
        niche: niche || undefined,
        goal: goal || undefined,
        region: region || undefined,
        customTone: customTone || undefined
      }
    });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Get leaderboard (Top 10 streaks with growth metrics)
exports.getLeaderboard = async (req, res) => {
  try {
    const top = await prisma.user.findMany({
      where: {
        currentStreak: { gt: 0 }
      },
      select: {
        username: true,
        currentStreak: true,
        longestStreak: true,
        followerCount: true,
        previousFollowerCount: true
      },
      orderBy: { currentStreak: 'desc' },
      take: 10
    });

    // Calculate growth percentage for each user
    const leaderboard = top.map(user => ({
      ...user,
      growthPercentage: user.previousFollowerCount > 0
        ? Math.round(((user.followerCount - user.previousFollowerCount) / user.previousFollowerCount) * 100)
        : 0
    }));

    res.json(leaderboard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
};

// Analyze user's profile and tweets (Pro only)
exports.analyzeProfile = async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const auditService = require('../services/auditService');
    const audit = await auditService.analyzeProfile(req.session.userId);
    res.json(audit);
  } catch (err) {
    console.error(err);
    if (err.message.includes('Pro feature')) {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
};

// Get follower growth history (Pro only, last 30 days)
exports.getFollowerHistory = async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId }
    });

    if (!user.isPro) {
      return res.status(403).json({ error: 'Follower tracking is a Pro feature' });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const history = await prisma.followerHistory.findMany({
      where: {
        userId: req.session.userId,
        date: { gte: thirtyDaysAgo }
      },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        count: true
      }
    });

    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch follower history' });
  }
};
