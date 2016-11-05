const ModelClass = require('../../Util/Helper/Class');
const _ = require('lodash');

const RedisCli = require('vn-api-client').Redis;
const ImageCli = require('vn-api-client').Image;

const jwtConf = require('vn-config').api.jwt;
const Mailer = require('../../Util/EmailTransporter');

const co = require('co');
const UID = require('node-uuid');
const uaParser = require('ua-parser-js');
const bcrypt = require('bcrypt');
const shortId = require('shortid');
const Promise = require('bluebird');
const jsonwebtoken = require('jsonwebtoken');

const htmlTemplate = require('./template/email');

const Trendbox = require('../Trendbox');


function passwordCompare(userPassword, hash) {
  return new Promise((resolve, reject) => {
    bcrypt.compare(userPassword, hash, (err, res) => {
      if (err) {
        reject(err);
      }

      resolve(res);
    });
  });
}
function hashPassword(userPassword, salt = 10) {
  return new Promise((resolve, reject) => {
    bcrypt.hash(userPassword, salt, (err, res) => {
      if (err) {
        reject(err);
      }

      resolve(res);
    });
  });
}

class User extends ModelClass {
  checkUserAuth(sessionId, token) {
    return co.call(this, function* ModelHandler() {
      let user = null;
      const keyPrefix = 'sess:';
      const sessionData = JSON.parse(yield RedisCli.get(keyPrefix + sessionId));

      // Redis에 Session이 없을때
      // 1. 첫 방문
      // 2. 전체 삭제
      if (!sessionData) {
        throw new Error('Malformed sessionId');
      }

      // 브라우저에서 Session_id 가 없을때
      // 1. 손님
      // 2. 일부러 지운경우
      if (sessionData.token && !token) {
        delete sessionData.token;

        yield RedisCli.set(keyPrefix + sessionId, JSON.stringify(sessionData));
        return user;
      }

      // Session 과 Token 이 모두 있을때
      // 1. 잘못된 Token
      //    1.1 토큰 값이 잘못됨
      //    1.2 토큰 인증값이 잘못됨
      // 2. 로그인
      if (sessionData.token && token) {
        const verifyToken = (token === sessionData.token);

        if (!verifyToken) {
          throw new Error('Malformed token');
        }

        const decoded = yield jsonwebtoken.verify(token, jwtConf.secret);
        if (!decoded) {
          throw new Error('Decoded value is empty');
        }

        const userObj = {
          id: decoded.id,
          nick: decoded.nick
        };

        return yield this.checkUserLogin(userObj);
      }
    }).catch(err => {
      switch(err.name) {
        case 'TokenExpiredError':
          throw new Error(err);

        case 'JsonWebTokenError':
          throw new Error(err);

        default:
          throw new Error(err);
      }
    });
  }
  checkUUID(req, sessionId, token, user) {
    const visitAt = new Date();
    const ua = uaParser(req.headers['user-agent']);
    const deviceObj = {
      session_id: sessionId,
      ip: req.ip,
      browser: `${ua.browser.name}-${ua.browser.version}-${ua.browser.major}`,
      os: `${ua.os.name}-${ua.os.version}`
    };
    let currentDevice;

    return co.call(this, function* ModelHandler() {
      if (user) {
        // 1. (UserId: 1)
        // 회원이 존재할 경우 무조건

        const visitor = yield this.Db
          .tc_visitors
          .query()
          .eager('[devices]')
          .where({user_id: user.id})
          .first();

        if (visitor) {
          // 기존 방문자
          const device = _.find(visitor.devices, deviceObj);
          deviceObj.visitor_uid = visitor.uuid;

          if (device) {
            // 기존 방문자의 기존 접속 장치일떄 - 최종 방문 시각 업데이트
            currentDevice = yield device
              .$query()
              .patchAndFetchById(device.id, {last_visit: visitAt});

          } else {
            // 기존 방문자의 새로운 접속 장치일떄 - 새로운 장치 등록
            deviceObj.first_visit = visitAt;
            deviceObj.last_visit = visitAt;

            currentDevice = yield this.Db
              .tc_visitor_devices
              .query()
              .insert(deviceObj);
          }
        } else {
          // 처음 방문일떄
          const visitor = yield this.Db
            .tc_visitors
            .query()
            .insert({
              uuid: UID.v4(),
              user_id: user.id
            });

          deviceObj.visitor_uid = visitor.uuid;
          deviceObj.first_visit = visitAt;
          deviceObj.last_visit = visitAt;

          // 순방문자 등록
          currentDevice = yield this.Db
            .tc_visitor_devices
            .query()
            .insert(deviceObj);
        }

      } else if (!user && sessionId) {
        // 2. (SessionId: 1, UserId: 0)
        // 회원이 아닌 손님일 경우 Session Id 로 판단

        const device = yield this.Db
          .tc_visitor_devices
          .query()
          .eager('[visitor]')
          .where({session_id: sessionId})
          .first();

        if (device) {
          // 동일 SessionId로 접속 했던적 있는 장치 - 방문 시각 업데이트
          currentDevice = yield device
            .$query()
            .patchAndFetchById(device.id, {last_visit: visitAt});
        } else {
          // SessionId가 처음 발급 받은 첫 방문자
          const visitor = yield this.Db
            .tc_visitors
            .query()
            .insert({
              uuid: UID.v4(),
              user_id: null
            });

          deviceObj.first_visit = visitAt;
          deviceObj.last_visit = visitAt;
          deviceObj.visitor_uid = visitor.uuid;

          currentDevice = yield this.Db
            .tc_visitor_devices
            .query()
            .insert(deviceObj);
        }

      } else if (req.ip && !user && !sessionId) {
        // 3. (IP: 1, SessionId: 0, UserId: 0)
        // 회원이 아닌 손님일 경우 Session Id도 존재하지 않을 때 (비정상 방문) IP 로 판단

        const device = yield this.Db
          .tc_visitor_devices
          .query()
          .eager('[visitor]')
          .where({ip: req.ip})
          .first();

        if (device) {

          currentDevice = yield device
            .$query()
            .patchAndFetchById(device.id, {last_visit: visitAt});

        } else {

          const visitor = yield this.Db
            .tc_visitors
            .query()
            .insert({
              uuid: UID.v4(),
              user_id: null
            });

          deviceObj.first_visit = visitAt;
          deviceObj.last_visit = visitAt;
          deviceObj.visitor_uid = visitor.uuid;

          currentDevice = yield this.Db
            .tc_visitor_devices
            .query()
            .insert(deviceObj);
        }
      }

      const visitor = yield currentDevice
        .$relatedQuery('visitor')
        .first();

      visitor.device = currentDevice;
      return visitor;
    });
  }

