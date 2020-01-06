# Memory Manager

This service can be used to generate an internal private data that gets automatically disposed when it's not used anymore.

The `Garbage Collector` is executed inside ad web worker which avoid that the data processing affects the main UI thread.

### How to install
Download the package from npm
```
npm install memory-manager-service
```
And then inport it in your code
```javascript
import manager from 'memory-manager-service';
```
### How to use
```javascript
const obj = {};

// Initialise the data.
manager.create(obj);

// An id for the data is automatically generated.
const id = manager.get(obj, "id");

// You can store all the data you want passing property name and value.
manager.set(obj, "test", true);
// Or using the update method
manager.update(obj, {
    "data": "test"
});

// You can get a reference to the original object
manager.reference(id) === obj; // true
```

You can create cross references between data objects by storing the data inside another object.

```javascript
import manager from 'memory-manager-service';

const obj = {};
const linked = {};

// Initialise the data.
manager.create(obj);

// Store the cross reference
manager.create(linked, {
    "reference": obj
});
```

This will stop the `obj` data to be garbage collected until the `linked` object is not disposed.

Garbage collection can be forced manually, even if the object is cross referenced.
```javascript
// To force an object to be disposed even if it has been recently updated and/or is cross referenced.
manager.dispose(obj);

manager.get(linked, "reference"); // Will return 'null'

// Force a garbage collection
manager.flush();
```

### Array Proxies
In order to keep the garbage collector always up to date, whenever you store an array inside a data object, this will replaced with a Proxy object that will work as a middlewher between you and the actual array. The object itself will work exactly as an array, but it will look weird if you log it on the console.
```javascript
const arr = ["My Array"]

manager.set(obj, "arr", arr);

const proxy = manager.get(obj, "arr");

console.log(proxy); // Proxy {0: "My Array"}

Array.isArray(proxy); // true
proxy === arr // false
```
