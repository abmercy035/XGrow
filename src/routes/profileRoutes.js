const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');

router.get('/', profileController.getProfile);
router.patch('/', profileController.updateProfile);
router.get('/leaderboard', profileController.getLeaderboard);
router.post('/analyze', profileController.analyzeProfile);
router.get('/follower-history', profileController.getFollowerHistory);

module.exports = router;
