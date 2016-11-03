'use strict';
const ModelClass = require('../../Util/Helper/Class');

const Skill = require('../Skill');
const Trendbox = require('../Trendbox');

class Comment extends ModelClass {
  submitComment(comment, user) {
    return this.Db
      .tc_posts
      .query()
      .findById(comment.postId)
      .then(function (post) {
        return post
          .$relatedQuery('comments')
          .insert({
            content: comment.content,
            author_id: user.id,
            created_at: new Date()
          })
          .then(function (comment) {
            return post
              .$query()
              .increment('comment_count', 1)
              .then(Skill.setUsingTime(user, 'write_comment'))
              .then(Trendbox.incrementPointT(user, 10))
              .then(Trendbox.incrementExp(user, 5))
              .then(Trendbox.checkAndIncrementRep(user, post, 'comments', 5))
              .then(() => comment)
          })
      })
      .then(function (comment) {
        return comment
          .$query()
          .eager('author.[profile, grade]')
      })
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

  submitSubComment(subComment, user) {
    return this.Db
      .tc_comments
      .query()
      .findById(subComment.commentId)
      .then(function (comment) {
        return comment
          .$relatedQuery('subComments')
          .insert({
            content: subComment.content,
            author_id: user.id,
            created_at: new Date()
          })
          .then(function (subComment) {
            return comment
              .$query()
              .increment('sub_comment_count', 1)
              .then(Skill.setUsingTime(user, 'write_sub_comment'))
              .then(Trendbox.incrementPointT(user, 10))
              .then(Trendbox.incrementExp(user, 5))
              .then(() => subComment)
          })
      })
      .then(function (subComment) {
        return subComment
          .$query()
          .eager('author.[profile, grade]')
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