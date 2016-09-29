/**
 * Created by dobyeongsu on 2016. 5. 24..
 */
'use strict';
const Db = require('trendclear-database').Models;
const knex = require('trendclear-database').knex;
const Promise = require('bluebird');
const connectionType = require('trendclear-database').connectionConfig;
const _ = require('lodash');

class Search {
  listForumByQuery (query, page = 0, order, user) {
    const limit = 10;
    const array = query.split(' ');
    const q = Db
      .tc_forums
      .query();

    for (let index in array) {
      q
        .orWhere('title', 'like', '%' + array[index] + '%')
        .orWhere('sub_header', 'like', '%' + array[index] + '%')
        .orWhere('description', 'like', '%' + array[index] + '%')

    }

    return q
      .eager('[creator]')
      .orderBy('follow_count', 'desc')
      .orderBy('subs_count', 'desc')
      .page(page, limit)
  }

  listByQuery (query, page = 0, order, user) {
    const limit = 10;
    const array = query.split(' ');

    let hotQuery;
    if (connectionType.client === 'mysql') {
      hotQuery = 'ROUND(LOG(GREATEST(like_count, 1)) + (UNIX_TIMESTAMP(tc_posts.created_at) - UNIX_TIMESTAMP())/45000, 7) as hot';
    } else if (connectionType.client === 'postgresql') {
      hotQuery = 'LOG(GREATEST(like_count, 1)) + extract(EPOCH FROM age(tc_posts.created_at, now()))/45000 as hot';
    }

    let q = Db
      .tc_posts
      .query()
      .select('*', knex.raw(hotQuery))
      .where('deleted', false)
      .andWhere('title', 'like', '%' + query + '%');

    switch (order) {
      case 'new':
        q
          .orderBy('created_at', 'DESC')
          .orderBy('id', 'desc');
        break;
      case 'hot':
        q
          .orderBy('hot', 'DESC')
          .orderBy('created_at', 'DESC')
          .orderBy('id', 'desc');
        break;
      case 'm_view':
        q
          .orderBy('view_count', 'DESC')
          .orderBy('created_at', 'DESC')
          .orderBy('id', 'desc');
        break;
      case 'm_comment':
        q
          .orderBy('comment_count', 'DESC')
          .orderBy('created_at', 'DESC')
          .orderBy('id', 'desc');
        break;
      default:
        q
          .orderBy('hot', 'DESC')
          .orderBy('created_at', 'DESC')
          .orderBy('id', 'desc');
        break;
    }

    for (let index in array) {
      q = q
        .orWhere('content', 'like', '%' + array[index] + '%')
        .andWhere('deleted', false)
    }

    return q
      .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum, tags]')
      .orderBy('created_at', 'DESC')
      .andWhere('deleted', false)
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

  findForumByQuery(query, page = 0) {
    const limit = 10;

    return Db
      .tc_forums
      .query()
      .where('title', 'like', query + '%')
      .orWhere('description', 'like', '%' + query + '%')
      .page(page, limit)
      .orderBy('title')
  }

  findUsersByNick(searchObj, user, page = 0) {
    const limit = 10;
    const type = searchObj.type;

    switch (type) {
      case 'manager':
        return Promise
          .join(
            Db
              .tc_forum_managers
              .query()
              .where({
                forum_id: searchObj.forumId
              }),
            Db
              .tc_forum_ban_users
              .query()
              .where({
                forum_id: searchObj.forumId
              }),
            (managerList, banList) => {
              const banUserIds = banList.map(item => item.user_id);
              const forumManagerIds = managerList.map(item => item.user_id);
              const array = [].concat(banUserIds, forumManagerIds, user.id);

              return Db
                .tc_users
                .query()
                .select('id', 'nick')
                .where('nick', 'like', searchObj.nick + '%')
                .whereNotIn('id', array)
                .page(page, limit)
                .orderBy('nick');
            }
          );

      case 'banList':

        return Promise
          .join(
            Db
              .tc_forum_managers
              .query()
              .where({
                forum_id: searchObj.forumId
              }),
            Db
              .tc_forum_ban_users
              .query()
              .where({
                forum_id: searchObj.forumId
              }),
            (managerList, banList) => {
              const banUserIds = banList.map(item => item.user_id);
              const forumManagerIds = managerList.map(item => item.user_id);
              const array = [].concat(banUserIds, forumManagerIds, user.id);

              return Db
                .tc_users
                .query()
                .where('nick', 'like', searchObj.nick + '%')
                .whereNotIn('id', array)
                .page(page, limit)
                .orderBy('nick');
            }
          );

      default:
        return Db
          .tc_users
          .query()
          .where('nick', 'like', searchObj.nick + '%')
          .page(page, limit)
          .orderBy('nick')
    }
  }
}

module.exports = new Search();