"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const glob = require('glob');
const path = require('path');
exports.migrations = [];
glob.sync(path.resolve(__dirname, './**/*.js')).forEach(function (file) {
    if (file.indexOf('index.js') !== -1)
        return;
    exports.migrations = exports.migrations.concat(Object.values(require(path.resolve(file))) || []);
});
//# sourceMappingURL=index.js.map