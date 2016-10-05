const P = require('bluebird');

class MailTransporter {
  constructor({API_KEY, DOMAIN}) {
    this.API_KEY = API_KEY || 'key-fd19376224d85098f4d7d0c596195e62';
    this.DOMAIN  = DOMAIN || 'mg.venacle.com';
    this.mailgun = null;
    this.data = null;

    this.init();
  }

  init() {
    this.mailgun = require('mailgun-js')({apiKey: this.API_KEY, domain: this.DOMAIN});
  }

  setMessage(data) {
    return new P((res, rej) => {
      this.data = data;

      return res(this);
    });
  }

  send() {
    return new P((res, rej) => {
      this.mailgun.messages().send(this.data, function (error, body) {
        if (error) {
          return rej(error);
        }

        return res(body);
      });
    });
  }
}

module.exports = MailTransporter;