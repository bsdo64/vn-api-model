const fs = require('fs');
const path = require('path');

let models = {};
const files = fs.readdirSync(__dirname);
let newFiles = files
  .filter(function (file) {
    return file !== 'index.js';
  })
  .map(function (file) {
    // ['Club', 'Collection', 'Comment', ...]
    return path.parse(file).name;
  });

newFiles.forEach(function (element, index, array) {
  models[element] = require(path.resolve(__dirname, element));
});

module.exports = models;
