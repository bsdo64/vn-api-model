const ModelClass = require('../../Util/Helper/Class');

const connectionType = require('trendclear-database').connectionConfig;
const _ = require('lodash');
const shortId = require('shortid');
const moment = require('../../Util/moment');
const co = require('co');

const Trendbox = require('../Trendbox');
const Skill = require('../Skill');

class Post extends ModelClass {
  constructor() {
    super();
    this.defaultOptions = {
      onlyOne: false,
      where: null,
      eager: null,
      orderBy: null,
    };
  }

  $createEagerExpression(list) {
    return `[${list.toString()}]`;
  }

  $MergeQueryOptions(options) {
    return _.assign({}, this.defaultOptions, options);
  }

  findOne(options) {
    const Q = this.Db.tc_posts.query();
    const queryOptions = this.$MergeQueryOptions(options);

    if (queryOptions.where) {
      Q.where(queryOptions.where);
    }

    if (queryOptions.eager) {
      Q.eager(this.$createEagerExpression(queryOptions.eager));
    }

    if (queryOptions.orderBy) {
      Q.orderBy(queryOptions.orderBy.column, queryOptions.orderBy.type);
    }

    if (queryOptions.onlyOne) {
      Q.first();
    }

    return Q;
  }

  findOneByVenalinkUid(linkId, options, user) {
    const Q = this.Db.tc_user_has_venalinks.query();

    if (linkId) {
      Q.where({ venalink_uid: linkId }).eager('[venalink]').first();
    }

    return co.call(this, function* ModelHandler() {
      let result;
      const userVenalink = yield Q;
      if (userVenalink) {
        options.where = { id: userVenalink.venalink.post_id };

        result = yield this.findOne(options, user);
      }

      return result;
    });
  }

  submitPost(postObj, user, query) {
    return co.call(this, function* ModalHandler() {
      const forum = yield this.Db.tc_forums.query().where('id', query.forumId).first();
      const post = yield this.Db.tc_posts.query()
        .insert({
          title: postObj.title,
          content: postObj.content,
          author_id: user.id,
          created_at: new Date(),
          forum_id: forum.id,
          prefix_id: postObj.prefixId,
          width: postObj.width,
          height: postObj.height,
          link_id: shortId.generate() + moment(new Date()).format('x'),
          has_img: postObj.representingImage ? postObj.representingImage.name : null,
        });

      if (postObj.postImages && postObj.postImages.length > 0) {
        const images = postObj.postImages.map(image => ({
          name: image.name,
          url: image.url,
          width: image.width,
          height: image.height,
          post_id: post.id,
        }));

        yield post.$relatedQuery('images').insert(images);
      }

      if (postObj.isAnnounce) {
        const announces = yield this.Db
          .tc_forum_announce_posts
          .query()
          .where('forum_id', '=', forum.id);

        if (announces.length < 5) {
          yield this.Db
            .tc_forum_announce_posts
            .query()
            .insert({
              forum_id: forum.id,
              post_id: post.id,
            });
        }
      }

      const trade = yield this.Db
        .tc_trades
        .query()
        .insert({
          action: 'write_post',
          sender_type: 'venacle',
          sender_id: null,
          target_type: 'post',
          target_id: post.id,
          receiver_type: 'user',
          receiver_id: user.id,
          amount_r: 0,
          amount_t: 10,
          created_at: new Date()
        });

      const beforeAccount = yield this.Db
        .tc_user_point_accounts
        .query()
        .where({
          user_id: user.id
        })
        .orderBy('created_at', 'DESC')
        .first();

      const newAccount = yield this.Db
        .tc_user_point_accounts
        .query()
        .insert({
          type: 'deposit',
          point_type: 'TP',
          total_r: beforeAccount.total_r + trade.amount_r,
          total_t: beforeAccount.total_t + trade.amount_t,
          trade_id: trade.id,
          user_id: user.id,
          created_at: new Date()
        });

      yield [
        Skill.setUsingTime(user, 'write_post')(),
        Trendbox.resetPoint(user, newAccount)(),
        Trendbox.incrementExp(user, 5)(),
        forum.$query().increment('post_count', 1),
      ];

      return yield post.$query().eager('forum');
    });
  }

