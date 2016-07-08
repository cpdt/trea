const util = require('util');
const co = require('co');
const ejs = require('ejs');
const fs = require('mz/fs');

const Partial = require('./Partial');

function EJSPartial() {
    Partial.call(this);
}
util.inherits(EJSPartial, Partial);

EJSPartial.prototype._init = co.wrap(function*(...partialParams) {
    if (!this.path) throw new Error('EJSPartial requires a path to be set');
    if (typeof this.partials !== 'function') throw new Error('EJSPartial requires partial mapping function (got ' + typeof this.partials + ')');

    let templateContent = yield fs.readFile(this.path, 'utf8');
    this.template = ejs.compile(templateContent, { filename: this.path });

    // find sub-partials and register them
    let partialRe = /<%-\s*partial\((?:'(.*)')|(?:"(.*)")\)\s*;?\s*%>/g;
    let singleResult;
    while ((singleResult = partialRe.exec(templateContent)) !== null) {
        let partialName = singleResult[1] || singleResult[2];
        yield this.requires(partialName, this.partials(partialName, ...partialParams));
    }
});

EJSPartial.prototype._generate = function (partial, params) {
    let opts = { partial };
    if (params) {
        if (typeof params === 'object') opts = Object.assign({}, params, opts);
        else opts.param = params;
    }
    return this.template(opts);
};

module.exports = EJSPartial;