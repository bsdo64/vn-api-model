const ModelClass = require('../../Util/Helper/Class');
const co = require('co');
const Skill = require('../Skill');
const Trendbox = require('../Trendbox');

class Comment extends ModelClass {
  submitComment(commentObj, user) {
    return co.call(this, function* () {
      const post = yield this.Db
        .tc_posts
        .query()
        .findById(commentObj.postId);

      const comment = yield post
        .$relatedQuery('comments')
        .insert({
          content: commentObj.content,
          author_id: user.id,
          created_at: new Date()
        });

      const trade = yield this.Db
        .tc_trades
        .query()
        .insert({
          action: 'write_comment',
          sender_type: 'venacle',
          sender_id: null,
          target_type: 'comment',
          target_id: comment.id,
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
        post.$query().increment('comment_count', 1),
        Skill.setUsingTime(user, 'write_comment')(),
        Trendbox.resetPoint(user, newAccount)(),
        Trendbox.incrementExp(user, 5)(),
        Trendbox.checkAndIncrementRep(user, post, 'comments', 5)(),
      ];

      return yield comment
        .$query()
        .eager('author.[profile, trendbox, skills.skill.property]');
    });
  }

  updateComment(comment, user) {
    return this.Db
      .tc_comments
      .query()
      .patchAndFetchById(comment.id, {
        content: comment.content
      })
  }

  updateSubComment(subComment, user) {
    return this.Db
      .tc_sub_comments
      .query()
      .patchAndFetchById(subComment.id, {
        content: subComment.content
      })
  }

  submitSubComment(subCommentObj, user) {
    return co.call(this, function* () {

      const comment = yield this.Db
        .tc_comments
        .query()
        .findById(subCommentObj.commentId);

      const subComment = yield comment
        .$relatedQuery('subComments')
        .insert({
          content: subCommentObj.content,
          author_id: user.id,
          created_at: new Date()
        });

      const trade = yield this.Db
        .tc_trades
        .query()
        .insert({
          action: 'write_sub_comment',
          sender_type: 'venacle',
          sender_id: null,
          target_type: 'sub_comment',
          target_id: subComment.id,
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

      yield comment
        .$query()
        .increment('sub_comment_count', 1)
        .then(Skill.setUsingTime(user, 'write_sub_comment'))
        .then(Trendbox.resetPoint(user, newAccount))
        .then(Trendbox.incrementExp(user, 5));

      return yield subComment
        .$query()
        .eager('author.[profile, trendbox, skills.skill.property]');
    })
  }

  likeComment (commentObj, user) {
    return this.Db
      .tc_comments
      .query()
      .findById(commentObj.commentId)
      .then(comment => {

        return this.Db
          .tc_likes
          .query()
          .where({ type: 'comment', type_id: comment.id, liker_id: user.id })
          .first()
          .then(like => {
            const query = comment.$relatedQuery('likes');
            
            if (like && like.id) {
              // return query
              //   .update({
              //     type: 'comment', liker_id: user.id
              //   })

              return false;

            } else {
              return query
                .insert({
                  type: 'comment',
                  liker_id: user.id,
                  type_id: comment.id
                })
            }
          })
          .then((like) => {
            const isModel = like instanceof this.Db.tc_likes;
            if (isModel) {
              return comment
                .$query()
                .increment('like_count', 1)
                .then((likeInc) => {
                  return likeInc
                })
            } else {
              return comment
            }
          })
      })
  }

  likeSubComment (commentObj, user) {
    return this.Db
      .tc_sub_comments
      .query()
      .findById(commentObj.subCommentId)
      .then(subComment => {
        return this.Db
          .tc_likes
          .query()
          .where({ type: 'sub_comment', type_id: subComment.id, liker_id: user.id })
          .first()
          .then(like => {
            const query = subComment.$relatedQuery('likes');

            if (like && like.id) {
              // return query
              //   .update({
              //     type: 'comment', liker_id: user.id
              //   })

              return false;

            } else {
              return query
                .insert({
                  type: 'sub_comment',
                  liker_id: user.id,
                  type_id: subComment.id
                })
            }
          })
          .then((like) => {
            const isModel = like instanceof this.Db.tc_likes;
            if (isModel) {
              return subComment
                .$query()
                .increment('like_count', 1)
                .then((subCommentLike) => {
                  return subCommentLike
                })
            } else {
              return subComment
            }
          })
      })
  }

}

module.exports = new Comment();