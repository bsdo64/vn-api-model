/**
 * Created by dobyeongsu on 2016. 5. 24..
 */
'use strict';
const Db = require('trendclear-database').Models;
const Promise = require('bluebird');

class Trendbox {
  static nextLevelUpFomula(N) {
    return 1.2 * Math.pow(N, 3) - 15 * Math.pow(N, 2) + 100 * N - 140;
  }

  incrementPointT(user, point) {
    return () =>
      user
        .$relatedQuery('trendbox')
        .increment('T', point)
  }

  incrementPointR(user, point) {
    return () =>
      user
        .$relatedQuery('trendbox')
        .increment('R', point)
  }

  incrementExp(user, point) {
    return () =>
      user
        .$relatedQuery('trendbox')
        .increment('exp', point)
        .then(() => user.$relatedQuery('trendbox').first())
        .then((trendbox) => {
          const currentExp = trendbox.exp;
          const nextExp = trendbox.next_exp;

          if (currentExp >= nextExp) {
            return new Trendbox().incrementLevel(user);
          }
        })
  }

  incrementLevel(user, currentLevel) {
    const nextLevel = user.trendbox.level + 1;

    return user
      .$relatedQuery('trendbox')
      .increment('level', 1)
      .then(() => {
        return user
          .$relatedQuery('trendbox')
          .patchAndFetchById(user.trendbox.id, {
            prev_exp: Math.round(Trendbox.nextLevelUpFomula(nextLevel)),
            next_exp: Math.round(Trendbox.nextLevelUpFomula(nextLevel + 1)),
          })
      })
      .catch(err => {
        console.log(err);
      })
  }
  
  checkAndIncrementRep(user, post, type, point) {

    return () =>
      post
        .$relatedQuery('author')
        .first()
        .then(author => {
          return Db
            .tc_comments
            .query()
            .where('post_id', post.id)
            .whereNot({author_id: author.id})
            .then(comments => {
              if ((user.id !== author.id) &&
                  (comments.length !== 0) &&
                  (comments.length % point === 0)) {
                return Db
                  .tc_user_trendboxes
                  .query()
                  .where('user_id', author.id)
                  .first()
                  .then((trendbox) =>
                    trendbox
                      .$query()
                      .increment('reputation', 1).debug()
                  )
              }
            })
        })

  }

  checkLevel(user) {
    const prevExp = user.trendbox.exp;
    const nextExp = user.trendbox.next_exp;

    if (prevExp >= nextExp) {
      return () => new Trendbox().incrementLevel(user);
    } else {
      return () => {};
    }
  }
  

  decrementLevel() {

  }

  decrementPointT(user, point) {
    return () =>
      user
        .$relatedQuery('trendbox')
        .decrement('T', point)
  }

  decrementPointR() {

  }

  decrementRep() {

  }

  decrementExp() {

  }

  end(resolveData) {
    return Promise.resolve(resolveData);
  }

}

module.exports = new Trendbox();