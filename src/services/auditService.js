const { TwitterApi } = require('twitter-api-v2');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Analyze user's Twitter profile and recent tweets
exports.analyzeProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) throw new Error('User not found');
  if (!user.isPro) throw new Error('Profile analysis is a Pro feature');

  // Create Twitter client with user's access token
  const client = new TwitterApi(user.accessToken);

  try {
    // Fetch last 5 tweets
    const tweets = await client.v2.userTimeline(user.twitterId, {
      max_results: 5,
      'tweet.fields': ['public_metrics', 'created_at'],
    });

    if (!tweets.data || tweets.data.data.length === 0) {
      throw new Error('No tweets found');
    }

    const tweetData = tweets.data.data;

    // ANALYSIS 1: Tone Detection
    const allText = tweetData.map(t => t.text).join(' ');
    const tone = detectTone(allText);

    // ANALYSIS 2: Average Length
    const avgLength = Math.round(
      tweetData.reduce((sum, t) => sum + t.text.length, 0) / tweetData.length
    );

    // ANALYSIS 3: Engagement Rate
    const avgEngagement = Math.round(
      tweetData.reduce((sum, t) => {
        const metrics = t.public_metrics;
        return sum + (metrics.like_count + metrics.retweet_count + metrics.reply_count);
      }, 0) / tweetData.length
    );

    // ANALYSIS 4: Top Performing Tweet
    const topTweet = tweetData.reduce((best, current) => {
      const bestScore = best.public_metrics.like_count + best.public_metrics.retweet_count;
      const currentScore = current.public_metrics.like_count + current.public_metrics.retweet_count;
      return currentScore > bestScore ? current : best;
    });

    // ANALYSIS 5: Common Topics (basic keyword extraction)
    const topics = extractTopics(allText);

    // ANALYSIS 6: Posting Time Analysis
    const postingTimes = tweetData.map(t => new Date(t.created_at).getHours());
    const bestHour = mode(postingTimes);

    // Build audit report
    const audit = {
      analyzedAt: new Date().toISOString(),
      tweetCount: tweetData.length,
      tone,
      avgLength,
      avgEngagement,
      topTweet: {
        text: topTweet.text.substring(0, 100),
        engagement: topTweet.public_metrics.like_count + topTweet.public_metrics.retweet_count
      },
      topics,
      bestPostingHour: bestHour,
      recommendations: generateRecommendations({ tone, avgLength, avgEngagement, topics, bestHour })
    };

    // Save audit to database
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastAuditDate: new Date(),
        auditData: JSON.stringify(audit)
      }
    });

    return audit;

  } catch (err) {
    console.error('Audit error:', err);

    // Check for authentication errors
    if (err.code === 401 || err.message?.includes('401')) {
      throw new Error('Your Twitter session has expired. Please log out and log back in to refresh your authentication.');
    }

    throw new Error('Failed to analyze profile: ' + err.message);
  }
};

// Helper: Detect tone from text
function detectTone(text) {
  const lowercase = text.toLowerCase();

  if (lowercase.includes('lol') || lowercase.includes('haha') || lowercase.includes('😂'))
    return 'humorous';
  if (lowercase.match(/\b(api|code|function|algorithm|database)\b/))
    return 'technical';
  if (text.split('!').length > 3)
    return 'enthusiastic';
  if (text.match(/[A-Z][A-Z]+/))
    return 'emphatic';

  return 'casual';
}

// Helper: Extract topics (simple keyword frequency)
function extractTopics(text) {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 4); // Only words > 4 chars

  const freq = {};
  words.forEach(w => freq[w] = (freq[w] || 0) + 1);

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

// Helper: Find mode (most common value)
function mode(arr) {
  const freq = {};
  arr.forEach(v => freq[v] = (freq[v] || 0) + 1);
  return Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b);
}

// Helper: Generate recommendations
function generateRecommendations({ tone, avgLength, avgEngagement, topics, bestHour }) {
  const recs = [];

  if (avgLength < 100) {
    recs.push('Your tweets are concise. Consider adding more context to boost engagement.');
  } else if (avgLength > 200) {
    recs.push('Your tweets are detailed. Try shorter, punchier content for variety.');
  }

  if (avgEngagement < 10) {
    recs.push('Low engagement detected. Try asking questions or adding media.');
  }

  if (topics.length > 0) {
    recs.push(`Your audience resonates with: ${topics.slice(0, 3).join(', ')}. Double down on these topics.`);
  }

  recs.push(`Post around ${bestHour}:00 for optimal engagement based on your history.`);

  return recs;
}
