/**
 * Created by dobyeongsu on 2016. 5. 24..
 */
const ModelClass = require('../../Util/Helper/Class');
const Promise = require('bluebird');
const shortId = require('shortid');
const co = require('co');

const Trendbox = require('../Trendbox');

class Venalink extends ModelClass{

  findAll() {
    return co.call(this, function* () {
      return yield this.Db.tc_venalinks.query();
    });
  }

  findActiveVenalink(venalinkObj) {
    return co.call(this, function* () {
      return yield this.Db.tc_venalinks.query().where('terminate_at', '>', new Date());
    });
  }

  checkVenalinkItem(venalinkObj, user) {
    const findInventory = user.inventories.find(inventory => inventory.type === 'community');

    return co.call(this, function* () {
      const [venalinkItem, activeVenalink] = yield [
        this.Db
          .tc_items
          .query()
          .where({
            title: '베나링크 활성화'
          })
          .first(),
        this.Db
          .tc_venalinks
          .query()
          .where({
            post_id: venalinkObj.post_id
          })
          .andWhere('terminate_at', '<', new Date())
          .andWhere({is_activate: true})
          .first()
      ];

      if (venalinkObj.activate_item_id !== venalinkItem.id) {
        return yield Promise.resolve(false);
      }

      if (activeVenalink) {
        return yield Promise.resolve(false);
      }

      const findInventoryItem = yield this.Db.tc_user_inventory_items.query()
        .where({
          item_id: venalinkItem.id,
          inventory_id: findInventory.id
        })
        .first();


      if (findInventoryItem) {
        if (findInventoryItem.item_count > 0) {
          // 베나링크 아이템 존재
          // activate
          console.log('activate');

          const activateItem = yield this.Db
            .tc_user_inventory_items
            .query()
            .patchAndFetchById(findInventoryItem.id, {item_count: findInventoryItem.item_count - 1});

          const activatedItem = yield this.Db
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
            });

          const trade = yield this.Db
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
            });

          const beforeAccount = yield this.Db
            .tc_user_point_accounts
            .query()
            .where({
              user_id: user.id
            })
            .orderBy('created_at', 'DESC')
            .first();

          const newAccount = yield this.Db
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
            });

          yield this.Db
            .tc_user_trendboxes
            .query()
            .patch({
              T: newAccount.total_t,
              R: newAccount.total_r,
            })
            .where({user_id: user.id});

          return activatedItem;

        } else {
          // 베나링크 아이템 수량 부족
          return yield Promise.resolve(false);
        }
      } else {
        // 베나링크 아이템 없음
        return yield Promise.resolve(false);
      }

    })
      .then(activatedItem => {
        return co.call(this, function* () {
          if (activatedItem) {
            return yield [
              this.Db
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
                  terminate_at: venalinkObj.terminate_at,
                  user_id: user.id
                }),
              this.Db
                .tc_user_trendboxes
                .query()
                .where({user_id: user.id})
                .first(),
              this.Db
                .tc_user_inventories
                .query()
                .eager('[items.item.attribute]')
                .where({user_id: user.id, type: 'community'})
                .first()
            ];

          } else {
            return yield [null, null];
          }
        });
      })
      .catch(err => {
        console.log(err);
      });
  }

  activateVenalink() {
    return this.Db
      .tc_items
      .query()
      .eager('[attribute]');
  }

  activatedVenalinkList(user) {
    return this.Db
      .tc_venalinks
      .query()
      .where({user_id: user.id})
      .eager('[participants]')
      .orderBy('active_at', 'DESC');
  }

  participatedVenalinkList(user) {
    return this.Db
      .tc_user_has_venalinks
      .query()
      .where({user_id: user.id})
      .eager('[venalink.participants]')
      .orderBy('request_at', 'DESC');
  }

  checkVenalinkParticipate(venalinkObj, user) {
    const findInventory = user.inventories.find(inventory => inventory.type === 'community');

    return co.call(this, function* () {
      const [venalinkParticipateItem, venalink, isParticipated] = yield [
        this.Db
          .tc_items
          .query()
          .where({
            title: '베나링크 참여권'
          })
          .first(),
        this.Db
          .tc_venalinks
          .query()
          .where({
            id: venalinkObj.venalink_id
          })
          .andWhere('terminate_at', '>', venalinkObj.request_at)
          .first(),

        this.Db
          .tc_user_has_venalinks
          .query()
          .where({user_id: user.id, venalink_id: venalinkObj.venalink_id})
          .first()
      ];

      if (!venalinkParticipateItem) {
        return yield Promise.resolve(false);
      }

      if (!venalink) {
        return yield Promise.resolve(false);
      }

      if (isParticipated) {
        return yield Promise.resolve(false);
      }

      const findInventoryItem = yield this.Db
        .tc_user_inventory_items
        .query()
        .where({
          item_id: venalinkParticipateItem.id,
          inventory_id: findInventory.id
        })
        .first();

      if (findInventoryItem) {
        if (findInventoryItem.item_count > 0) {
          // 베나링크 아이템 존재
          // activate
          console.log('activate');

          const patchedItem = yield this.Db
            .tc_user_inventory_items
            .query()
            .patchAndFetchById(findInventoryItem.id, {item_count: findInventoryItem.item_count - 1});

          return this.Db
            .tc_user_inventory_logs
            .query()
            .insert({
              log_uid: shortId.generate(),
              usage: 'participate venalink',
              item_count: -1,
              target_type: 'venalink',
              target_id: venalinkObj.venalink_id,
              total_item_count: patchedItem.item_count,
              inventory_item_id: patchedItem.id
            });
        } else {
          // 베나링크 아이템 수량 부족
          return yield Promise.resolve(false);
        }
      } else {
        // 베나링크 아이템 없음
        return yield Promise.resolve(false);
      }

    })
      .then(logItem => {
        return co.call(this, function* () {
          if (logItem) {
            const newUserVenalink = yield this.Db
              .tc_user_has_venalinks
              .query()
              .insert({
                venalink_id: venalinkObj.venalink_id,
                venalink_uid: shortId.generate(),
                used_venalink_item_id: logItem.id,
                request_at: venalinkObj.request_at,
                user_id: user.id
              });

            return yield [
              newUserVenalink.$query().eager('[venalink.participants]'),
              this.Db
                .tc_user_inventories
                .query()
                .eager('[items.item.attribute]')
                .where({user_id: user.id, type: 'community'})
                .first()
            ];
          } else {
            return yield Promise.resolve(false);
          }
        });
      })
      .catch(err => {
        console.log(err);
      });

  }

  checkPaybackRP({ userVenalinkId }, user) {
    return co.call(this, function* () {
      const userVenalink = yield this.Db
        .tc_user_has_venalinks
        .query()
        .where({
          id: userVenalinkId
        })
        .eager('[venalink, user]')
        .first();

      if (!userVenalink.has_payback_rp) {
        let trade = yield this.Db
          .tc_trades
          .query()
          .insert({
            action: 'paybackVenalink',
            sender_type: 'venacle',
            sender_id: null,
            target_type: 'user_venalink',
            target_id: userVenalink.id,
            receiver_type: 'user',
            receiver_id: userVenalink.user_id,
            amount_r: userVenalink.paid_r,
            amount_t: 0,
            created_at: new Date()
          });

        let beforeAccount = yield this.Db
          .tc_user_point_accounts
          .query()
          .where({
            user_id: userVenalink.user_id
          })
          .orderBy('created_at', 'DESC')
          .first();

        let newAccount = yield this.Db
          .tc_user_point_accounts
          .query()
          .insert({
            type: 'deposit',
            point_type: 'RP',
            total_r: beforeAccount.total_r + trade.amount_r,
            total_t: beforeAccount.total_t + trade.amount_t,
            trade_id: trade.id,
            user_id: userVenalink.user_id,
            created_at: new Date()
          });

        let refundedVenalink = yield this.Db
          .tc_venalinks
          .query()
          .patch({
            total_refunded_r: trade.amount_r
          })
          .where({
            id: userVenalink.id
          });

        yield this.Db
          .tc_user_trendboxes
          .query()
          .patch({
            T: newAccount.total_t,
            R: newAccount.total_r,
          })
          .where({user_id: userVenalink.user_id});


        yield userVenalink.$query().patch({ has_payback_rp: true });
      }

    });
  }

  payParticipantR(venalinkUid, user) {
    return co.call(this, function* () {
      const userVenalink = yield this.Db
        .tc_user_has_venalinks
        .query()
        .where({
          venalink_uid: venalinkUid
        })
        .eager('[venalink, user]')
        .first();

      const venalink = userVenalink.venalink;
      return yield venalink
        .$query()
        .patch({
          total_pay_r: venalink.total_pay_r + venalink.pay_per_click_r,
          total_remain_r: venalink.total_remain_r - venalink.pay_per_click_r
        })
        .then(() => {
          return userVenalink.$query().patch({
            paid_r: userVenalink.paid_r + venalink.pay_per_click_r,
            count_visitor: userVenalink.count_visitor + 1,
          });
        })
        .then(() => {
          return userVenalink.user;
        });
    });
  }

  findVenalinkClickLogs(venalinkUid, post, visitor) {

    if (!post) {
      return Promise.reject(new Error('no post'));
    }

    return this.Db
      .tc_venalink_click_logs
      .query()
      .where({
        venalink_uid: venalinkUid,
        visitor_uid: visitor.device.visitor_uid,
        type: 'post',
        type_id: post.id,
      })
      .first();
  }

  createVenalinkClickLogs(venalinkUid, referer, post, visitor, user) {
    const log = {
      venalink_uid: venalinkUid,
      before_url: referer,
      target_url: `/community?forumId=${post.forum_id}&postId=${post.id}`,
      type: 'post',
      type_id: post.id,
      visitor_uid: visitor.device.visitor_uid,
      clicked_at: new Date(),
      user_id: user ? user.id : null
    };

    return this.Db
      .tc_venalink_click_logs
      .query()
      .insert(log);
  }
}

module.exports = new Venalink();