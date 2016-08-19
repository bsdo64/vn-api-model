/**
 * Created by dobyeongsu on 2016. 5. 24..
 */
'use strict';
const Db = require('trendclear-database').Models;
const _ = require('lodash');

class Search {
  listByQuery (query, page = 0, user) {
    const limit = 10;

    const array = query.split(' ');

    let q = Db
      .tc_posts
      .query()
      .where('title', 'like', '%' + query + '%');

    for (let index in array) {
      q = q.orWhere('content', 'like', '%' + array[index] + '%')
    }

    return q
      .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum, tags]')
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
}

module.exports = new Search();