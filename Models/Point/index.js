const ModelClass = require('../../Util/Helper/Class');
const co = require('co');
const request = require('superagent');

class Point extends ModelClass {
  constructor() {
    super('tc_payments');
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

  updatePaymentByNoti(payment, user) {
    return co.call(this, function* () {
      const Q = this.Db.tc_payments.query();

      return yield Q.patch(payment).where({
        merchant_uid: payment.merchant_uid,
        user_id: user.id
      });
    });
  }
}

module.exports = new Point();
