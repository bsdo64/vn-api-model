/**
 * Created by dobyeongsu on 2016. 11. 2..
 */
const Db = require('trendclear-database').Models;
const knex = require('trendclear-database').knex;
const Objection = require('trendclear-database').Objection;

function $createEagerExpression(list) {
  return `[${list.toString()}]`;
}

class ModelClass {
  constructor(tableName) {
    this.Db = Db;
    this.knex = knex;
    this.Objection = Objection;
    this.tableName = tableName;

    if (this.tableName) {
      this.Q = this.Db[this.tableName].query();
    }
  }

  makeQuery(table, options) {
    const q = this.Db[table].query();

    options.order.direction = options.order.direction || 'DESC';
    options.limit = options.limit || 20;
    options.page = parseInt(options.page - 1);

    if (options.order) {
      q
        .orderBy(options.order.column, options.order.direction)
        .orderBy('id', 'desc');
    }

    if (options.whereIn) {
      q.whereIn(options.whereIn.type, options.whereIn.data);
    }

    if (options.page >= 0) {
      q.page(options.page, options.limit);
    }

    if (options.where) {
      q.where(options.where);
    }

    if (options.eager) {
      q.eager($createEagerExpression(options.eager));
    }

    return q;
  }

  findOne() {

  }

  findList() {
    return this.Q;
  }
}

module.exports = ModelClass;