  checkEmailDup(email) {
    return co.call(this, function* ModelHandler() {
      return yield this.Db
        .tc_users
        .query()
        .where('email', 'ilike', `%${email}%`)
        .count('id as dup')
        .first();
    }).catch(function (err) {
      throw Error(err);
    });
  }
  checkNickDup(nick) {
    return co.call(this, function* ModelHandler() {
      return yield this.Db
        .tc_users
        .query()
        .where('nick', 'ilike', `%${nick}%`)
        .count('id as dup')
        .first();
    }).catch(function (err) {
      throw Error(err);
    });
  }
  requestEmailVerifyCode(email, sessionId) {
    const makeVerifyCode = Math.floor(Math.random() * 900000) + 100000;
    return co.call(this, function* ModelHandler() {

      // Set redis verifyCode in session
      const result = yield RedisCli.get('sess:' + sessionId);
      const resultJS = JSON.parse(result);
      resultJS.verifyCode = makeVerifyCode;
      yield RedisCli.set('sess:' + sessionId, JSON.stringify(resultJS));

      // send verify code mail
      const mailer = new Mailer();

      const mailOptions = {
        from: '"베나클" <webmaster@venacle.com>', // sender address
        to: email, // list of receivers
        subject: '반갑습니다! 베나클 입니다. 이메일 코드를 확인해주세요', // Subject line
        html: htmlTemplate.signIn(makeVerifyCode)
      };

      const sendingMail = yield mailer
        .init(this.Db)
        .then(mail => mail.setMessage(mailOptions))
        .then(mail => mail.send());

      return {
        result: 'ok',
        message: sendingMail.message
      };
    });
  }
  checkVerifyCode(code, sessionId) {
    return co(function* Handler() {
      const result = yield RedisCli.get('sess:' + sessionId);
      const resultJS = JSON.parse(result);
      if (parseInt(resultJS.verifyCode, 10) !== parseInt(code, 10)) {
        throw new Error('인증코드가 일치하지 않습니다');
      }

      return { result: 'ok' };
    });
  }
  signin(user, sessionId) {
    const userObj = {
      email: user.email,
      nick: user.nick,
      password: user.password,
      sex: user.sex,
      birth: user.birth
    };

    let uCreate = {
      email: userObj.email,
      nick: userObj.nick,
      uid: shortId.generate(),
      password: {
        password: userObj.password
      },
      profile: {
        sex: userObj.sex,
        birth: user.birth,
        joined_at: new Date()
      },
      trendbox: {
        level: 1
      }
    };

    return co.call(this, function* Handler() {
      uCreate.password.password = yield hashPassword(userObj.password, 10);

      const newUser = yield this.Db
        .tc_users
        .query()
        .insertWithRelated(uCreate);

      const [grade, role, skills, defaultFollowForumIds] = yield [
        this.Db
          .tc_grades
          .query()
          .where('name', '없음')
          .pick(['id']),

        this.Db
          .tc_roles
          .query()
          .where('name', '회원')
          .pick(['id']),

        this.Db
          .tc_skills
          .query()
          .whereIn('name', ['write_post', 'write_comment', 'write_sub_comment']),

        this.Db
          .tc_forum_categories
          .query()
          .select('tc_forum_categories.forum_id')
          .join('tc_categories', 'tc_forum_categories.category_id', 'tc_categories.id'),
      ];

      const followForums = defaultFollowForumIds.map(i => {
        return {user_id: newUser.id, forum_id: i.forum_id};
      });

      const forumIds = defaultFollowForumIds.map(forum => {
        return forum.forum_id;
      });

      yield [
        newUser
          .$relatedQuery('grade')
          .insert({
            grade_id: grade.id
          }),
        this.knex
          .batchInsert('tc_user_skills', [
            {level: 1, skill_id: skills[0].id, user_id: newUser.id},
            {level: 1, skill_id: skills[1].id, user_id: newUser.id},
            {level: 1, skill_id: skills[2].id, user_id: newUser.id},
          ]),
        newUser
          .$relatedQuery('role')
          .insert({
            role_id: role.id
          }),
        this.Db
          .tc_user_follow_forums
          .query()
          .insert(followForums),
        this.Db
          .tc_forums
          .query()
          .increment('follow_count', 1)
          .whereIn('id', forumIds),

        // add inventory
        this.Db
          .tc_user_inventories
          .query()
          .insert({
            type: 'community',
            max_item_count: 100,
            max_inventory_box: 64,
            user_id: newUser.id
          }),

        // add account
        this.Db
          .tc_user_point_accounts
          .query()
          .insert({
            type: 'initial',
            point_type: 'Both',
            total_t: newUser.trendbox.T,
            total_r: newUser.trendbox.R,
            user_id: newUser.id,
            created_at: new Date()
          })
      ];

      const token = yield User.setTokenWithRedisSession({nick: uCreate.nick, id: newUser.id}, sessionId);

      return {token};
    }).catch(function (err) {
      throw new Error(err);
    });
  }

