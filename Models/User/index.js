'use strict';
const M = require('trendclear-database').Models;
const knex = require('trendclear-database').knex;
const _ = require('lodash');

const RedisCli = require('vn-api-client').Redis;
const ImageCli = require('vn-api-client').Image;

const jwtConf = require('vn-config').api.jwt;
const Mailer = require('../../Util/EmailTransporter');

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

      resolve(res)
    })
  })
}
function hashPassword(userPassword, salt = 10) {
  return new Promise((resolve, reject) => {
    bcrypt.hash(userPassword, salt, (err, res) => {
      if (err) {
        reject(err);
      }

      resolve(res)
    })
  })
}

class User {
  checkUserAuth(sessionId, token) {
    const keyPrefix = 'sess:';

    return RedisCli
      .get(keyPrefix + sessionId)
      .then(result => {
        const redisJS = JSON.parse(result);

        // Redis에 Session이 없을때
        // 1. 첫 방문
        // 2. 전체 삭제
        if (!redisJS) {
          throw new Error('Malformed sessionId');
        }

        // 브라우저에서 Session_id 가 없을때
        // 1. 손님
        // 2. 일부러 지운경우
        if (redisJS.token && !token) {
          delete redisJS.token;

          return RedisCli
            .set(keyPrefix + sessionId, JSON.stringify(redisJS))
            .then(() => null)
        }

        // Session 과 Token 이 모두 있을때
        // 1. 잘못된 Token
        //    1.1 토큰 값이 잘못됨
        //    1.2 토큰 인증값이 잘못됨
        // 2. 로그인
        if (redisJS.token && token) {
          const verifyToken = token === redisJS.token;

          if (!verifyToken) {
            throw new Error('Malformed token');
          }

          return new Promise((resolve, reject) => {
            jsonwebtoken.verify(token, jwtConf.secret, function (jwtErr, decoded) {
              // err
              if (jwtErr) {
                throw reject(jwtErr);
              }

              if (!decoded) {
                throw reject(jwtErr);
              }

              const userObj = {
                id: decoded.id,
                nick: decoded.nick
              };

              new User()
                .checkUserLogin(userObj)
                .then(function (user) {
                  if (!user) {
                    throw reject(new Error('Malformed jwt payload'));
                  }

                  resolve(user);
                })
            });
          });
        }
      })
      .catch(err => {
        switch(err.name) {
          case 'TokenExpiredError':
            throw new Error(err);
            break;

          case 'JsonWebTokenError':
            throw new Error(err);
            break;

          default:
            throw new Error(err);
        }
      })
  }
  checkUUID(req, sessionId, token, user) {
    // 1. (UserId: 1)
    const visitAt = new Date();
    const ua = uaParser(req.headers['user-agent']);
    const deviceObj = {
      session_id: sessionId,
      ip: req.ip,
      browser: `${ua.browser.name}-${ua.browser.version}-${ua.browser.major}`,
      os: `${ua.os.name}-${ua.os.version}`
    };

    return new Promise((resolve, reject) => {
      resolve(true);
    })
    .then(() => {
      if (user) {

        return M
          .tc_visitors
          .query()
          .eager('[devices]')
          .where({user_id: user.id})
          .first()
          .then(visitor => {

            if (visitor) {
              const device = _.find(visitor.devices, deviceObj);

              deviceObj.visitor_uid = visitor.uuid;

              if (device) {

                return device
                  .$query()
                  .patchAndFetchById(device.id, {last_visit: visitAt})

              } else {

                deviceObj.first_visit = visitAt;
                deviceObj.last_visit = visitAt;

                return M
                  .tc_visitor_devices
                  .query()
                  .insert(deviceObj)

              }
            } else {

              return M
                .tc_visitors
                .query()
                .insert({
                  uuid: UID.v4(),
                  user_id: user.id
                })
                .then(visitor => {

                  deviceObj.visitor_uid = visitor.uuid;
                  deviceObj.first_visit = visitAt;
                  deviceObj.last_visit = visitAt;

                  return M
                    .tc_visitor_devices
                    .query()
                    .insert(deviceObj)
                })
            }
          })
      } else if (!user && sessionId) {
        // 2. (SessionId: 1, UserId: 0)


        return M
          .tc_visitor_devices
          .query()
          .eager('[visitor]')
          .where({session_id: sessionId})
          .first()
          .then(device => {

            if (device) {

              return device
                .$query()
                .patchAndFetchById(device.id, {last_visit: visitAt})

            } else {

              return M
                .tc_visitors
                .query()
                .insert({
                  uuid: UID.v4(),
                  user_id: null
                })
                .then(visitor => {

                  deviceObj.first_visit = visitAt;
                  deviceObj.last_visit = visitAt;
                  deviceObj.visitor_uid = visitor.uuid;

                  return M
                    .tc_visitor_devices
                    .query()
                    .insert(deviceObj)
                })

            }
          })

      } else if (req.ip && !user && !sessionId) {
        // 3. (IP: 1, SessionId: 0, UserId: 0)

        return M
          .tc_visitor_devices
          .query()
          .eager('[visitor]')
          .where({ip: req.ip})
          .first()
          .then(device => {

            if (device) {

              return device
                .$query()
                .patchAndFetchById(device.id, {last_visit: visitAt})

            } else {

              return M
                .tc_visitors
                .query()
                .insert({
                  uuid: UID.v4(),
                  user_id: null
                })
                .then(visitor => {

                  deviceObj.first_visit = visitAt;
                  deviceObj.last_visit = visitAt;
                  deviceObj.visitor_uid = visitor.uuid;

                  return M
                    .tc_visitor_devices
                    .query()
                    .insert(deviceObj)
                })

            }
          })
      }
    })
    .then(device => {
      return device
        .$relatedQuery('visitor')
        .first()
        .then(visitor => {
          visitor.device = device;
          return visitor;
        });
    })
  }
  /**
   *
   * Signin
   *
   * @param email
   * @returns {Promise.<T>}
   */
  checkEmailDup(email) {
    return M
      .tc_users
      .query()
      .where('email', email)
      .count('id as dup')
      .first()
      .then(function (dup) {
        return dup;
      })
      .catch(function (err) {
        console.log(err);
      });
  }
  checkNickDup(nick) {
    return M
      .tc_users
      .query()
      .where('nick', nick)
      .count('id as dup')
      .first()
      .then(function (dup) {
        return dup;
      })
      .catch(function (err) {
        console.log(err);
      });
  }
  requestEmailVerifyCode(email, sessionId) {
    const code = Math.floor(Math.random() * 900000) + 100000;
    return RedisCli.get('sess:' + sessionId)
      .then(function (result) {
        const resultJS = JSON.parse(result);
        resultJS.verifyCode = code;
        return JSON.stringify(resultJS);
      })
      .then(function (result) {
        return RedisCli.set('sess:' + sessionId, result);
      })
      .then(function () {

        const mailer = new Mailer();

        const mailOptions = {
          from: `"베나클" <webmaster@venacle.com>`, // sender address
          to: email, // list of receivers
          subject: '반갑습니다! 베나클 입니다. 이메일 코드를 확인해주세요', // Subject line
          html: htmlTemplate.signIn(code)
        };

        return mailer
          .init(M)
          .then(mail => mail.setMessage(mailOptions))
          .then(mail => mail.send())
          .then(result => {
            return {
              result: 'ok',
              message: result.message
            };
          });
      });
  }
  checkVerifyCode(code, sessionId) {
    return RedisCli
      .get('sess:' + sessionId)
      .then(function (result) {
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
    return hashPassword(userObj.password, 10)
      .then((hashPassword) => {
        uCreate.password.password = hashPassword;

        return M
          .tc_users
          .query()
          .insertWithRelated(uCreate)
      })
      .then(function (newUser) {

        return Promise.join(
          M
            .tc_grades
            .query()
            .where('name', '없음')
            .pick(['id']),

          M
            .tc_roles
            .query()
            .where('name', '회원')
            .pick(['id']),

          M
            .tc_skills
            .query()
            .whereIn('name', ['write_post', 'write_comment', 'write_sub_comment']),

          M
            .tc_forum_categories
            .query()
            .select('tc_forum_categories.forum_id')
            .join('tc_categories', 'tc_forum_categories.category_id', 'tc_categories.id'),

          function (grade, role, skills, defaultFollowForumIds) {
            return newUser
              .$relatedQuery('grade')
              .insert({
                grade_id: grade.id
              })
              .then(() => {
                return knex
                  .batchInsert('tc_user_skills', [
                    {level: 1, skill_id: skills[0].id, user_id: newUser.id},
                    {level: 1, skill_id: skills[1].id, user_id: newUser.id},
                    {level: 1, skill_id: skills[2].id, user_id: newUser.id},
                  ])
              })
              .then(function () {
                return newUser
                  .$relatedQuery('role')
                  .insert({
                    role_id: role.id
                  })
              })
              .then(function () {

                const query = [];
                for (let key in defaultFollowForumIds) {
                  query.push({user_id: newUser.id, forum_id: defaultFollowForumIds[key].forum_id})
                }

                return M
                  .tc_user_follow_forums
                  .query()
                  .insert(query)
              })
              .then(() => {
                const forumIds = defaultFollowForumIds.map(forum => {
                  return forum.forum_id
                });
                return M
                  .tc_forums
                  .query()
                  .increment('follow_count', 1)
                  .whereIn('id', forumIds)
              })
          })
          .then(function () {
            return User.setTokenWithRedisSession({nick: uCreate.nick, id: newUser.id}, sessionId)
          })
          .then(function (token) {
            return {token: token};
          });
      })
      .catch(function (err) {
        console.log(err);
        throw new Error(err);
      })
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

    return M
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
      .first()
      .then(function (findUser) {

        `select "tc_user_notifications".*, "tc_posts"."id", "tc_posts"."title"
        from "tc_user_notifications"
        LEFT JOIN "tc_posts" ON "tc_posts"."id" = "tc_user_notifications"."target_id"
        WHERE "tc_user_notifications"."user_id" = (2)	;`

        return findUser
          .$relatedQuery('notifications')
          .select('*', 'tc_user_notifications.id as id', 'tc_posts.id as post_id')
          .join('tc_posts', 'tc_posts.id', 'tc_user_notifications.target_id')
          .offset(0)
          .limit(10)
          .orderBy('receive_at', 'DESC')
          .then(notis => {

            findUser.notifications = notis;
            return findUser;
          })
      })
      .catch(function (err) {
        console.log(err);
        throw new Error(err);
      })
  }


  login(user, sessionId) {
    const userObj = {
      email: user.email,
      password: user.password
    };

    return M
      .tc_users
      .query()
      .eager('password')
      .where({ email: userObj.email })
      .first()
      .then(function (findUser) {
        if (!findUser) {
          throw new Error('User not Found');
        }

        return passwordCompare(userObj.password, findUser.password.password)
          .then((passwordCheck) => {
            if (passwordCheck === false) {
              throw new Error('Password is not Correct');
            }
            return User
              .setTokenWithRedisSession({nick: findUser.nick, id: findUser.id}, sessionId)
          })
      })
      .catch(err => {
        throw new Error('Password is not Correct');
      });
  }

  logout(user, sessionId) {
    return RedisCli.get('sess:' + sessionId)
      .then(function (result) {
        const resultJS = JSON.parse(result);
        delete resultJS.token;

        return JSON.stringify(resultJS);
      })
      .then(function (result) {
        return RedisCli.set('sess:' + sessionId, result);
      });
  };

  checkUserByToken(token, sessionId) {
    return RedisCli
      .get('sess:' + sessionId)
      .then(function (result) {
        const resultJS = JSON.parse(result);

        let jwt = Promise.promisifyAll(jsonwebtoken);
        if (token) {
          return jwt.verify(token, jwtConf.secret);
        } else {
          return null
        }
      })
      .then(function (decoded) {
        if (!decoded) {
          return null
        }

        return M
          .tc_users
          .query()
          .where({id: decoded.id, nick: decoded.nick})
          .first()
      })
      .catch(function (err) {
        console.error(err);
        throw new Error(err);
      })
  };

  updateAvatarImg(imgObj, user) {
    const oldAvatarImg = user.profile.avatar_img;

    return user
      .$relatedQuery('profile')
      .update({
        avatar_img: imgObj.file.name
      })
      .then(function (numberOfAffectedRows) {
        return ImageCli
          .del('/uploaded/files/', {file: 'http://localhost:3000/image/uploaded/files/'+oldAvatarImg})
          .then((result) => {
            return numberOfAffectedRows;
          })
          .catch((err) => {
            // remove fail

            return numberOfAffectedRows;
          })
      });
  }

  removeAvatarImg(user) {
    const oldAvatarImg = user.profile.avatar_img;

    return user
      .$relatedQuery('profile')
      .patch({
        avatar_img: null
      })
      .then(function (numberOfAffectedRows) {
        return ImageCli
          .del('/uploaded/files/', {file: 'http://localhost:3000/image/uploaded/files/'+oldAvatarImg})
          .then((result) => {
            return numberOfAffectedRows;
          })
          .catch((err) => {
            // remove fail

            return numberOfAffectedRows;
          })
      });
  }

  levelUp(levelObj, user) {
    return Promise
      .resolve()
      .then(Trendbox.incrementLevel(user, levelObj.currentLevel))
      .then(newTrendbox => newTrendbox)
  }

  updatePassword(passwordObj, user) {
    return user
      .$relatedQuery('password')
      .first()
      .then(function (findPassword) {
        if (!findPassword) {
          throw new Error('User not Found');
        }

        return passwordCompare(passwordObj.oldPassword, findPassword.password)
          .then((passwordCheck) => {
            if (passwordCheck === false) {
              throw new Error('Password is not Correct');
            }

            return hashPassword(passwordObj.newPassword)
          })
          .then(newPassword => {
            return user
              .$relatedQuery('password')
              .update({
                password: newPassword
              })
          })
      })
      .catch(err => {
        throw err
      });
  }

  updateProfile(profileObj, user) {
    return user
      .$relatedQuery('profile')
      .update(profileObj)
      .then((result) => {
        return user.$relatedQuery('profile')
      })
      .catch(err => {
        throw err
      })

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
    const countPost = M.tc_posts.query().count('*').where(knex.raw('tc_posts.author_id = tc_users.id')).as('postsCount');
    const countComment = M.tc_comments.query().count('*').where(knex.raw('tc_comments.author_id = tc_users.id')).as('commentsCount');
    const countLike = M.tc_likes.query().count('*').where(knex.raw('tc_likes.liker_id = tc_users.id')).as('likesCount');

    return M
      .tc_users
      .query()
      .select('id', countPost, countComment, countLike)
      .where('id', user.id)
      .first()
  }

  reportItem(reportObj, user) {
    return M
      .tc_user_reports
      .query()
      .insert(reportObj)
  }

  deleteItem(deleteObj) {
    const type = deleteObj.type;
    const typeId = deleteObj.type_id;
    return M[`tc_${type}s`]
      .query()
      .patchAndFetchById(typeId, {deleted: true})
      .then(deletedItem => {
        return M
          .tc_likes
          .query()
          .delete()
          .where({
            type: type,
            type_id: typeId
          })
          .then(() => {
            if (type === 'post') {
              return M
                .tc_forum_announce_posts
                .query()
                .delete()
                .where('post_id', '=', typeId)
                .then(() => {
                  return M
                    .tc_forums
                    .query()
                    .decrement('post_count', 1)
                    .where({id: deletedItem.forum_id})
                })
            }

            return false;
          })
          .then(() => deletedItem)
      })

  }

  readNoti(notiObj, user) {
    return user
      .$relatedQuery('notifications')
      .update({
        read: true,
        read_at: new Date()
      })
      .where('id', notiObj.id)
  }

  getPointAccount(user) {
    return M
      .tc_user_point_accounts
      .query()
      .eager('[trade]')
      .where({user_id: user.id})
      .orderBy('created_at', 'DESC')
  }

  resetPassword(obj) {
    return M
      .tc_users
      .query()
      .where({email: obj.email})
      .first()
      .then(user => {
        if (user) {
          return new Promise(function (resolve, reject) {
            const newPassword = shortId.generate();

            hashPassword(newPassword, 10)
              .then((hashPassword) => {
                user.newPassword = newPassword;

                return user
                  .$relatedQuery('password')
                  .patch({password: hashPassword})
              })
              .then(() => {

                const mailer = new Mailer();

                const mailOptions = {
                  from: `"베나클" <webmaster@venacle.com>`, // sender address
                  to: user.email, // list of receivers
                  subject: '안녕하세요! 베나클 입니다. 임시 비밀번호를 확인해주세요', // Subject line
                  html: htmlTemplate.resetPassword(user)
                };

                return mailer
                  .init(M)
                  .then(mail => mail.setMessage(mailOptions))
                  .then(mail => mail.send())
                  .then(result => {
                    return resolve({
                      result: 'ok',
                      message: result.message
                    });
                  });
              })
          });
        } else {
          return null;
        }
      })
  }

  static setTokenWithRedisSession(user, sessionId) {
    return new Promise((resolve, reject) => {
      jsonwebtoken.sign(user, jwtConf.secret, jwtConf.option, (err, token) => {
        return RedisCli
          .get('sess:' + sessionId)
          .then(function (result) {
            const resultJS = JSON.parse(result);
            resultJS.token = token;
            return JSON.stringify(resultJS);
          })
          .then(function (result) {
            return RedisCli.set('sess:' + sessionId, result);
          })
          .then(function (result) {
            resolve(token);
          })
          .catch(err => {
            reject(err);
          })
      });
    })
  }
}

module.exports = new User();