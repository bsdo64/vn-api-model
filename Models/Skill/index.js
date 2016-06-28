/**
 * Created by dobyeongsu on 2016. 5. 24..
 */
'use strict';
const Db = require('trendclear-database').Models;
const nodemailer = require('nodemailer');
const redisClient = require('../../Util/RedisClient');
const bcrypt = require('bcrypt');
const shortId = require('shortid');
const jsonwebtoken = require('jsonwebtoken');
const jwtConf = require("../../config/jwt.js");
const Promise = require('bluebird');
const _ = require('lodash');

class Skill {
  static nextLevelUpFomula(N) {
    return 1.2 * Math.pow(N, 3) - 15 * Math.pow(N, 2) + 100 * N - 140;
  }

  setUsingTime(user, type) {
    return () =>
      Db
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
        .then(skills => 
          console.log(skills)
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