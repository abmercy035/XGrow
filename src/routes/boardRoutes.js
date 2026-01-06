const express = require('express');
const router = express.Router();
const boardController = require('../controllers/boardController');
const checkFeatureAccess = require('../middleware/featureAccess');

router.get('/', boardController.getBoards);
router.post('/', checkFeatureAccess('create_board'), boardController.createBoard);
router.post('/:boardId/tweets/generate', boardController.generateTweet);

module.exports = router;
