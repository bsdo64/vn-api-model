/**
 * Created by dobyeongsu on 2016. 6. 28..
 */

module.exports.Db = require('trendclear-database');

module.exports.Club = require('./Models/Club');
module.exports.Collection = require('./Models/Collection');
module.exports.Comment = require('./Models/Comment');
module.exports.Forum = require('./Models/Forum');
module.exports.Post = require('./Models/Post');
module.exports.Search = require('./Models/Search');
module.exports.Skill = require('./Models/Skill');
module.exports.Trendbox = require('./Models/Trendbox');
module.exports.User = require('./Models/User');

module.exports = require('./Models');