  updatePost(postObj) {
    return co.call(this, function* ModelHandler() {
      const post = yield this.Db
        .tc_posts
        .query()
        .patchAndFetchById(postObj.postId, { title: postObj.title, content: postObj.content });

      if (postObj.isAnnounce) {
        const announces = yield this.Db
          .tc_forum_announce_posts
          .query()
          .where('forum_id', '=', post.forum_id);

        if (announces.length < 5) {
          yield this.Db
            .tc_forum_announce_posts
            .query()
            .insert({
              forum_id: post.forum_id,
              post_id: post.id,
            });
        }
      }

      return post.$query().eager('forum');
    });
  }

  findOneById({ postId, commentPage = 0, comment_order }, user) {
    const limit = 10;
    const offset = commentPage * limit;

    return co.call(this, function* ModelHandler() {
      const post = yield this.Db
        .tc_posts
        .query()
        .eager('[likes, prefix, author.[icon.iconDef, profile, trendbox], forum, tags, venalinks.participants]')
        .filterEager('venalinks', builder => builder.where('terminate_at', '>', new Date()).first())
        .where('id', '=', postId)
        .first();

      const traverseFn = co.wrap(function* (comment) {
        if (user) {
          const likeTable = yield this.Db
            .tc_sub_comments
            .query()
            .select('tc_sub_comments.id as subCommentId', 'tc_likes.liker_id')
            .join('tc_likes', 'tc_sub_comments.id', this.knex.raw('CAST(tc_likes.type_id as int)'))
            .andWhere('tc_likes.type', 'sub_comment')
            .andWhere('tc_likes.liker_id', user.id);

          _.map(comment.subComments, (value) => {
            value.liked = !!_.find(likeTable, { subCommentId: value.id });
          });
        }
      }.bind(this));

      const query = post.$relatedQuery('comments');

      if (comment_order === 'hot') {
        query.orderBy('like_count', 'desc');
      }

      const [total, results] = yield [
        query.resultSize(),
        query
          .offset(offset)
          .limit(limit)
          .eager('[subComments.author.[icon.iconDef, profile], author.[icon.iconDef, profile]]')
          .traverse(this.Db.tc_comments, traverseFn)
          .orderBy('created_at', 'desc')
          .orderBy('id', 'desc'),
      ];

      if (user) {
        const [
          postLikeTable,
          commentLikeTable,
        ] = yield [
          this.Db
            .tc_posts
            .query()
            .select('tc_posts.id as postId', 'tc_likes.liker_id')
            .join('tc_likes', 'tc_posts.id', this.knex.raw('CAST(tc_likes.type_id as int)'))
            .andWhere('tc_likes.type', 'post')
            .andWhere('tc_likes.liker_id', user.id),
          this.Db
            .tc_comments
            .query()
            .select('tc_comments.id as commentId', 'tc_likes.liker_id')
            .join('tc_likes', 'tc_comments.id', this.knex.raw('CAST(tc_likes.type_id as int)'))
            .andWhere('tc_likes.type', 'comment')
            .andWhere('tc_likes.liker_id', user.id),
          ];

        post.liked = !!_.find(postLikeTable, { postId: post.id });
        _.map(results, (value) => {
          value.liked = !!_.find(commentLikeTable, { commentId: value.id });
        });
      }

      post.comments = results;
      post.comment_count = parseInt(total, 10);
      return post;
    });
  }