  /**
   *
   *  CheckUserLogin
   *
   */
  checkUserLogin(user) {
    const userObj = {
      id: user.id,
      nick: user.nick
    };

    return co.call(this, function* Handler() {
      const findUser = yield this.Db
        .tc_users
        .query()
        .eager('[' +
          'skills.skill.property, ' +
          'trendbox, ' +
          'grade.gradeDef, ' +
          'role, ' +
          'profile, ' +
          'icon.iconDef, ' +
          'collections.forums, ' +
          'follow_forums.creator.profile,' +
          'forumCreated,' +
          'forumManaged,' +
          'inventories.items.item.attribute' +
          ']')
        .where(userObj)
        .first();


      `select "tc_user_notifications".*, "tc_posts"."id", "tc_posts"."title"
        from "tc_user_notifications"
        LEFT JOIN "tc_posts" ON "tc_posts"."id" = "tc_user_notifications"."target_id"
        WHERE "tc_user_notifications"."user_id" = (2)	;`;

      findUser.notifications = yield findUser
        .$relatedQuery('notifications')
        .select('*', 'tc_user_notifications.id as id', 'tc_posts.id as post_id')
        .join('tc_posts', 'tc_posts.id', 'tc_user_notifications.target_id')
        .offset(0)
        .limit(10)
        .orderBy('receive_at', 'DESC');

      return findUser;
    })
    .catch(function (err) {
      throw new Error(err);
    });
  }

