'use strict';
const ModelClass = require('../../Util/Helper/Class');

class Club extends ModelClass{
  getGnbMenus() {
    return this.Db
      .tc_clubs
      .query()
      .eager('[category_groups.categories.forums]')
  }

  getClubMenusByCategoryId(categoryId) {
    return this.Db
      .tc_club_categories
      .query()
      .select(
        this.knex.raw(`tc_club_categories.id as category_id`),
        this.knex.raw(`tc_club_category_groups.id as category_group_id`),
        this.knex.raw(`tc_clubs.id as club_id`)
      )
      .join('tc_club_category_groups', 'tc_club_categories.club_category_group_id', '=', 'tc_club_category_groups.id')
      .join('tc_clubs', 'tc_club_category_groups.club_id', '=', 'tc_clubs.id')
      .where('tc_club_categories.id', categoryId)
      .first()
      .then((clubs) => {
        
        return this.Db
          .tc_clubs
          .query()
          .eager('[category_groups.categories.forums]')
          .filterEager('category_groups', builder => builder.where('id', '=', clubs.category_group_id))
          .where({id: clubs.club_id})
          .first()
      })
  }
}

module.exports = new Club();