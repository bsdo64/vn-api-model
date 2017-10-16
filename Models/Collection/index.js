const ModelClass = require('../../Util/Helper/Class');
const co = require('co');
const Post = require('../Post');

class Collection extends ModelClass {
  getUserCollections(user) {
    return user
      .$relatedQuery('collections')
      .eager('[forums]');
  }

  getCollectionById(collectionId, user) {
    return user
      .$relatedQuery('collections')
      .where('id', collectionId)
      .eager('[forums]')
      .first();
  }

  createCollection(collectionObj) {
    return this.Db
      .tc_collections
      .query()
      .insert(collectionObj);
  }

  updateCollection(collectionId, collectionObj) {
    return this.Db
      .tc_collections
      .query()
      .patchAndFetchById(collectionId, collectionObj);
  }

  deleteCollection(collectionId, user) {
    return co.call(this, function* ModelHandler() {
      // Unrelate collection - user
      yield user
        .$relatedQuery('collections')
        .unrelate()
        .where('id', collectionId);

      // Get collection - forum Ids
      const getForumIds = yield this.Db
        .tc_collection_forums
        .query()
        .select('forum_id')
        .where('collection_id', '=', collectionId);
      const forumIds = getForumIds.map(v => v.forum_id);

      // Delete unusing collection - forum
      const deleteCollectionNumbers = yield this.Db
        .tc_collection_forums
        .query()
        .delete()
        .where('collection_id', '=', collectionId);

      // Delete the collection
      yield this.Db
        .tc_collections
        .query()
        .delete()
        .where('id', '=', collectionId);

      // down club subs counts
      yield this.Db
        .tc_collections
        .query()
        .delete()
        .where('id', '=', collectionId);

      yield this.Db.tc_forums.query().decrement('subs_count', 1).whereIn('id', forumIds);

      return deleteCollectionNumbers;
    });
  }

  getForums(collectionId) {
    return co.call(this, function* ModelHandler() {
      const collectionForums = yield this.Db.tc_collection_forums.query().where('collection_id', collectionId);
      const collectionForumIds = collectionForums.map(value => value.forum_id);

      return yield this.Db.tc_forums.query().whereIn('id', collectionForumIds);
    });
  }

  getCollectionPosts(props) {
    const { collectionId } = props;

    return co.call(this, function* ModelHandler() {
      const collectionForums = yield this.Db.tc_collection_forums.query().where('collection_id', collectionId);
      props.forumIds = collectionForums.map(value => value.forum_id);

      return yield Post.bestPostList(props);
    });
  }

  addForum(collectionId, forumId) {
    return co.call(this, function* ModelHandler() {
      let result;
      const collection = yield this.Db.tc_collection_forums.query()
        .where({
          forum_id: forumId,
          collection_id: collectionId,
        })
        .first();

      if (!collection) {
        const collectionForum = yield this.Db
          .tc_collection_forums
          .query()
          .insert({
            forum_id: forumId,
            collection_id: collectionId,
          });

        if (collectionForum) {
          const forum = yield this.Db.tc_forums.query().where('id', collectionForum.forum_id).first();
          const affected = yield forum.$query().increment('subs_count', 1);

          if (affected) {
            result = forum;
          }
        }
      }

      return result;
    });
  }

  removeForum(collectionId, forumId) {
    return co.call(this, function* ModalHandler() {
      const [result] = yield [
        this.Db
          .tc_collection_forums
          .query()
          .delete()
          .where({
            forum_id: forumId,
            collection_id: collectionId,
          }),
        this.Db
          .tc_forums
          .query()
          .decrement('subs_count', 1)
          .where({ id: forumId }),
      ];

      return result;
    });
  }

  getExploreCollection({ page = 1, limit = 10}) {
    return this.Db.tc_collections
      .query()
      .page(page - 1, limit)
      .where('isPrivate', '=', false)
      .eager('[forums, creator]');
  }
}

module.exports = new Collection();
