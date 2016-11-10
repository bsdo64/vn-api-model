const ModelClass = require('../../Util/Helper/Class');
const co = require('co');
const _ = require('lodash');

const Trendbox = require('../Trendbox');

function mergeByProp(array1, array2, prop) {
  let arr3 = [];
  for(let i in array1){
    let shared = false;
    for (let j in array2)
      if (array2[j][prop] === array1[i][prop]) {
        shared = true;
        break;
      }
    if(!shared) arr3.push(array1[i]);
  }
  return arr3.concat(array2);
}

class Forum extends ModelClass {

  createForum(forumObj, user) {
    return co.call(this, function* ModalHandler() {
      const forum = yield this.Db
        .tc_forums
        .query()
        .insert(forumObj);

      yield this.Db
        .tc_forum_managers
        .query()
        .insert({
          forum_id: forum.id,
          user_id: user.id
        });

      yield [
        Trendbox.decrementPointT(user, 100)(),
        Trendbox.incrementExp(user, 30)(),
        this.followForum({forumId: forum.id}, user)
      ];

      return forum;
    });
  }

  patchForum(forumObj) {
    return this.Db
      .tc_forums
      .query()
      .patchAndFetchById(forumObj.id, forumObj.body);
  }

  getHotList (options) {
    `SELECT 
        tc_posts.forum_id,
        MAX(tc_posts.created_at) as new_created_at
      FROM 
        public.tc_posts
      GROUP BY
        tc_posts.forum_id
      ORDER BY
        new_created_at DESC;`;

    return this.Db
      .tc_posts
      .query()
      .select(this.knex.raw('MAX(created_at) as new_created_at'), 'forum_id')
      .where({deleted: false})
      .groupBy('forum_id')
      .orderBy('new_created_at', 'desc')
      .then(forumIds => {
        options.whereIn = {
          type: 'id',
          data: forumIds.map(v => {
            return v.forum_id;
          })
        };

        options.rank = {
          type: 'id',
          data: forumIds
        };

        return this.getList(options);
      });
  }

  getList(options) {
    const initQuery = this.Db.tc_forums.query();

    options.order.direction = options.order.direction || 'DESC';
    options.limit = options.limit || 50;
    options.page = options.page || 1;

    if (options.order) {
      initQuery
        .orderBy(options.order.column, options.order.direction)
        .orderBy('id', 'desc');
    }

    if (options.whereIn) {
      initQuery.whereIn(options.whereIn.type, options.whereIn.data);
    }

    if (options.page) {
      initQuery.page(options.page - 1, options.limit);
    }

    if (options.where) {
      initQuery.where(options.where);
    }

    if (options.eager) {
      initQuery.eager(options.eager);
    }

    return initQuery
      .then(hotForums => {
        if (options.rank) {
          hotForums.results = hotForums.results
            .map(forum => {
              forum.rank = _.findIndex(options.rank.data, {forum_id: forum.id});
              return forum;
            })
            .sort(function (a, b) {
              if (a.rank > b.rank) {
                return 1;
              }
              if (a.rank < b.rank) {
                return -1;
              }
              // a must be equal to b
              return 0;
            });
        }

        return hotForums;
      });
  }

  getForumList(forumProperty, type = 'id') {
    return this.Db
      .tc_forums
      .query()
      .eager('[prefixes, creator.profile]')
      .where(type, 'ilike', `%${forumProperty}%`);
  }

  getForumInfo(forumProperty, type = 'id') {
    return this.Db
      .tc_forums
      .query()
      .eager('[prefixes, creator.profile, announces.author, managers, bans]')
      .where({[type]: forumProperty})
      .first()
      .then((forum) => {

        if (!forum) {
          throw Error('Forum not exist!');
        }

        return this.Db
          .tc_forum_prefixes
          .query()
          .select('tc_forum_prefixes.*', this.knex.raw('CAST(COUNT(tc_posts.id) as integer)'))
          .join('tc_posts', 'tc_forum_prefixes.id', 'tc_posts.prefix_id')
          .where('tc_forum_prefixes.forum_id', '=', forum.id)
          .where('tc_posts.deleted', '=', false)
          .groupBy('tc_forum_prefixes.id')
          .then(function (countPrefix) {

            forum.prefixes = mergeByProp(forum.prefixes, countPrefix, 'id');

            return forum;

          });
      })

      .catch(function (err) {
        throw new Error(err);
      });
  }

