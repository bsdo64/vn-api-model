'use strict';
const Db = require('trendclear-database').Models;
const connectionType = require('trendclear-database').connectionConfig;
const Promise = require('bluebird');
const _ = require('lodash');

const Trendbox = require('../Trendbox');
const Skill = require('../Skill');

class Post {
  submitPost (post, user, query) {
    return Db
      .tc_forums
      .query()
      .where('id', query.forumId)
      .first()
      .then(forum => {
        return Db
          .tc_posts
          .query()
          .insert({
            title     : post.title,
            content   : post.content,
            author_id : user.id,
            created_at: new Date(),
            forum_id  : forum.id,
            prefix_id : post.prefixId
          })
          .then(function (post) {
            return Promise
              .resolve()
              .then(Skill.setUsingTime(user, 'write_post'))
              .then(Trendbox.incrementPointT(user, 10))
              .then(Trendbox.incrementExp(user, 5))
              .then(() => post)
          })
          .then((post) => {
            return post
              .$query()
              .eager('forum')
          })
      })
  }

  updatePost (post, user) {
    return Db
      .tc_posts
      .query()
      .patchAndFetchById(post.postId, {title: post.title, content: post.content})
      .then((post) => {
        return post
          .$query()
          .eager('forum')
      })
  }

  findOneById (postId, commentPage = 0, user) {
    const knex = Db.tc_comments.knex();
    const limit = 10;
    const offset = commentPage * limit;

    return Db
      .tc_posts
      .query()
      .eager('[likes, prefix, author.[icon.iconDef, profile, trendbox], forum, tags]')
      .where('id', '=' ,postId)
      .first()
      .then(post => {
        const query = post.$relatedQuery('comments');
        return Promise.all([
          query.resultSize(),
          query
            .offset(offset)
            .limit(limit)
            .eager('[subComments.author.[icon.iconDef, profile], author.[icon.iconDef, profile]]')
            .traverse(Db.tc_comments, function (comment, parentModel, relationName) {
              if (user) {
                Db
                  .tc_sub_comments
                  .query()
                  .select('tc_sub_comments.id as subCommentId', 'tc_likes.liker_id')
                  .join('tc_likes', 'tc_sub_comments.id', knex.raw(`CAST(tc_likes.type_id as int)`))
                  .andWhere('tc_likes.type', 'sub_comment')
                  .andWhere('tc_likes.liker_id', user.id)
                  .then(function (likeTable) {

                    _.map(comment.subComments, function (value) {
                      value.liked = !!_.find(likeTable, {subCommentId: value.id});
                    });
                  })
              }
            })
            .orderBy('created_at', 'desc')
        ])
        .spread((total, results) => {

          if (user) {
            return Db
              .tc_posts
              .query()
              .select('tc_posts.id as postId', 'tc_likes.liker_id')
              .join('tc_likes', 'tc_posts.id', knex.raw(`CAST(tc_likes.type_id as int)`))
              .andWhere('tc_likes.type', 'post')
              .andWhere('tc_likes.liker_id', user.id)
              .then(function (likeTable) {
                post.liked = !!_.find(likeTable, {postId: post.id});
                return true
              })
              .then(() =>
                Db
                  .tc_comments
                  .query()
                  .select('tc_comments.id as commentId', 'tc_likes.liker_id')
                  .join('tc_likes', 'tc_comments.id', knex.raw(`CAST(tc_likes.type_id as int)`))
                  .andWhere('tc_likes.type', 'comment')
                  .andWhere('tc_likes.liker_id', user.id)
                  .then(function (likeTable) {

                    _.map(results, function (value) {
                      value.liked = !!_.find(likeTable, {commentId: value.id});
                    });

                    post.comments = results;
                    post.comment_count = parseInt(total, 10);
                    return post;
                  })
              )
          } else {

            post.comments = results;
            post.comment_count = parseInt(total, 10);
            return post;

          }
        })

      })
  }

