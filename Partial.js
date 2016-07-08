const co = require('co');
const debug = require('debug');

const requireDebug = debug('trea:req');
const initDebug = debug('trea:init');
const holdDebug = debug('trea:hold');
const cacheHitDebug = debug('trea:hit');
const regenDebug = debug('trea:regen');

if (!setImmediate) setImmediate = c => setTimeout(c, 0);

let partialId = 0;
let paramSerializeCache = new Map();

function Partial() {
    this._partialId = partialId++;
    this._requiredPartials = new Map();
    this._hasInit = false;
    this._initPromise = false;
    this._keyCache = new Map();
}

Partial.prototype.requires = co.wrap(function*(name, partial) {
    if (partial._generate) {
        requireDebug('#' + this._partialId + ' -> #' + partial._partialId + ' (' + name + ')');
        this._requiredPartials.set(name, partial);
        if (this._hasInit) {
            if (this._initPromise) yield this._initPromise;
            yield partial.init();
        }
    }
    else throw new TypeError('Partial generation function is required');
});

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
    initDebug('#' + this._partialId);
    yield Promise.resolve(this._init());
    this._hasInit = true;
    yield Array.from(this._requiredPartials.values()).map(partial => Promise.resolve(partial.init()));
});

Partial.prototype._getCache = function(param) {
    if (!paramSerializeCache.has(param)) paramSerializeCache.set(param, JSON.stringify(param));
    let keyName = paramSerializeCache.get(param);

    if (!this._keyCache.has(keyName)) {
        this._keyCache.set(keyName, {
            genCache: false,
            genTime: new Date(),
            renderPromise: false,
            needsUpdateCacheTime: false,
            needsUpdateCacheVal: false,
            keyName
        });
    }
    return this._keyCache.get(keyName);
};

Partial.prototype.genTime = function(param) {
    return this._getCache(param).genTime;
};

Partial.prototype.generate = co.wrap(function*(since, param = 'default') {
    // wait for initialization to complete
    if (this._initPromise) yield this._initPromise;

    let currentCache = this._getCache(param);

    // prevent multiple generations happening at the same time
    if (currentCache.renderPromise) {
        holdDebug(this._partialId + '#' + currentCache.keyName);
        return yield currentCache.renderPromise;
    }

    let genPromise = this._doGenerate(since, param, currentCache);
    currentCache.renderPromise = genPromise;
    let result = yield genPromise;
    currentCache.renderPromise = false;
    currentCache.needsUpdateCacheTime = false;
    return result;
});

Partial.prototype._doGenerate = co.wrap(function*(since, param, currentCache) {
    let regen = currentCache.genCache === false || (yield this.needsUpdate(since, param));
    if (!regen) {
        cacheHitDebug(this._partialId + '#' + currentCache.keyName);
        return currentCache.genCache;
    }

    // update all partials
    let partialContents = new Map();
    yield Array.from(this._requiredPartials.keys()).map(name => {
        let partial = this._requiredPartials.get(name);
        return partial.generate(since, param).then(r => partialContents.set(name, r));
    });
    
    function getPartial(name) {
        if (!partialContents.has(name)) throw new ReferenceError('Unknown partial "' + name + '"');
        return partialContents.get(name);
    }

    currentCache.genTime = new Date();
    regenDebug(this._partialId + '#' + currentCache.keyName);
    return currentCache.genCache = yield Promise.resolve(this._generate(getPartial, param));
});

Partial.prototype.needsUpdate = co.wrap(function*(since, param = 'default') {
    // wait for initialization to complete
    if (this._initPromise) yield this._initPromise;

    let currentCache = this._getCache(param);
    since = since || currentCache.genTime;

    if (currentCache.needsUpdateCacheTime === since) return currentCache.needsUpdateCacheVal;
    currentCache.needsUpdateCacheTime = since;
    return currentCache.needsUpdateCacheVal = yield this._recalcNeedsUpdate(since, param);
});

Partial.prototype._recalcNeedsUpdate = co.wrap(function*(since, param) {
    if (yield Promise.resolve(this._needsUpdate(since, param))) return true;

    // find if any sub-partials need updating
    // todo: parallel checking
    for (let [name, partial] of this._requiredPartials) {
        if (yield partial.needsUpdate(since, param)) return true;
    }
    return false;
});

module.exports = Partial;