  getForumPostList({forumId, page = 0, forumSearch, forumPrefix, order='new'}) {
    const query = this.Db
      .tc_posts
      .query()
      .where('forum_id', '=', forumId)
      .andWhere('deleted', false);

    if (forumSearch) {
      query.where('title', 'ilike', '%' + forumSearch + '%');
    }

    if (forumPrefix) {
      query.where('prefix_id', forumPrefix);
    }

    if (!order) {
      query
        .orderBy('created_at', 'DESC')
        .orderBy('id', 'desc');
    }

    switch (order) {
      case 'new':
        query
          .orderBy('created_at', 'DESC')
          .orderBy('id', 'desc');
        break;
      case 'hot':
        query
          .orderBy('like_count', 'DESC')
          .orderBy('created_at', 'DESC')
          .orderBy('id', 'desc');
        break;
      case 'm_view':
        query
          .orderBy('view_count', 'DESC')
          .orderBy('created_at', 'DESC')
          .orderBy('id', 'desc');
        break;
      case 'm_comment':
        query
          .orderBy('comment_count', 'DESC')
          .orderBy('created_at', 'DESC')
          .orderBy('id', 'desc');
        break;
      default:
        query
          .orderBy('like_count', 'DESC')
          .orderBy('created_at', 'DESC')
          .orderBy('id', 'desc');
        break;
    }

    return query
      .eager('[prefix, author.[icon,profile], forum]')
      .page(page, 10)
      .catch(function (err) {

        throw new Error(err);
      });
  }

  getPrefix(forumId) {
    return this.Db
      .tc_forum_prefixes
      .query()
      .where('forum_id', '=', forumId)
      .catch(function (err) {

        throw new Error(err);
      });
  }

  addPrefix(prefixObj) {
    return this.Db
      .tc_forum_prefixes
      .query()
      .insert(prefixObj);
  }

  updatePrefix(prefixObj) {
    return this.Db
      .tc_forum_prefixes
      .query()
      .patchAndFetchById(prefixObj.id, prefixObj);
  }

  deletePrefix(prefixObj) {
    return this.Db
      .tc_posts
      .query()
      .patch({prefix_id: null})
      .where('prefix_id', '=', prefixObj.id)
      .then(() => {

        return this.Db
          .tc_forum_prefixes
          .query()
          .delete()
          .where('id', '=', prefixObj.id);
      });
  }

  followForum(followObj, user) {
    return this.Db
      .tc_user_follow_forums
      .query()
      .where({user_id: user.id, forum_id: followObj.forumId})
      .first()
      .then(followed => {
        if (!followed) {
          return user
            .$relatedQuery('follow_forums')
            .relate(followObj.forumId)
            .then(forumId => {

              return this.Db
                .tc_forums
                .query()
                .increment('follow_count', 1)
                .where({id: forumId})
                .then(() => {
                  if (forumId) {
                    return {forum_id: forumId, user_id: user.id};
                  } else {
                    return null;
                  }
                });
            });
        } else {
          return null;
        }
      });
  }

  unFollowForum(followObj, user) {
    return this.Db
      .tc_user_follow_forums
      .query()
      .where(followObj)
      .first()
      .then(followed => {
        if (followed) {
          return user
            .$relatedQuery('follow_forums')
            .unrelate()
            .where('id', followObj.forum_id)
            .then(() => {

              return this.Db
                .tc_forums
                .query()
                .decrement('follow_count', 1)
                .where({id: followObj.forum_id})
                .then(() => {
                  return followObj;
                });
            });
        } else {
          return null;
        }
      });
  }

  addManager(obj) {
    return this.Db
      .tc_forum_managers
      .query()
      .insert(obj)
      .then(manager => {
        return this.Db
          .tc_users
          .query()
          .where({id: manager.user_id})
          .first()
          .then(user => {
            return {
              manager,
              user: user
            };
          });
      });
  }

  deleteManager(obj) {
    return this.Db
      .tc_forum_managers
      .query()
      .delete()
      .where(obj);
  }

  deleteAnnounce(obj) {
    return this.Db
      .tc_forum_announce_posts
      .query()
      .delete()
      .where(obj);
  }

  addBanUser(obj) {
    return this.Db
      .tc_forum_ban_users
      .query()
      .insert(obj)
      .then(bannedUser => {
        return this.Db
          .tc_users
          .query()
          .where({id: bannedUser.user_id})
          .first()
          .then(user => {
            return {
              bannedUser,
              user: user
            };
          });
      });
  }
  deleteBanUser(obj) {
    return this.Db
      .tc_forum_ban_users
      .query()
      .delete()
      .where(obj);
  }

  validateCreate(obj) {
    return this.Db
      .tc_forums
      .query()
      .where({title: obj.title});
  }
}

module.exports = new Forum();