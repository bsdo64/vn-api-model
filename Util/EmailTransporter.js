const nodemailer = require('nodemailer');

class MailTransporter {
  constructor() {

    this.oauth = {
      user: null,
      clientId: null,
      clientSecret: null,
      refreshToken: null,
      accessToken: null,
    };

    this.mailOptions = {};

  }

  init(Db) {

    const self = this;

    return Db
      .tc_site_values
      .query()
      .where({type: 'webmaster-gmail'})
      .then(siteValues => {

        self.oauth = siteValues.reduce((object, element) => {
          object[element.key] = element.value;
          return object;
        }, {});

        self.transporter = nodemailer.createTransport({
          service: 'Gmail',
          auth: {
            type: 'OAuth2',
            clientId: self.oauth.clientId,
            clientSecret: self.oauth.clientSecret,
          }
        });

        self.transporter.on("token", function(token){

          Db
            .tc_site_values
            .query()
            .patch({value: token.accessToken})
            .where({key: 'accessToken', type: 'webmaster-gmail'})
            .then(() => {
              self.oauth.accessToken = token.accessToken;
            })
        });

        return self;
      })
  }

  setMessage(data) {
    return new Promise((res) => {
      this.mailOptions = data;

      return res(this);
    });
  }

  send() {
    this.mailOptions.auth = {
      user: this.oauth.user,
      refreshToken: this.oauth.refreshToken,
      accessToken: this.oauth.accessToken,
    };

    return this.transporter.sendMail(this.mailOptions);
  }
}

module.exports = MailTransporter;