'use strict';
const Db = require('trendclear-database').Models;

function mergeByProp(array1, array2, prop) {
  let arr3 = [];
  for(let i in array1){
    let shared = false;
    for (let j in array2)
      if (array2[j][prop] === array1[i][prop]) {
        shared = true;
        break;
      }
    if(!shared) arr3.push(array1[i])
  }
  return arr3.concat(array2);
}

class Forum {
  getForumList(forumProperty, type = 'id') {
    return Db
      .tc_forums
      .query()
      .eager('prefixes')
      .where(type, 'like', `%${forumProperty}%`)
      .then(function (forums) {
        return forums;
      })
  }

  getForumInfo(forumProperty, type = 'id') {
    return Db
      .tc_forums
      .query()
      .eager('prefixes')
      .where({[type]: forumProperty})
      .first()
      .then(function (forum) {
        const knex = Db.tc_forum_prefixes.knex();
        return Db
          .tc_forum_prefixes
          .query()
          .select('tc_forum_prefixes.*', knex.raw('CAST(COUNT(tc_posts.id) as integer)'))
          .join('tc_posts', 'tc_forum_prefixes.id', 'tc_posts.prefix_id')
          .where('tc_forum_prefixes.forum_id', '=', forum.id)
          .groupBy('tc_forum_prefixes.id')
          .then(function (countPrefix) {

            forum.prefixes = mergeByProp(forum.prefixes, countPrefix, 'id');

            return forum;

          })
      })
  }
  
  getForumPostList(forumId, page = 0, forumSearch, forumPrefix) {
    const query = Db
      .tc_posts
      .query()
      .where('forum_id', '=', forumId);
      
    if (forumSearch) {
      query.where('title', 'like', '%' + forumSearch + '%');
    }

    if (forumPrefix) {
      query.where('prefix_id', forumPrefix);
    }

    return query
      .eager('[prefix, author.[icon,profile], forum]')
      .orderBy('created_at', 'DESC')
      .page(page, 10)

  }
  
  getPrefix(forumId) {
    return Db
      .tc_forum_prefixes
      .query()
      .where('forum_id', '=', forumId)
  }
}

module.exports = new Forum();