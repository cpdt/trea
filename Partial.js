const co = require('co');
const debug = require('debug');

const requireDebug = debug('trea:req');
const initDebug = debug('trea:init');
const holdDebug = debug('trea:hold');
const cacheHitDebug = debug('trea:hit');
const regenDebug = debug('trea:regen');

if (!setImmediate) setImmediate = c => setTimeout(c, 0);

let partialId = 0;

function Partial() {
    this._partialId = partialId++;
    this._requiredPartials = new Map();
    this._requiredPartialCache = new Map();
    this._getPartialLock = true;
    this._genCache = false;
    this.genTime = new Date();
    this._renderPromise = false;
    this._hasInit = false;
    this._initPromise = false;

    this._needsUpdateCacheTime = false;
    this._needsUpdateCacheVal = null;
}

Partial.prototype.requires = co.wrap(function*(name, partial) {
    if (partial._generate) {
        requireDebug('partial#' + this._partialId + ' -> ' + ' partial#' + partial._partialId + ' (' + name + ')');
        this._requiredPartials.set(name, partial);
        if (this._hasInit) {
            if (this._initPromise) yield this._initPromise;
            yield partial.init();
        }
    }
    else throw new TypeError('Partial generation function is required');
});

Partial.prototype.partial = function(name) {
    if (this._getPartialLock) throw new Error('Cannot access partials outside of generate call');
    if (!this._requiredPartialCache.has(name)) throw new ReferenceError('Unknown partial "' + name + '"');
    return this._requiredPartialCache.get(name);
};

Partial.prototype._needsUpdate = function() {
    return false;
};

Partial.prototype._init = function() { };

Partial.prototype.init = co.wrap(function*() {
    if (this._initPromise || this._hasInit) return;

    this._initPromise = this._doInit();
    yield this._initPromise;
    this._initPromise = false;
});

Partial.prototype._doInit = co.wrap(function*() {
    initDebug('partial#' + this._partialId);
    yield Promise.resolve(this._init());
    this._hasInit = true;
    yield Array.from(this._requiredPartials.values()).map(partial => Promise.resolve(partial.init()));
});

Partial.prototype.generate = co.wrap(function*(since) {
    // wait for initialization to complete
    if (this._initPromise) yield this._initPromise;

    // prevent multiple generations happening at the same time
    if (this._renderPromise) {
        holdDebug('partial#' + this._partialId);
        return yield this._renderPromise;
    }

    this._getPartialLock = false;
    let genPromise = this._doGenerate(since);
    this._renderPromise = genPromise;
    let result = yield genPromise;
    this._renderPromise = false;
    this._getPartialLock = true;
    this._clearNeedsUpdate();
    return result;
});

Partial.prototype._doGenerate = co.wrap(function*(since) {
    let regen = this._genCache === false || (yield this.needsUpdate(since));
    if (!regen) {
        cacheHitDebug('partial#' + this._partialId);
        return this._genCache;
    }

    // update all partials
    let partialContents = new Map();
    yield Array.from(this._requiredPartials.keys()).map(name => {
        let partial = this._requiredPartials.get(name);
        return partial.generate(since).then(r => partialContents.set(name, r));
    });

    this._requiredPartialCache = partialContents;
    this.genTime = new Date();
    regenDebug('partial#' + this._partialId);
    return this._genCache = yield Promise.resolve(this._generate());
});

Partial.prototype.needsUpdate = co.wrap(function*(since) {
    // wait for initialization to complete
    if (this._initPromise) yield this._initPromise;
    since = since || this.genTime;

    if (this._needsUpdateCacheTime === since) return this._needsUpdateCacheVal;
    this._needsUpdateCacheTime = since;
    return this._needsUpdateCacheVal = yield this._recalcNeedsUpdate(since);
});

Partial.prototype._clearNeedsUpdate = function() {
    this._needsUpdateCacheTime = false;
    
    // also clear children values
    for (let [name, partial] of this._requiredPartials) {
        partial._clearNeedsUpdate();
    }
};

Partial.prototype._recalcNeedsUpdate = co.wrap(function*(since) {
    if (yield Promise.resolve(this._needsUpdate(since))) return true;

    // find if any sub-partials need updating
    // todo: parallel checking
    for (let [name, partial] of this._requiredPartials) {
        if (yield partial.needsUpdate(since)) return true;
    }
    return false;
});

module.exports = Partial;