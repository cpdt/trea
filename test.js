let path = require('path');
let partials = require('./partials');

class PagePartial extends EJSPartial {
    constructor(db) {
        super();
        this.db = db;
        this.path = path.join(__dirname, "template.ejs");
        this.partials = partials;
    }

    _init() {
        return super._init(this.db);
    }

    _generate() {
        return super._generate({
            username: 'cpdt',
            avatarPath: '/images/user/cpdt.png'
        });
    }
}