  likePostList(page = 0, user) {
    return co.call(this, function* ModelHandler() {
      const likeResult = yield this.Db
        .tc_likes
        .query()
        .where('tc_likes.type', '=', 'post')
        .andWhere('tc_likes.liker_id', user.id)
        .page(page, 10);

      const likePostsIds = _.map(likeResult.results, like => like.type_id);
      const result = {
        total: likeResult.total,
        results: [],
      };
      const posts = yield this.Db
        .tc_posts
        .query()
        .whereIn('id', likePostsIds)
        .andWhere('deleted', false)
        .orderBy('created_at', 'DESC')
        .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum, tags, venalinks.participants]')
        .filterEager('venalinks', builder => builder.where('terminate_at', '>', new Date()).first());

      if (user) {
        const likeTable = yield this.Db
          .tc_posts
          .query()
          .select('tc_posts.id as postId', 'tc_likes.liker_id')
          .join('tc_likes', 'tc_posts.id', this.knex.raw('CAST(tc_likes.type_id as int)'))
          .andWhere('tc_likes.type', 'post')
          .andWhere('tc_likes.liker_id', user.id)
          .andWhere('tc_posts.deleted', false);

        _.map(posts, (value) => {
          value.liked = !!_.find(likeTable, { postId: value.id });
        });
      }

      result.results = posts;
      return result;
    });
  }

  bestPostList({ page = 0, user, forumIds, order, listType }) {
    const now = new Date();
    let hotQuery;
    if (connectionType.client === 'mysql') {
      hotQuery = 'ROUND(LOG(GREATEST(like_count, 1)) + (UNIX_TIMESTAMP(tc_posts.created_at) - UNIX_TIMESTAMP())/45000, 7) as hot';
    } else if (connectionType.client === 'postgresql') {
      hotQuery = 'LOG(GREATEST(like_count, 1)) + extract(EPOCH FROM age(tc_posts.created_at, now()))/45000 as hot';
    }

    const query = this.Db
      .tc_posts
      .query()
      .select('*', this.knex.raw(hotQuery))
      .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum, tags, venalinks.participants]')
      .filterEager('venalinks', builder => builder.where('terminate_at', '>', now).first())
      .where('deleted', false)
      .where('created_at', '>', new Date(1900 + now.getYear(), now.getMonth() - 1))
      .page(page, 10);

    if (forumIds) {
      query.whereIn('forum_id', forumIds);
    }

    switch (order) {
      case 'new':
        query
          .orderBy('created_at', 'DESC')
          .orderBy('id', 'desc');
        break;
      case 'hot':
        query
          .orderBy('hot', 'DESC')
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
          .orderBy('hot', 'DESC')
          .orderBy('created_at', 'DESC')
          .orderBy('id', 'desc');
        break;
    }

    if (listType === 'all') {
      return co.call(this, function* ModelHandler() {
        const posts = yield query;

        if (user) {
          const likeTable = yield this.Db
            .tc_posts
            .query()
            .select('tc_posts.id as postId', 'tc_likes.liker_id')
            .join('tc_likes', 'tc_posts.id', this.knex.raw('CAST(tc_likes.type_id as int)'))
            .andWhere('tc_likes.type', 'post')
            .andWhere('tc_likes.liker_id', user.id);

          _.map(posts.results, function (value) {
            value.liked = !!_.find(likeTable, { 'postId': value.id });
          });
        }

        return posts;
      });
    }

    return co.call(this, function* ModelHandler() {
      if (user) {
        const follows = yield this.Db
          .tc_user_follow_forums
          .query()
          .where({ user_id: user.id });

        const followForumIds = follows.map(v => v.forum_id);
        const allForumIds = Array.isArray(forumIds) ? followForumIds.concat(forumIds) : followForumIds;

        const [posts, likeTable] = yield [
          query.whereIn('forum_id', allForumIds),

          this.Db
            .tc_posts
            .query()
            .select('tc_posts.id as postId', 'tc_likes.liker_id')
            .join('tc_likes', 'tc_posts.id', this.knex.raw('CAST(tc_likes.type_id as int)'))
            .andWhere('tc_likes.type', 'post')
            .andWhere('tc_likes.liker_id', user.id)
        ];
        _.map(posts.results, function (value) {
          value.liked = !!_.find(likeTable, { 'postId': value.id });
        });

        return posts;

      } else {
        `SELECT   "public"."tc_forum_categories"."forum_id"
          FROM     "tc_forum_categories"
          INNER JOIN "tc_categories"  ON "tc_forum_categories"."category_id" = "tc_categories"."id"'`;

        const forumIds = yield this.Db
          .tc_forum_categories
          .query()
          .select('tc_forum_categories.forum_id')
          .join('tc_categories', 'tc_forum_categories.category_id', 'tc_categories.id');

        const defaultForumIds = forumIds.map(v => v.forum_id);
        return query.whereIn('forum_id', defaultForumIds);
      }
    });
  }

  likePost(postObj, user) {
    return co.call(this, function* ModelHandler() {
      const post = yield this.Db.tc_posts.query().findById(postObj.postId);
      const findLike = yield this.Db.tc_likes.query()
        .where({ type: 'post', type_id: post.id, liker_id: user.id })
        .first();

      if (!findLike) {
        yield post.$relatedQuery('likes').insert({
          type: 'post',
          liker_id: user.id,
          type_id: post.id
        });
        return post.$query().increment('like_count', 1);
      }

      //TODO : 좋아요 존재할 경우
      // else if (findLike) {
      //   .update({
      //     type: 'post', liker_id: user.id
      //   })
      // }

      return post;
    });
  }

  incrementView(prop, visitor) {

    const query = this.Db
      .tc_post_views
      .query()
      .where({
        visitor_uid: visitor.uuid,
        post_id: prop.postId
      })
      .first();

    return co.call(this, function* ModelHandler() {
      const view = yield query;
      const visitAt = new Date();

      if (view) {
        return this.Db
          .tc_post_views
          .query()
          .update({ updated_at: visitAt })
          .where({ visitor_uid: visitor.uuid });
      } else {
        yield this.Db
          .tc_posts
          .query()
          .where('id', '=', prop.postId)
          .increment('view_count', 1);

        return this.Db
          .tc_post_views
          .query()
          .insert({ visitor_uid: visitor.uuid, post_id: prop.postId, view_at: visitAt, updated_at: visitAt });
      }
    });
  }

  addLatestSeen({ postId }, user) {
    let latestSeens;

    return co.call(this, function* () {
      if (user) {
        latestSeens = yield user
          .$relatedQuery('latestSeen')
          .where('post_id', postId)
          .first();

        if (latestSeens) {
          yield this.Db
            .tc_latest_seen
            .query()
            .patch({ created_at: new Date() })
            .where({ post_id: postId, user_id: user.id });
        } else {
          yield user
            .$relatedQuery('latestSeen')
            .relate({
              id: postId,
              created_at: new Date()
            });
        }
      }

      return latestSeens;
    });
  }

  myWritePostList(page = 0, user) {
    const query = this.Db
      .tc_posts
      .query()
      .where('author_id', user.id)
      .where('deleted', false)
      .page(page, 10)
      .orderBy('created_at', 'DESC')
      .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum, tags, venalinks.participants]')
      .filterEager('venalinks', builder => builder.where('terminate_at', '>', new Date()).first());

    return co.call(this, function* ModelHandler() {
      const posts = yield query;
      if (user) {
        const likeTable = yield this.Db
          .tc_posts
          .query()
          .select('tc_posts.id as postId', 'tc_likes.liker_id')
          .join('tc_likes', 'tc_posts.id', this.knex.raw('CAST(tc_likes.type_id as int)'))
          .andWhere('tc_likes.type', 'post')
          .andWhere('tc_likes.liker_id', user.id);

        _.map(posts.results, function (value) {
          value.liked = !!_.find(likeTable, { 'postId': value.id });
        });
      }

      return posts;
    });
  }

  myWriteCommentPostList(page = 0, user) {
    `SELECT tc_posts.id 
     FROM tc_posts 
     INNER JOIN tc_comments ON tc_posts.id=tc_comments.post_id 
     WHERE tc_comments.author_id=(2)
     GROUP BY tc_posts.id`;

    return co.call(this, function* ModelHendler() {
      const postIds = yield this.Db
        .tc_posts
        .query()
        .select('tc_posts.id')
        .join('tc_comments', 'tc_posts.id', 'tc_comments.post_id')
        .where('tc_comments.author_id', user.id)
        .where('tc_posts.deleted', false)
        .groupBy('tc_posts.id');

      const mappedArray = _.map(postIds, 'id');
      const posts = yield this.Db
        .tc_posts
        .query()
        .whereIn('id', mappedArray)
        .page(page, 10)
        .orderBy('created_at', 'DESC')
        .eager('[prefix, author.[icon.iconDef,profile,trendbox], forum, tags, venalinks.participants]')
        .filterEager('venalinks', builder => builder.where('terminate_at', '>', new Date()).first());

      if (user) {
        const likeTable = yield this.Db
          .tc_posts
          .query()
          .select('tc_posts.id as postId', 'tc_likes.liker_id')
          .join('tc_likes', 'tc_posts.id', this.knex.raw('CAST(tc_likes.type_id as int)'))
          .andWhere('tc_likes.type', 'post')
          .andWhere('tc_likes.liker_id', user.id);

        _.map(posts.results, function (value) {
          value.liked = !!_.find(likeTable, { 'postId': value.id });
        });
      }

      return posts;
    });
  }
}

module.exports = new Post();