  login(user, sessionId) {
    const userObj = {
      email: user.email,
      password: user.password
    };

    return co.call(this, function* ModelHandler() {
      const findUser = yield this.Db
        .tc_users
        .query()
        .eager('password')
        .where({ email: userObj.email })
        .first();

      if (!findUser) {
        throw new Error('User not Found');
      }

      const passwordCheck = yield passwordCompare(userObj.password, findUser.password.password);
      if (passwordCheck === false) {
        throw new Error('Password is not Correct');
      }
      return yield User.setTokenWithRedisSession({nick: findUser.nick, id: findUser.id}, sessionId);
    }).catch(err => {
      throw new Error(err);
    });
  }

  logout(user, sessionId) {
    return co(function* Handler() {
      const result = yield RedisCli.get('sess:' + sessionId);
      const resultJS = JSON.parse(result);
      delete resultJS.token;

      return RedisCli.set('sess:' + sessionId, JSON.stringify(resultJS));
    });
  }

  updateAvatarImg(imgObj, user) {
    const oldAvatarImg = user.profile.avatar_img;

    return co(function* Handler() {
      const [numberOfAffectedRows, ] = yield [
        user
          .$relatedQuery('profile')
          .update({
            avatar_img: imgObj.file.name
          }),
        ImageCli.del('/uploaded/files/', {file: 'http://localhost:3000/image/uploaded/files/'+oldAvatarImg})
      ];

      return numberOfAffectedRows;
    });
  }

  removeAvatarImg(user) {
    const oldAvatarImg = user.profile.avatar_img;

    return co(function* Handler() {
      const [numberOfAffectedRows, ] = yield [
        user
          .$relatedQuery('profile')
          .patch({
            avatar_img: null
          }),
        ImageCli.del('/uploaded/files/', {file: 'http://localhost:3000/image/uploaded/files/'+oldAvatarImg})
      ];

      return numberOfAffectedRows;
    });
  }

  levelUp(levelObj, user) {
    return Promise
      .resolve()
      .then(Trendbox.incrementLevel(user, levelObj.currentLevel))
      .then(newTrendbox => newTrendbox);
  }

  updatePassword(passwordObj, user) {
    return co(function* Handler() {
      const findPassword = yield user
        .$relatedQuery('password')
        .first();

      if (!findPassword) {
        throw new Error('User not Found');
      }

      const [passwordCheck, newPassword] = yield [
        passwordCompare(passwordObj.oldPassword, findPassword.password),
        hashPassword(passwordObj.newPassword)
      ];

      if (passwordCheck === false) {
        throw new Error('Password is not Correct');
      }

      return user
        .$relatedQuery('password')
        .update({
          password: newPassword
        });

    }).catch(err => {
      throw err;
    });
  }

  updateProfile(profileObj, user) {
    return user
      .$relatedQuery('profile')
      .update(profileObj)
      .then((result) => {
        return user.$relatedQuery('profile');
      })
      .catch(err => {
        throw err;
      });
  }

