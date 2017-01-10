var express = require('express');
var router = express.Router();
var ctrlMain = require('../controllers/main');
var ctrlResourceGuru = require('../controllers/resourceGuru');

/* GET home page. */
router.get('/', ctrlMain.index);

/* ResourceGuru Actions */
router.get('/rg', ctrlResourceGuru.index);
router.get('/rgGenerateReport', ctrlResourceGuru.getResourceSkills);
router.get('/auth', ctrlResourceGuru.auth);
router.get('/callback', ctrlResourceGuru.callback);
router.get('/testemail', ctrlResourceGuru.testEmail);
router.get('/rgEmailReport', ctrlResourceGuru.rgEmailReport);
module.exports = router;
