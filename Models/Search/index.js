/**
 * Created by dobyeongsu on 2016. 5. 24..
 */
'use strict';
const ModelClass = require('../../Util/Helper/Class');

const co = require('co');
const connectionType = require('trendclear-database').connectionConfig;
const _ = require('lodash');

/**
 * Class representing a dot.
 * @extends ModelClass
 */
class Search extends ModelClass {
  
  /**
   * Get the dot's width.
   * @return {Promise} The dot's width, in pixels.
   */
  listForumByQuery (query, page = 0, order, user) {
    const limit = 10;
    const array = query.toLowerCase().split(' ');
    const q = this.Db
      .tc_forums
      .query();

    for (let index in array) {
      q
        .orWhere('title', 'ilike', '%' + array[index] + '%')
        .orWhere('sub_header', 'ilike', '%' + array[index] + '%')
        .orWhere('description', 'ilike', '%' + array[index] + '%');

    }

    return q
      .eager('[creator]')
      .filterEager('creator', builder => builder.select(['id', 'nick', 'uid']))
      .orderBy('follow_count', 'desc')
      .orderBy('subs_count', 'desc')
      .page(page, limit);
  }

  listByQuery (query, page = 0, order, user, visitor) {
    const limit = 10;
    const array = query.toLowerCase().split(' ');

    let hotQuery;
    if (connectionType.client === 'mysql') {
      hotQuery = 'ROUND(LOG(GREATEST(like_count, 1)) + (UNIX_TIMESTAMP(tc_posts.created_at) - UNIX_TIMESTAMP())/45000, 7) as hot';
    } else if (connectionType.client === 'postgresql') {
      hotQuery = 'LOG(GREATEST(like_count, 1)) + extract(EPOCH FROM age(tc_posts.created_at, now()))/45000 as hot';
    }

    let q = this.Db
      .tc_posts
      .query()
      .select('*', this.knex.raw(hotQuery))
      .where('deleted', false)
      .andWhere('title', 'ilike', '%' + query + '%');

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
        .orWhere('content', 'ilike', '%' + array[index] + '%')
        .andWhere('deleted', false);
    }

    return co.call(this, function* Handler() {
      const newMap = array.map((v, i) => {
        return {
          query: v,
          query_at: new Date(),
          visitor_id: visitor.id
        };
      });

      yield this.Db
        .tc_search_logs
        .query()
        .insert(newMap);

      const posts = yield q
        .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum, tags]')
        .filterEager('author', builder => builder.select(['id', 'nick', 'uid']))
        .orderBy('created_at', 'DESC')
        .andWhere('deleted', false)
        .page(page, limit);

      if (user) {
        const likeTable = yield this.Db
          .tc_posts
          .query()
          .select('tc_posts.id as postId', 'tc_likes.liker_id')
          .join('tc_likes', 'tc_posts.id', this.knex.raw('CAST(tc_likes.type_id as int)'))
          .andWhere('tc_likes.type', 'post')
          .andWhere('tc_likes.liker_id', user.id);

        _.map(posts.results, function (value) {
          value.liked = !!_.find(likeTable, {'postId': value.id});
        });
      }

      return posts;
    });
  }

  findForumByQuery(query, page = 0) {
    const limit = 10;

    return this.Db
      .tc_forums
      .query()
      .where('title', 'ilike', query + '%')
      .orWhere('description', 'ilike', '%' + query + '%')
      .page(page, limit)
      .orderBy('title');
  }

  findUsersByNick(searchObj, user, page = 0) {
    const limit = 10;
    const type = searchObj.type;

    switch (type) {
      case 'manager': {
        return co.call(this, function* Handler() {
          const [managerList, banList] = yield [
            this.Db
              .tc_forum_managers
              .query()
              .where({
                forum_id: searchObj.forumId
              }),
            this.Db
              .tc_forum_ban_users
              .query()
              .where({
                forum_id: searchObj.forumId
              })
          ];
            
          const banUserIds = banList.map(item => item.user_id);
          const forumManagerIds = managerList.map(item => item.user_id);
          const array = [].concat(banUserIds, forumManagerIds, user.id);

          return this.Db
            .tc_users
            .query()
            .select('id', 'nick')
            .where('nick', 'ilike', searchObj.nick + '%')
            .whereNotIn('id', array)
            .page(page, limit)
            .orderBy('nick');
        });
      }

      case 'banList': {
        return co.call(this, function* Handler() {
          const [managerList, banList] = yield [
            this.Db
              .tc_forum_managers
              .query()
              .where({
                forum_id: searchObj.forumId
              }),
            this.Db
              .tc_forum_ban_users
              .query()
              .where({
                forum_id: searchObj.forumId
              })
          ];
            
          const banUserIds = banList.map(item => item.user_id);
          const forumManagerIds = managerList.map(item => item.user_id);
          const array = [].concat(banUserIds, forumManagerIds, user.id);

          return this.Db
            .tc_users
            .query()
            .where('nick', 'ilike', searchObj.nick + '%')
            .whereNotIn('id', array)
            .page(page, limit)
            .orderBy('nick');
        });
      }

      default:
        return this.Db
          .tc_users
          .query()
          .where('nick', 'ilike', searchObj.nick + '%')
          .page(page, limit)
          .orderBy('nick');
    }
  }

  findQueryRank() {
    const m = require('moment');

    return co.call(this, function* () {
      const queryList = yield this.Db
        .tc_search_logs
        .query()
        .whereBetween('query_at', [m().subtract(1, 'days'), new Date()]);

      const counting = _.countBy(queryList, 'query');
      return _.take(_.orderBy(
        Object.keys(counting).map(k => { return { query: k, query_count: counting[k] }; }),
        ['query_count', 'query'],
        ['desc', 'asc']
      ), 10);
    });
  }
}

module.exports = new Search();