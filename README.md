# Memory Manager

This service can be used to generate an internal private data that gets automatically disposed when it's not used anymore.

Imagine it as a more advanced `WeakMap` with an internal `Garbage Collector` that tries to keep itself clean and tidy.

The `Garbage Collector` is executed inside ad web worker which avoid that the data processing affects the main UI thread.

### How to install
Download the package from npm
```
npm install memory-manager-service
```
And then inport it in your code
```javascript
import Memory from 'memory-manager-service';
```
### How to use
```javascript
const obj = {};

// Initialise the data.
Memory.create(obj);

// An id for the data is automatically generated.
const id = Memory.get(obj, "id");

// You can store all the data you want passing property name and value.
Memory.set(obj, "test", true);
// Or using the update method
Memory.update(obj, {
    "data": "test"
});

// You can get a reference to the original object
console.log(Memory.reference(id) === obj); // true
```

You can create cross references between data objects by storing the data inside another object.

```javascript
import Memory from 'memory-manager-service';

const obj = {};
const linked = {};

// Initialise the data.
Memory.create(obj);

// Store the cross reference
Memory.create(linked, {
    "reference": obj
});
```

This will stop the `obj` data to be garbage collected until the `linked` object is not disposed.

Garbage collection can be forced manually, even if the object is cross referenced.
```javascript
// To force an object to be disposed even if it has been recently updated and/or is cross referenced.
Memory.dispose(obj);

console.log(Memory.get(linked, "reference")); // null

// Force a garbage collection
Memory.flush();
```

### Array Proxies
In order to keep the garbage collector always up to date, whenever you store an array inside a data object, this will replaced with a Proxy object that will work as a middlewher between you and the actual array. The object itself will work exactly as an array, but it will look weird if you log it on the console.
```javascript
const arr = ["My Array"];

Memory.set(obj, "arr", arr);

const proxy = Memory.get(obj, "arr");

console.log(proxy); // Proxy {0: "My Array"}
console.log(proxy[0]); // "My Array"
console.log(proxy.length); // 1
console.log(Array.isArray(proxy)); // true
console.log(proxy === arr); // false
```
### Use case
It's not really up to me to tell you how to use the data. In my case, I created this service in order to be able to create composed classes (like mixins), but with a common private area where data can be easily passed across all the composing classes.

Anyway, here is a very simple example on how to use the data:
```javascript
import Memory from 'memory-manager-service';

class Person {
    constructor() {
        Memory.create(this, {
            "name": ""
        });
    }
    
    get id() {
        return Memory.get(this, "id");
    }
    
    get name() {
        return Memory.get(this, "name");
    }
    
    set name(value) {
        Memory.set(this, "name", value);
    }
}
```
### Callbacks
The service will allow you to add callbacks for each object to monitor whenever the object is updated and/or disposed.
```javascript
const person = new Person();

Memory.onUpdate(person, () => console.log(`Hello, ${person.name}!`));
Memory.onDispose(person, () => console.log(`Oh no! They disposed ${person.name}!`));

person.name = "Kenny"; // Hello, Kenny!
Memory.dispose(person); // Oh no! They disposed Kenny!
```
