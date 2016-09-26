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

  getCollectionPosts(props) {
    const {collectionId, page, user} = props;

    return Db
      .tc_collection_forums
      .query()
      .where('collection_id', collectionId)
      .then(collectionForums => {
        props.forumIds = collectionForums.map(value => value.forum_id);

        return Post.bestPostList(props)
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
            .then(forum => {
              return forum
                .$query()
                .increment('subs_count', 1)
                .then(affected => {
                  if (affected) {
                    return forum;
                  } else {
                    return null;
                  }
                })
            })
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
      .then(result => {
        return Db
          .tc_forums
          .query()
          .decrement('subs_count', 1)
          .where({id: forumId})
          .then(() => {
            return result;
          })
      })
  }
}

module.exports = new Collection();