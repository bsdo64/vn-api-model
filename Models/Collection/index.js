'use strict';
const Db = require('trendclear-database').Models;

class Collection {
  getUserCollections(user) {
    return user
      .$relatedQuery('collections')
      .eager('forum')
  }
  createCollecion(collectionObj) {
    return Db
      .tc_collections
      .query()
      .insert(collectionObj)
  }
  updateCollection(collectionObj) {
    return Db
      .tc_collections
      .query()
      .insert(collectionObj)
  }
  deleteCollection(collectionObj) {
    return Db
      .tc_collections
      .query()
      .insert(collectionObj)
  }

  addForum() {

  }
  removeForum() {

  }
}

module.exports = new Collection();