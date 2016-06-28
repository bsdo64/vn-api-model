'use strict';
const Db = require('trendclear-database').Models;
const nodemailer = require('nodemailer');
const redisClient = require('../../Util/RedisClient');
const bcrypt = require('bcrypt');
const shortId = require('shortid');
const jsonwebtoken = require('jsonwebtoken');
const jwtConf = require("../../config/jwt.js");
const Promise = require('bluebird');

const Skill = require('../Skill');
const Trendbox = require('../Trendbox');

class Comment {
  submitComment(comment, user) {
    return Db
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

  submitSubComment(subComment, user) {
    return Db
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
    return Db
      .tc_comments
      .query()
      .findById(commentObj.commentId)
      .then(comment => {
        return Db
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
                  type: 'comment', liker_id: user.id
                })
            }
          })
          .then((like) => {
            const isModel = like instanceof Db.tc_likes;
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
    return Db
      .tc_sub_comments
      .query()
      .findById(commentObj.subCommentId)
      .then(subComment => {
        return Db
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
                  type: 'sub_comment', liker_id: user.id
                })
            }
          })
          .then((like) => {
            const isModel = like instanceof Db.tc_likes;
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