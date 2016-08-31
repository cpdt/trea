# :palm_tree: trea

> **The entire internet in your palm (tree).**
> A fast, framework-agnostic partial system for old-skool page generation with NodeJS.

 - Individually cache separate parts (partials) of your page and then automatically stitch them back together
 - Put partials in partials in partials - it's partials all the way down!
 - Partials can output anything! Strings, arrays, objects, XML nodes, [:turtle: turtles](https://en.wikipedia.org/wiki/Turtles_all_the_way_down), [:squirrel: jQuery](http://i.stack.imgur.com/sGhaO.gif), whatever.

## find it on npm

```
npm install trea --save
```

> N.B. trea currently only works on Node 6 or later, due to its use of generators and ES2015 features.

## get started

In trea, everything is a partial - your pages, page sections, section sections, etc. You create a partial by creating a class that extends trea's `Partial` class:

```js
let Partial = require('trea').Partial;

class NicePartial extends Partial {
    // lolwut
}
```

Each partial has an 'output' - the information that the partial generates. A partials output can be anything - a string, number, object, etc. To output data from a partial, implement the `_generate` method:

```js
class HelloPartial extends Partial {
    _generate() {
        return 'Hello world!';
    }
}
```

The output of the partial can now be gotten by calling the `generate` method on an instance of the class:

```js
let hello = new HelloPartial();
hello.generate().then(x => console.log(x)); // 'Hello world!'
hello.generate().then(x => console.log(x)); // 'Hello world!'
```

(Notice that the `_generate` method defined before isn't being called, but instead the code is calling a `generate` method provided by the Partial class)

See how the `generate` method is called twice? Well, as the code below shows, the `_generate` implemented previously is actually only called once:

```js
class SideEffectPartial extends Partial {
    _generate() {
        console.log('Hey, I was called');
        return '💡';
    }
}

let sideEffect = new SideEffectPartial();
sideEffect.generate().then(x => console.log(x)); // 'Hey, I was called' then '💡'
sideEffect.generate().then(x => console.log(x)); // '💡'
```

This behaviour is intended, and it's important to the way trea works. As a result, you should keep so-called '[side effects](http://programmers.stackexchange.com/questions/40297/what-is-a-side-effect)' out of your `_generate` method (except for some important exceptions, which we'll have a look at soon). If you need to do something every time `generate` is called, implement the `_act` method:

```js
class SideEffectAgainPartial extends Partial {
    _act() {
        console.log('Hey, I was called');
    }
    _generate() {
        return '💡';
    }
}

let sideEffectAgain = new SideEffectAgainPartial();
sideEffectAgain.generate().then(x => console.log(x)); // 'Hey, I was called' then '💡'
sideEffectAgain.generate().then(x => console.log(x)); // 'Hey, I was called' then '💡'
```

This may seem a bit pointless, but now is when we bring all of these together, with the `_needsUpdate` method. This method is called every time `generate` is called, and allows trea to determine whether the partial output should be re-generated (i.e whether `_generate` should be run again). For example, check this out:

```js
class BigOperationPartial extends Partial {
    constructor(val) {
        this.val = val;
        this._oldVal = val;
    }
    
    _needsUpdate() {
        let update = this.val !== this._oldVal;
        this._oldVal = this.val;
        return update;
    }
    
    _generate() {
        console.log('Regenerating...');
        return JSON.stringify(this.val); // or some other expensive operation
    }
}

let bigOperation = new BigOperationPartial({ hello: 'wassup' });
bigOperation.generate().then(x => console.log(x)); // 'Regenerating...' then '{"hello": "wassup"}'
bigOperation.generate().then(x => console.log(x)); // '{"hello": "wassup"}'
bigOperation.val = { hello: 'goodbye' }; // change the value we're using
bigOperation.generate().then(x => console.log(x)); // 'Regenerating...' then '{"hello": "goodbye"}'
bigOperation.generate().then(x => console.log(x)); // '{"hello": "goodbye"}'
```

Alright, now we're getting somewhere - but this is all still just a memoization system, and one that can be easily simplified with less code. But now we're getting to the point where trea really becomes useful: partials within partials. Check this out:

```js
class TwoBigOperationsPartial extends Partial {
    constructor(op1, op2) {
        this.requires('op1', op1);
        this.requires('op2', op2);
    }
    _generate(partial) {
        return partial('op1') + " " + partial('op2');
    }
}

let bigOp1 = new BigOperationPartial({ hello: 'wassup' });
let bigOp2 = new BigOperationPartial({ hello: 'goodbye' });
let twoBigOperations = new TwoBigOperationsPartial(bigOp1, bigOp2);
twoBigOperations.generate().then(x => console.log(x)); // 'Regenerating...' twice, then '{"hello": "wassup"} {"hello": "goodbye"}'
bigOp1.val = { hello: 'bonjour' };
twoBigOperations.generate().then(x => console.log(x)); // 'Regenerating...' once, then '{"hello": "bonjour"} {"hello": "goodbye"}'
```

Notice here how only the partials that need to be regenerated are - in the first case, all three of the partials are generated, but in the second case only two must be (`bigOp1` and its container, `twoBigOperations`). This is where trea comes in handy for websites - by splitting dynamic parts (e.g. parts that are generated from a database) into partials, a website can be made very efficient.

### faqs

**I know the most recent update time for my page, but don't want to implement a bunch of logic to detect if I need to regenerate a partial. What can I do?**<br>
Great question, and luckily, trea has a solution for you. A date passed as the first parameter to `generate` will be passed to your `_needsUpdate` method, as well as any sub-partials. If no date is provided, the last time that the partial has been generated will be used - this allows you to easily find if a partial has changed since the last time it was generated.

**What about pages that have parameters (e.g. GET parameters) passed to them that change their value though?**<br>
I'm glad you asked that! In order to handle this, trea has a feature called 'partial parameters'. Any kind of value (string, number, object, etc, as long as it is JSON serializable) passed as a second parameter to the `generate` method will provided the partial's `_needsUpdate` and `_generate` methods, and will also filter down to any sub-partials. Partials are cached based on this value, so using a different value will cause the partial to be generated with that value.

**What if my page generation is asynchronous?**<br>
trea supports promises through-and-through, so you can return them from literally anything... Need to check your database for changes during `_needsUpdate`? Return a promise. Need to fetch some data from a file to `_generate` the partial? Return a promise.

**What if my partial needs to do some initialization?**<br>
trea allows you to define an asynchronous `_init` method. When the `init` method provided by the Partial class is called, that partial, as well as any sub-partials, will be initialized. If a sub-partial is required after a partial has been initialized, the sub-partial will be initialized straight away.

### get your ejs on

trea includes a super-simple EJS partial wrapper to make getting started easy (note: this will probably be moved to a separate package in the near future). Check it out:

**EJSPage.js**
```js
let path = require('path');
let EJSPartial = require('trea').EJSPartial;
let partials = require('./partials');

class EJSPagePartial extends EJSPartial {
    constructor(db) {
        super();
        this.db = db;
        this.path = path.join(__dirname, 'template.ejs');
        this.partials = partials;
    }
    _init() {
        return super(this.db);
    }
    _generate(partial) {
        return super(partial, {
            username: 'cpdt',
            avatarPath: '/images/user/cpdt.png'
        });
    }
}
```
**template.ejs**
```ejs
<p>Hello there <%= username %>.</p>
<img src="<%= avatarPath %>" />
<%- partial('infobox') %>
```

EJSPartial expects your object to have a `path` property that points to the EJS file to load, and a `partials` property that contains a list of partials to be accessible from inside your template. It will then automatically detect calls to `partial(...)` in your HTML, and require these in your partial.

Parameters passed to EJSPartial's `_init` function (like what is done in the example above) will be passed into the constructors of each sub-partial when they are created. An object passed to EJSPartial's `_generate` function will be used as the scope for the template.

## documentation

### `Partial`

#### `#_act(...params: *): undefined|Promise<>`

A method that can be implemented by partial classes, performing operations that should be done on every generation. `...params` are the parameters passed to `#generate`, other than the first two.

This method is called before both `#_needsUpdate` and `#_generate` when starting partial generation, and if a promise is returned, partial generation for the partial instance will be paused until it is completed (note that `#_act` can potentially run twice at the same time if two different partial parameters are used).

#### `#_generate(partial(name: string): *, param: *): *|Promise<*>`

A method that should be implemented by a partial class, returning the content of the partial. The content of sub-partials that have been registered with `#requires` can be accessed by calling the `partial` function parameter with the partial's name. The partial parameter provided to `#generate` (or provided to a parents `#generate`) can be accessed as `param`.

This method is called after both `#_act` and `#_needsUpdate`, and will only be called if there is no version of the partial stored with the specified `param`, if `#_needsUpdate` returns a truthy value, or if a sub-partial needs to be updated.

#### `#_init(): undefined|Promise<>`

A method that can be implemented by partial classes, performing operations to initialise the partial. Initialisation can only be done once on each partial instance, and will be done as soon as the `init` method is called on this partial or one of the partials parents. If a sub-partial is childed to a partial that has already initialised, the sub-partial will be initialised immediately.

Any operations done on the partial (e.g. generation) while the partial is initialising will wait for initialisation to complete before proceeding.

#### `#_needsUpdate(since: Date, param: *): bool|Promise<bool>`

A method that can be implemented by partial classes, specifying whether the partial should update by returning a truthy or falsey value (or a promise that resolves to either). `since` is either the date passed to `#generate` (or a parents `#generate`) as the first parameter, the last time the partial with the provided parameter was generated, or the creation time if it has not yet been generated. `param` is the partial parameter provided to `#generate` (or a parents `#generate`) as the second parameter.

This method is called after `#_act` but before `#_generate`, and will not be called if no cached version of the partial exists (as the partial must generate in that case).

#### `#generate(since: Date?, param: string = 'default', ...actParams): Promise<*>`

Returns a promise that resolves to the value of the partial. If the partial, or any of its sub-partials, specify that they need to update, this will occur. If the partial is currently being generated, the returned promise will be that of the previous generation.

`param` can be used to provide a value to the partials `_generate` function, and can be any JSON-stringifiable value. Partials are cached based on their `param` value, so using a different value will result in the partial being generated again.

`actParams` are provided to the `_act` method.

#### `#genTime(param: string = 'default'): Date`

Returns the generation time of the current version of the partial with the provided partial parameter. If the partial has not yet been generated, the creation time of the partial instance will be used instead.

#### `#init(): Promise<>`

Runs the `_init` method of the partial and any sub-partials. If the partial has already been initialised or is currently in the process of initialing, nothing will happen.

#### `#needsUpdate(since: Date?, param: string = 'default'): Promise<bool>`

Returns a promise that resolves to a truthy or falsey value, representing whether the partial needs to be regenerated. Note that this includes checking sub-partials, but does not check to see if the partial has been generated yet.

`since` will be passed to the `#_needsUpdate` method, or, if not provided, the previous generation time of the partial will be used.

For speed, the result of `#needsUpdate` is memoized - this means that checks will only actually be run once for each `#generate` call (calling `#generate` clears the memoization). This memoization will only take place if the provided `since` date is the same.

#### `#requires(name: string, partial: Partial): Promise<>`

Specifies that the partial uses a sub-partial. The name provided is then used in `#_generate` when calling the `partial` function parameter. Since the partial initialisation process also initialises all sub-partials registered, if a sub-partial is registered _after_ the parent partial has initialisated, the sub-partial will be initialised straight away. The returned promise resolves when this completes, or when the parent partial completes initialisation if it has not yet completed.

A `TypeError` will be thrown if the provided partial does not have a `#_generate` method.

## license

Licensed under the MIT license, included in the LICENSE file.
