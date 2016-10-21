/**
 * Created by dobyeongsu on 2016. 5. 24..
 */
'use strict';
const M = require('trendclear-database').Models;
const O = require('trendclear-database').Objection;
const Promise = require('bluebird');
const shortId = require('shortid');

class VenacleStore {

  getItems() {
    return M
      .tc_items
      .query()
      .eager('[attribute]')
  }

  purchaseItem(itemObj, user) {
    return O.transaction(
      M.tc_items,
      M.tc_trades,
      M.tc_user_point_accounts,
      M.tc_user_item_orders,
      M.tc_user_inventory_items,
      M.tc_user_inventory_logs,
      M.tc_user_trendboxes,

      (tc_items, tc_trades,
       tc_user_point_accounts,
       tc_user_item_orders,
       tc_user_inventory_items,
       tc_user_inventory_logs,
       tc_user_trendboxes) => {
        return tc_items
          .query()
          .eager('[attribute]')
          .where({id: itemObj.id})
          .first()
          .then(item => {
            return tc_trades
              .query()
              .insert({
                action: 'purchaseItem',
                sender_type: 'user',
                sender_id: user.id,
                target_type: 'item',
                target_id: item.id,
                target_count: 1,
                receiver_type: 'venacle',
                receiver_id: null,
                amount_t: item.attribute.price_t,
                amount_r: 0,
                created_at: new Date()
              })
              .then(trade => {
                return tc_user_point_accounts
                  .query()
                  .where({
                    user_id: user.id
                  })
                  .orderBy('created_at', 'DESC')
                  .first()
                  .then(beforeAccount => {
                    return tc_user_point_accounts
                      .query()
                      .insert({
                        type: 'withdraw',
                        point_type: 'TP',
                        total_t: beforeAccount.total_t - trade.amount_t,
                        total_r: beforeAccount.total_r - trade.amount_r,
                        trade_id: trade.id,
                        user_id: user.id,
                        created_at: new Date()
                      })
                  })
                  .then(newAccount => {
                    return tc_user_item_orders
                      .query()
                      .insert({
                        trade_id: trade.id,
                        account_id: newAccount.id
                      })
                      .then(() => {
                        return tc_user_trendboxes
                          .query()
                          .patch({
                            T: newAccount.total_t,
                            R: newAccount.total_r,
                          })
                          .where({user_id: user.id})
                      })
                  })
                  .then(order => {
                    const findInventory = user.inventories.find(inventory => inventory.type === item.attribute.inventory_type);

                    return tc_user_inventory_items
                      .query()
                      .where({
                        item_id: item.id,
                        inventory_id: findInventory.id
                      })
                      .first()
                      .then(findInventoryItem => {
                        if (findInventoryItem) {
                          return tc_user_inventory_items
                            .query()
                            .patchAndFetchById(findInventoryItem.id, {item_count: findInventoryItem.item_count + 1})
                        } else {
                          return tc_user_inventory_items
                            .query()
                            .insert({
                              item_count: 1,
                              item_id: item.id,
                              inventory_id: findInventory.id
                            })
                        }
                      })
                      .then(insertedItem => {
                        return tc_user_inventory_logs
                          .query()
                          .insert({
                            log_uid: shortId.generate(),
                            usage: 'purchase',
                            item_count: 1,
                            total_item_count: insertedItem.item_count,
                            inventory_item_id: insertedItem.id
                          })
                      })
                  })
              })
          })
      })
    .then(() => {
      return Promise.join(
        M.tc_user_point_accounts.query().first().where({user_id: user.id, point_type: 'TP'}).orderBy('created_at', 'DESC'),
        M.tc_user_inventories.query().eager('[items.item.attribute]').where({user_id: user.id, type: 'community'}).first()
      )
    })
    .catch((err) => {
      return new Error(err);
    })
  }
}

module.exports = new VenacleStore();