# Trea

> A fast, framework-agnostic partial system for old-skool page generation in NodeJS

Trea allows you to split your pages into 'partials', which are individually generated and cached, and then stitched back together when required. Partials are cached, and are rebuilt when your application signals that it has changed. You can also include partials inside partials, allowing for very complex dynamic sites to be built.

A partial can 'output' anything: a string, array, object, XML node, whatever. As a result, you can theoretically use any web framework in order to generate partials.

## Usage

Trea is on NPM, and works on Node 6 or later (due to its use of generators and ES2015 features).

```
npm install trea --save
```

### Creating Partials

To define a simple partial whose content should never change, provide an implementation for `_generate`. It can optionally return a promise, or the value of the partial.

```js
let trea = require('trea');
let Partial = trea.Partial;

class MyPartial extends Partial {
    _generate() {
        return "My partial";
    }
}
```

In order to render our partial, we create an instance of it and call the `generate` function:

```js
let myPartial = new MyPartial();
console.log(myPartial.generate()); // "My partial"
console.log(myPartial.generate()); // "My partial"
```

Note that, even though we call `generate` twice, our `_generate` implementation is only called the first time. So far, then, this is a simple memoization system. Trea also allows us to specify a function that is called in order to determine whether the partial contents have changed since a given date - as with `_generate`, this function can return a promise or a boolean.

```js
let startTime = new Date();

class MyOtherPartial extends Partial {
    _needsUpdate(date) {
        let secondsAgo = (new Date()) - 5000;
        return secondsAgo > date;
        // if more than 5 seconds have passed since the last update time, say
        // that our partial needs an update
    }
    _generate() {
        let currentTime = new Date();
        return (currentTime - startTime) / 1000;
        // return the number of seconds since the program was started
    }
}
```

The Date that is passed to `_needsUpdate` is the time that the partial was generated previously. We return a boolean value from the function, where `true` says that our partial needs to be generated, and `false` says that it doesn not. Hence, if we use the following code:

```js
let myOtherPartial = new MyOtherPartial();
setInterval(function() {
    console.log(myOtherPartial.generate());
}, 1000);
```

The `_generate` function will be called approximately once every five times `generate` is called, and we will see the time since the program started being updated every five seconds.

We can also pass in a date to `partial.generate`, and that date will then be used as the date in `_needsUpdate`.

### Partials in Partials

Part of the power of Trea is the ability to embed partials inside partials. Trea makes this incredibly simple, and ensures that your partial is regenerated whenever a sub-partial needs regeneration.

In order to declare that a partial uses a sub-partial, we can use the `requires` method - we pass it a name to call the sub-partial, as well as the partial object. Inside the `_generate` function, we can then use the `partial` method to get the value of the partial.

```js
class DependantPartial extends Partial {
    constructor() {
        this.requires('myPartial', new MyPartial());
        this.requires('myOtherPartial', new MyOtherPartial());
    }

    _generate() {
        return 'Some text from the first partial: ' + this.partial('myPartial')
             + '\nFrom the second partial: ' + this.partial('myOtherPartial');
    }
}
```

Since our new partial, by itself, returns a constant value, there is no need for us to define a `_needsUpdate` function. This will be handled automatically for sub-partials, so when `myOtherPartial` is regenerated, our `DependantPartial` will be too. Its also important to keep in mind that sub-partials are generated before your `_generate` function is called, allowing generation functions to return promises but you to put together the result synchronously.

### Initialization

Trea allows you to specify asynchronous initialization routines for partials. This can be done by providing an `_init` method in your partial class, which can optionally return a promise. In order to start initialization of a partial, call the `init` method - this will first initialize that partial, and then initialize all sub-partials that have been declared, and returns a promise that will resolve when all initialization is complete.

If a partial is 'required' after its parent has been initialized, that partial will be initialized immediately.

### EJS Partial

In order to simplify web development, a small EJS Partial implemention is included (this will likely be moved to a separate module in the future).

In order to create an EJS Partial, extend from `trea.EJSPartial`. Your class will need to have a `path` property, specifying the location to the EJS file. Additionally, it must have a `partials` property, containing an object of partial names to partial classes.

Parameters passed to `_init` will be passed to all partial constructors - this allows you to pass things like database objects, configuration, etc. You can also provide an object to `_generate`, which will be used as the scope of the EJS code. For example:

```js
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
```

Inside the EJS file, reference a partial with the `partial` function, like so:

```ejs
<%- partial('infobox') %>
```

The EJS Partial class will automatically find all partial references in the file and 'require' them.

## Documentation

### `Partial`

#### `#genTime: Date`

The time of the most recent generation, or the time the partial was constructed if it has yet to be generated.

#### `#generate(since: Date = genTime): Promise<*>`

Generate the partial if it has changed since the provided date, and return a promise with the partial value. If the partial is already being generated, the returned promise will be that of the previous generation.

#### `#needsUpdate(since: Date = genTime): Promise<bool>`

Determines whether the partial requires updating, by calling the partials `_needsUpdate` function and then checking each sub-partial. This function is memoized, reset after generation is complete - as a result, you can safely use it before generation in your own code without causing multiple calls.

#### `#init(): Promise<>`

Initializes the partial and sub-partials. This partial will be initialized, followed by all sub-partials at the same time. The promise will resolve when complete.

#### `#requires(name: string, partial: Partial): Promise<>`

Specifies that the partial depends on a sub-partial. `name` is used in order to reference the partial when accessing its value with `#partial`. If the parent partial has already been initialized, the provided partial will be initialized immediately, with the promise resolving when complete.

**Throws `TypeError`** if the partial is missing a `_generate` function.

#### `#partial(name: string): *`

Gets the output of a sub-partial. As this function is only usable inside a `_generate` call, the values of the partial are calculated asynchronously beforehand, allowing synchronous access here.

**Throws `ReferenceError`** if no partial by the provided name exists
**Throws `Error`** if `#partial` is being called from outside a `_generate` call (not allowed)

#### `#_needsUpdate(date: Date): bool | Promise<bool>`

A function that should be implemented by subclasses, returning whether the partial content has changed since the provided date. By default, returns `false`, allowing the function to be excluded for a completely static partial.

#### `#_generate(): * | Promise<*>`

A function that should be implemented by subclasses, returning the content of the partial. Is not implemented in the base `Partial` class, and `#requires` will throw an error on receiving a partial without this method.

#### `#_init(): undefined | Promise<>`

A function that should be implemented by subclasses, initializing the partial. Initialization of sub-partials is not required here, as that is done automatically later. Both this and the partial constructor are the best times to 'require' a sub-partial. By default, does nothing.


## License

Licensed under the MIT license, included in LICENSE.
