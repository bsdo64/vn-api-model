/**
 * Created by dobyeongsu on 2016. 5. 24..
 */
'use strict';
const M = require('trendclear-database').Models;
const O = require('trendclear-database').Objection;
const Promise = require('bluebird');
const shortId = require('shortid');

class VenacleStore {

  checkVenalinkItem(venalinkObj, user) {
    const findInventory = user.inventories.find(inventory => inventory.type === 'community');

    return Promise.join(
      M
        .tc_items
        .query()
        .where({
          title: '베나링크 활성화'
        })
        .first(),
      M
        .tc_venalinks
        .query()
        .where({
          post_id: venalinkObj.post_id
        })
        .andWhere('terminate_at', '<', new Date())
        .first(),

      (venalinkItem, venalink) => {

        console.log(venalinkObj.activate_item_id)
        console.log(venalinkItem.id)

        if (venalinkObj.activate_item_id !== venalinkItem.id) {
          return false
        }

        if (venalink) {
          return false
        }

        return M
          .tc_user_inventory_items
          .query()
          .where({
            item_id: venalinkItem.id,
            inventory_id: findInventory.id
          })
          .first()
          .then(findInventoryItem => {

            if (findInventoryItem) {
              if (findInventoryItem.item_count > 0) {
                // 베나링크 아이템 존재
                // activate
                console.log('activate');

                return M
                  .tc_user_inventory_items
                  .query()
                  .patchAndFetchById(findInventoryItem.id, {item_count: findInventoryItem.item_count - 1})
                  .then((activateItem => {
                    return M
                      .tc_user_inventory_logs
                      .query()
                      .insert({
                        log_uid: shortId.generate(),
                        usage: 'activate venalink',
                        item_count: -1,
                        target_type: 'post',
                        target_id: venalinkObj.post_id,
                        total_item_count: activateItem.item_count,
                        inventory_item_id: activateItem.id
                      })
                      .then(activatedItem => {
                        return M
                          .tc_trades
                          .query()
                          .insert({
                            action: 'activateVenalink',
                            sender_type: 'user',
                            sender_id: user.id,
                            target_type: 'inventory_log',
                            target_id: activatedItem.id,
                            receiver_type: 'venacle',
                            receiver_id: null,
                            amount_r: venalinkObj.total_amount_r,
                            amount_t: 0,
                            created_at: new Date()
                          })
                          .then(trade => {
                            return M
                              .tc_user_point_accounts
                              .query()
                              .where({
                                user_id: user.id
                              })
                              .orderBy('created_at', 'DESC')
                              .first()
                              .then(beforeAccount => {
                                return M
                                  .tc_user_point_accounts
                                  .query()
                                  .insert({
                                    type: 'withdraw',
                                    point_type: 'RP',
                                    total_r: beforeAccount.total_r - trade.amount_r,
                                    total_t: beforeAccount.total_t - trade.amount_t,
                                    trade_id: trade.id,
                                    user_id: user.id,
                                    created_at: new Date()
                                  })
                              })
                              .then(newAccount => {
                                return M
                                  .tc_user_trendboxes
                                  .query()
                                  .patch({
                                    T: newAccount.total_t,
                                    R: newAccount.total_r,
                                  })
                                  .where({user_id: user.id})
                              })
                          })
                          .then(() => {
                            return activatedItem;
                          })
                      })
                  }))
              } else {
                // 베나링크 아이템 수량 부족
                return false
              }
            } else {
              // 베나링크 아이템 없음
              return false
            }
          })
      }
    )
      .then(activatedItem => {
        if (activatedItem) {
          return M
            .tc_venalinks
            .query()
            .insert({
              is_activate: true,
              total_amount_r: venalinkObj.total_amount_r,
              pay_per_click_r: 5,
              total_pay_r: 0,
              total_remain_r: venalinkObj.total_amount_r,
              post_id: venalinkObj.post_id,
              activate_item_id: activatedItem.id,
              active_at: venalinkObj.active_at,
              terminate_at: venalinkObj.terminate_at
            })
        } else {
          return false
        }
      })
      .catch(err => {
        console.log(err);
      })
  }

  activateVenalink() {
    return M
      .tc_items
      .query()
      .eager('[attribute]')
  }
}

module.exports = new VenacleStore();