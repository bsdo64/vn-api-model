const ModelClass = require('../../Util/Helper/Class');
const co = require('co');
const request = require('superagent');

class Point extends ModelClass {
  constructor() {
    super('tc_payments');
  }

  getUserAccountList(options, user) {
    if (!user) {
      return Promise.reject(user);
    }

    const q = this.Db.tc_user_point_accounts.query();

    if (options.page) {
      q.page(options.page, options.limit);
    }

    return q
      .eager('[trade]')
      .where(options.where)
      .orderBy(options.order.column, options.order.direction);
  }

  getPaymentList(user) {
    return co.call(this, function* () {
      const Q = this.Db.tc_payments.query();

      return yield Q.where({ user_id: user.id });
    });
  }

  setPayment(payment, user) {
    return co.call(this, function* () {
      const Q = this.Db.tc_payments.query();

      if (process.env.NODE_ENV !== 'production') {
        if (payment.status === 'paid') {
          yield request
            .post('http://localhost:3000/ajax/point/noti')
            .send({
              imp_uid: payment.imp_uid,
              merchant_uid: payment.merchant_uid,
              status: payment
            });
        }

        if (payment.status === 'ready') {
          yield request
            .post('http://localhost:3000/ajax/point/noti')
            .send({
              imp_uid: payment.imp_uid,
              merchant_uid: payment.merchant_uid,
              status: payment
            });
        }
      }

      return yield Q.insert(payment);
    });
  }

  updatePaymentByNoti(payment) {
    return co.call(this, function* () {
      const Q = this.Db.tc_payments.query();

      const oldPayment = yield Q.where({ merchant_uid : payment.merchant_uid }).first();

      let newPayment;
      if (oldPayment) {
        newPayment = yield Q.patchAndFetchById(oldPayment.id, payment).where({
          merchant_uid: payment.merchant_uid
        });

        if (payment.status === 'paid') {
          yield this.chargeRP(newPayment, { id: newPayment.user_id });
        }

        if (payment.status === 'cancelled') {
          yield this.cancelRP(newPayment, { id: newPayment.user_id });
        }

      } else {
        newPayment = new Error('payment is not exist!');
      }

      return newPayment;
    });
  }

  chargeRP(payment, user) {
    return co.call(this, function* () {

      const AMOUNT_R = (payment.amount * 10 / 11);

      const trade = yield this.Db
        .tc_trades
        .query()
        .insert({
          action: 'charge_rp',
          sender_type: 'venacle',
          sender_id: null,
          target_type: 'payment',
          target_id: payment.id,
          receiver_type: 'user',
          receiver_id: user.id,
          amount_r: AMOUNT_R,
          amount_t: 0,
          created_at: payment.paid_at
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
          type: 'deposit',
          point_type: 'RP',
          total_r: beforeAccount.total_r + trade.amount_r,
          total_t: beforeAccount.total_t + trade.amount_t,
          trade_id: trade.id,
          user_id: user.id,
          created_at: payment.paid_at
        });

      const trendbox = yield this.Db
        .tc_user_trendboxes
        .query()
        .patch({
          T: newAccount.total_t,
          R: newAccount.total_r,
        })
        .where({user_id: user.id});

    });
  }

  cancelRP(payment, user) {
    return co.call(this, function* () {

      const AMOUNT_R = (payment.amount * 10 / 11);

      const trade = yield this.Db
        .tc_trades
        .query()
        .insert({
          action: 'cancelled_rp',
          sender_type: 'user',
          sender_id: user.id,
          target_type: 'payment',
          target_id: payment.id,
          receiver_type: 'venacle',
          receiver_id: null,
          amount_r: AMOUNT_R,
          amount_t: 0,
          created_at: payment.cancelled_at
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
          created_at: payment.cancelled_at
        });

      const trendbox = yield this.Db
        .tc_user_trendboxes
        .query()
        .patch({
          T: newAccount.total_t,
          R: newAccount.total_r,
        })
        .where({user_id: user.id});

    });
  }
}

module.exports = new Point();
