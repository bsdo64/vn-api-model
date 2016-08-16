'use strict';
const Db = require('trendclear-database').Models;

class Collection {
  createCollecion(collectionObj) {
    return Db
      .tc_collections
      .query()
      .insert(collectionObj)
  }
}

module.exports = new Collection();