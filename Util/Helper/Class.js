/**
 * Created by dobyeongsu on 2016. 11. 2..
 */
const Db = require('trendclear-database').Models;
const knex = require('trendclear-database').knex;
const Objection = require('trendclear-database').Objection;

class ModelClass {
  constructor() {
    this.Db = Db;
    this.knex = knex;
    this.Objection = Objection;
  }
}

module.exports = ModelClass;