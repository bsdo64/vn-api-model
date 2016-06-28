'use strict';
const Db = require('trendclear-database').Models;
const nodemailer = require('nodemailer');
const redisClient = require('../../Util/RedisClient');
const bcrypt = require('bcrypt');
const shortId = require('shortid');
const jsonwebtoken = require('jsonwebtoken');
const jwtConf = require("../../config/jwt.js");
const Promise = require('bluebird');

class Club {
  getGnbMenus() {
    return Db
      .tc_clubs
      .query()
      .eager('[category_groups.categories.forums]')
      .then(function (clubs) {
        return clubs
      })
  }

  getClubMenusByCategoryId(categoryId) {
    const knex = Db.tc_club_categories.knex();
    return Db
      .tc_club_categories
      .query()
      .select(
        knex.raw(`"tc_club_categories"."id" as "category_id"`),
        knex.raw(`"tc_club_category_groups"."id" as "category_group_id"`),
        knex.raw(`"tc_clubs"."id" as "club_id"`)
      )
      .join('tc_club_category_groups', 'tc_club_categories.club_category_group_id', '=', 'tc_club_category_groups.id')
      .join('tc_clubs', 'tc_club_category_groups.club_id', '=', 'tc_clubs.id')
      .where('tc_club_categories.id', categoryId)
      .first()
      .then(function (clubs) {
        
        return Db
          .tc_clubs
          .query()
          .eager('[category_groups.categories.forums]')
          .filterEager('category_groups', builder => builder.where('id', '=', clubs.category_group_id))
          .where({id: clubs.club_id})
          .first()
      })
  }
}

module.exports = new Club();