  getActivityMeta(user) {
    `SELECT tc_users.*,
       (
            SELECT COUNT(*)
            FROM tc_posts
            WHERE tc_posts.author_id=tc_users.id
       ) AS post_count,
       (
            SELECT COUNT(*)
            FROM tc_comments
            WHERE tc_comments.author_id=tc_users.id
       ) AS comment_count,
       (
            SELECT COUNT(*)
            FROM tc_likes
            WHERE tc_likes.liker_id=tc_users.id
       ) AS like_count
    FROM tc_users`;
    const countPost = this.Db.tc_posts.query().count('*').where(this.knex.raw('tc_posts.author_id = tc_users.id')).as('postsCount');
    const countComment = this.Db.tc_comments.query().count('*').where(this.knex.raw('tc_comments.author_id = tc_users.id')).as('commentsCount');
    const countLike = this.Db.tc_likes.query().count('*').where(this.knex.raw('tc_likes.liker_id = tc_users.id')).as('likesCount');

    return this.Db
      .tc_users
      .query()
      .select('id', countPost, countComment, countLike)
      .where('id', user.id)
      .first();
  }

  reportItem(reportObj) {
    return this.Db
      .tc_user_reports
      .query()
      .insert(reportObj);
  }

  deleteItem(deleteObj) {
    const type = deleteObj.type;
    const typeId = deleteObj.type_id;
    return co.call(this, function* Handler() {
      const [deletedItem, ] = yield [
        this.Db[`tc_${type}s`]
          .query()
          .patchAndFetchById(typeId, {deleted: true}),
        this.Db
          .tc_likes
          .query()
          .delete()
          .where({
            type: type,
            type_id: typeId
          })
      ];

      if (type === 'post') {
        yield [
          this.Db
            .tc_forum_announce_posts
            .query()
            .delete()
            .where('post_id', '=', typeId),
          this.Db
            .tc_forums
            .query()
            .decrement('post_count', 1)
            .where({id: deletedItem.forum_id})
        ];
      }

      return deletedItem;
    });
  }

  readNoti(notiObj, user) {
    return user
      .$relatedQuery('notifications')
      .update({
        read: true,
        read_at: new Date()
      })
      .where('id', notiObj.id);
  }

  getPointAccount(user) {
    return this.Db
      .tc_user_point_accounts
      .query()
      .eager('[trade]')
      .where({user_id: user.id})
      .orderBy('created_at', 'DESC');
  }

  resetPassword(obj) {
    return co.call(this, function* Handler() {
      let result = null;
      const user = yield this.Db
        .tc_users
        .query()
        .where({email: obj.email})
        .first();

      if (user) {
        const newPassword = shortId.generate();
        const hashPw = yield hashPassword(newPassword, 10);

        yield user
          .$relatedQuery('password')
          .patch({password: hashPw});

        user.newPassword = newPassword;

        const mailer = new Mailer();
        const mailOptions = {
          from: '"베나클" <webmaster@venacle.com>', // sender address
          to: user.email, // list of receivers
          subject: '안녕하세요! 베나클 입니다. 임시 비밀번호를 확인해주세요', // Subject line
          html: htmlTemplate.resetPassword(user)
        };

        const mailResult = yield mailer
          .init(this.Db)
          .then(mail => mail.setMessage(mailOptions))
          .then(mail => mail.send());

        result = {
          result: 'ok',
          message: mailResult.message
        };
      }

      return result;
    }).catch(err => {
      throw Error(err);
    });
  }

  static setTokenWithRedisSession(user, sessionId) {
    return new Promise((resolve, reject) => {
      jsonwebtoken.sign(user, jwtConf.secret, jwtConf.option, (err, token) => {
        return RedisCli
          .get('sess:' + sessionId)
          .then(result => {
            const resultJS = JSON.parse(result);
            resultJS.token = token;
            return RedisCli.set('sess:' + sessionId, JSON.stringify(resultJS));
          })
          .then(() => {
            resolve(token);
          })
          .catch(err => {
            reject(err);
          });
      });
    });
  }
}

module.exports = new User();