  likePostList (page = 0, user) {
    const knex = Db.tc_posts.knex();

    // .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum.category.category_group.club, tags]')

    const query = Db
      .tc_likes
      .query()
      .where('tc_likes.type', 'post')
      .andWhere('tc_likes.liker_id', user.id);

    return query
      .page(page, 10)
      .then(likeResult => {


        const likePostsIds = _.map(likeResult.results, like => like.type_id);
        const result = {
          total: likeResult.total,
          results: []
        };

        return Db
          .tc_posts
          .query()
          .whereIn('id', likePostsIds)
          .orderBy('created_at', 'DESC')
          .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum, tags]')
          .then((posts) => {


            if (user) {
              return Db
                .tc_posts
                .query()
                .select('tc_posts.id as postId', 'tc_likes.liker_id')
                .join('tc_likes', 'tc_posts.id', knex.raw(`CAST(tc_likes.type_id as int)`))
                .andWhere('tc_likes.type', 'post')
                .andWhere('tc_likes.liker_id', user.id)
                .then(function (likeTable) {

                  _.map(posts, function (value) {
                    value.liked = !!_.find(likeTable, {'postId': value.id});
                  });

                  result.results = posts;
                  return result
                })
            } else {
              result.results = posts;
              return posts;
            }
          })
      })
  }

  bestPostList (page = 0, user, categoryValue) {
    const knex = Db.tc_posts.knex();

    let hotQuery;
    if (connectionType.client === 'mysql') {
      hotQuery = 'ROUND(LOG(GREATEST(like_count, 1)) + (UNIX_TIMESTAMP(created_at) - UNIX_TIMESTAMP())/45000, 7) as hot';
    } else if (connectionType.client === 'postgresql') {
      hotQuery = 'LOG(GREATEST(like_count, 1)) + extract(EPOCH FROM age(created_at, now()))/45000 as hot';
    }

    const query = Db
      .tc_posts
      .query()
      .select('*', knex.raw(hotQuery))
      .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum, tags]');

    if (categoryValue) {
      query
        .select('*', 'tc_posts.title as title', 'forum.id as forumId', 'tc_posts.id as id')
        .join('tc_forums as forum', 'tc_posts.forum_id', 'forum.id')
        .whereIn('forum.id', categoryValue)
    }

    return query
      .orderBy('hot', 'DESC')
      .page(page, 10)
      .then((posts) => {

        if (user) {
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

  likePost (postObj, user) {
    return Db
      .tc_posts
      .query()
      .findById(postObj.postId)
      .then(post => {
        return Db
          .tc_likes
          .query()
          .where({ type: 'post', type_id: post.id, liker_id: user.id})
          .first()
          .then(like => {
            const query = post.$relatedQuery('likes');

            if (like && like.id) {
              // return query
              //   .update({
              //     type: 'post', liker_id: user.id
              //   })

              return false;
            } else {
              return query
                .insert({
                  type: 'post',
                  liker_id: user.id,
                  type_id: post.id
                })
            }
          })
          .then((like) => {
            const isModel = like instanceof Db.tc_likes;
            if (isModel) {
              return post
                .$query()
                .increment('like_count', 1)
                .then((increment) => {
                  return increment
                })
            } else {
              return post
            }
          })
      })
  }

  incrementView(prop, user) {
    let query = Db
      .tc_post_views
      .query()
      .where({user_id: user ? user.id : null, post_id: prop.postId, ip: prop.ip});


    return query
      .first()
      .then((view) => {
        if (view) {
          return Db
            .tc_post_views
            .query()
            .update({updated_at: new Date()})
            .where({user_id: user ? user.id : null, post_id: prop.postId, ip: prop.ip})
        } else {
          return Db
            .tc_posts
            .query()
            .where('id', '=', prop.postId)
            .increment('view_count', 1)
            .then(() => Db
              .tc_post_views
              .query()
              .insert({user_id: user ? user.id : null, post_id: prop.postId, ip: prop.ip, view_at: new Date(), updated_at: new Date()})
            )
        }
      })
  }

  myWritePostList(page = 0, user) {
    const knex = Db.tc_posts.knex();

    return Db
      .tc_posts
      .query()
      .where('author_id', user.id)
      .page(page, 10)
      .orderBy('created_at', 'DESC')
      .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum, tags]')
      .then((posts) => {

        if (user) {
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

  myWriteCommentPostList(page = 0, user) {
    const knex = Db.tc_posts.knex();

    `select tc_posts.id from tc_posts inner join tc_comments on tc_posts.id=tc_comments.post_id where tc_comments.author_id=(2) group by tc_posts.id`

    return Db
      .tc_posts
      .query()
      .select('tc_posts.id')
      .join('tc_comments', 'tc_posts.id', 'tc_comments.post_id')
      .where('tc_comments.author_id', user.id)
      .groupBy('tc_posts.id')
      .then(postsId => {

        const mappedArray = _.map(postsId, 'id');

        return Db
          .tc_posts
          .query()
          .whereIn('id', mappedArray)
          .page(page, 10)
          .orderBy('created_at', 'DESC')
          .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum, tags]')
          .then((posts) => {

            if (user) {
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
      })
  }
}

module.exports = new Post();