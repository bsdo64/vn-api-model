'use strict';
const Db = require('trendclear-database').Models;
const Post = require('../Post');

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
      .then(collectionForums => {
        const collectionForumIds = collectionForums.map(value => value.forum_id);
        return Db
          .tc_forums
          .query()
          .whereIn('id', collectionForumIds)
      })
  }

  getCollectionPosts(collectionId, page, user) {
    return Db
      .tc_collection_forums
      .query()
      .where('collection_id', collectionId)
      .then(collectionForums => {
        const collectionForumIds = collectionForums.map(value => value.forum_id);

        return Post.bestPostList(page, user, collectionForumIds)
      })
  }

  addForum(collectionId, forumId) {
    return Db
      .tc_collection_forums
      .query()
      .where({
        forum_id: forumId,
        collection_id: collectionId
      })
      .first()
      .then(collection => {
        if (collection) {
          return null
        } else {
          return Db
            .tc_collection_forums
            .query()
            .insert({
              forum_id: forumId,
              collection_id: collectionId
            })
        }
      })
      .then(collectionForum => {
        if (collectionForum) {
          return Db
            .tc_forums
            .query()
            .where('id', collectionForum.forum_id)
            .first()
        } else {
          return null
        }
      })
  }
  removeForum(collectionId, forumId) {
    return Db
      .tc_collection_forums
      .query()
      .delete()
      .where({
        forum_id: forumId,
        collection_id: collectionId
      })
  }
}

module.exports = new Collection();