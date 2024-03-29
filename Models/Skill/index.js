/**
 * Created by dobyeongsu on 2016. 5. 24..
 */
'use strict';
const ModelClass = require('../../Util/Helper/Class');

class Skill extends ModelClass {
  static nextLevelUpFomula(N) {
    return 1.2 * Math.pow(N, 3) - 15 * Math.pow(N, 2) + 100 * N - 140;
  }

  setUsingTime(user, type) {
    return () =>
      this.Db
        .tc_skills
        .query()
        .where('name', type)
        .first()
        .then(skill =>
          user
            .$relatedQuery('skills')
            .where('skill_id', skill.id)
            .patch({
              using_at: new Date()
            })
        )
  }

  incrementPointR() {

  }

  incrementExp(user, point) {
    return () =>
      user
        .$relatedQuery('trendbox')
        .increment('exp', point)
  }

  incrementLevel(user, currentLevel) {
    const nextLevel = parseInt(currentLevel, 10) + 1;

    return () =>
      user
        .$relatedQuery('trendbox')
        .increment('level', 1)
        .then(() => {
          return user
            .$relatedQuery('trendbox')
            .patchAndFetchById(user.trendbox.id, {
              prev_exp: Math.round(Skill.nextLevelUpFomula(nextLevel)),
              next_exp: Math.round(Skill.nextLevelUpFomula(nextLevel + 1)),
            })
        })
  }
  
  incrementRep() {
    
  }
  

  decrementLevel() {

  }

  decrementPointT() {

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

module.exports = new Skill();