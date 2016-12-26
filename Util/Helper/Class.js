/**
 * Created by dobyeongsu on 2016. 11. 2..
 */
const Db = require('trendclear-database').Models;
const knex = require('trendclear-database').knex;
const Objection = require('trendclear-database').Objection;

class ModelClass {
  constructor(tableName) {
    this.Db = Db;
    this.knex = knex;
    this.Objection = Objection;
    this.tableName = tableName;

    if (this.tableName) {

      console.log(this.tableName);
      this.Q = this.Db[this.tableName].query();
    }
  }

  findOne() {

  }

  findAll() {
    return this.Q;
  }

  find() {

  }
}

module.exports = ModelClass;