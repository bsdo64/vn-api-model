/**
 * Created by dobyeongsu on 2016. 5. 24..
 */
'use strict';
const Db = require('trendclear-database').Models;
const nodemailer = require('nodemailer');
const redisClient = require('../../Util/RedisClient');
const bcrypt = require('bcrypt');
const shortId = require('shortid');
const jsonwebtoken = require('jsonwebtoken');
const jwtConf = require("../../config/jwt.js");
const Promise = require('bluebird');
const _ = require('lodash');

class Search {
  listByQuery (query, page = 0, user) {
    const limit = 10;

    const array = query.split(' ');
    console.log(array);

    let q = Db
      .tc_posts
      .query()
      .where('title', 'like', '%' + query + '%');

    for (let index in array) {
      q = q.orWhere('content', 'like', '%' + array[index] + '%')
    }

    return q
      .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum.category.category_group.club, tags]')
      .orderBy('created_at', 'DESC')
      .page(page, limit)
      .then((posts) => {
        if (user) {
          const knex = Db.tc_posts.knex();

          return Db
            .tc_posts
            .query()
            .select('tc_posts.id as postId', 'tc_likes.liker_id')
            .join('tc_likes', 'tc_posts.id', knex.raw(`CAST(tc_likes.type_id as int)`))
            .andWhere('tc_likes.type', 'post')
            .andWhere('tc_likes.liker_id', user.id)
            .then(function (likeTable) {

              _.map(posts.results, function (value) {
                value.liked = !!_.find(likeTable, {'postId': value.id});
              });
              return posts
            })
        } else {
          return posts;
        }
      })
  }
}

module.exports = new Search();