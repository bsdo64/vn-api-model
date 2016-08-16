'use strict';
const Db = require('trendclear-database').Models;

class Collection {
  getUserCollections(user) {
    return user
      .$relatedQuery('collections')
      .eager('[forums]')
  }
  getCollectionById(collectionId, user) {
    return user
      .$relatedQuery('collections')
      .where('id', collectionId)
      .eager('[forums]')
  }
  createCollection(collectionObj) {
    return Db
      .tc_collections
      .query()
      .insert(collectionObj)
  }
  updateCollection(collectionId, collectionObj) {
    return Db
      .tc_collections
      .query()
      .patchAndFetchById(collectionId, collectionObj)
  }
  deleteCollection(collectionId, user) {
    return user
      .$relatedQuery('collections')
      .delete()
      .where('id', collectionId)
  }

  getForums(collectionId) {
    return Db
      .tc_collection_forums
      .query()
      .where('collection_id', collectionId)
      .then(collectionForumIds => {
        return Db
          .tc_forums
          .query()
          .whereIn('id', collectionForumIds)
      })
  }

  addForum(collectionId, forumId) {
    return Db
      .tc_collections
      .query()
      .where('id', collectionId)
      .first()
      .then(collection => {
        return collection
          .$relatedQuery('forums')
          .relate(forumId)
      })
      .then(forumId => {
        return Db
          .tc_forums
          .query()
          .where('id', forumId)
          .first()
      })
  }
  removeForum(collectionId, forumId) {

  }
}

module.exports = new Collection();