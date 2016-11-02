const P = require('bluebird');
const nodemailer = require('nodemailer');
const xoauth2 = require('xoauth2');

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

        console.log(siteValues);

        self.oauth = siteValues.reduce((object, element) => {
          object[element.key] = element.value;
          return object;
        }, {});

        console.log(self.oauth);

        self.xoauth2Generator = xoauth2.createXOAuth2Generator(self.oauth);

        self.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            xoauth2: self.xoauth2Generator
          }
        });

        self.xoauth2Generator.on("token", function(token){

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
    return new P((res) => {
      this.mailOptions = data;

      return res(this);
    });
  }

  send() {
    return new P((res, rej) => {
      // send mail with defined transport object
      this.transporter.sendMail(this.mailOptions, function(error, info){
        if(error){
          return rej(error);
        }
        res(info);
      });
    });
  }
}

module.exports = MailTransporter;