# Memory Manager

This service can be used to generate an internal private data that gets automatically disposed when it's not used anymore.

The `Garbage Collector` is executed inside ad web worker which avoid that the data processing affects the main UI thread.

### How to use
```javascript
import manager from 'memory-manager-service';

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

You can only store primitive values (string and numbers) or arrays and standard objects containing primitive values.

You can create cross references between data objects by storing the data id inside another object.

```javascript
import manager from 'memory-manager-service';

const obj = {};
const linked = {};

// Initialise the data.
manager.create(obj);

const id = manager.get(obj, "id");

// Store the cross reference
manager.create(linked, {
    "reference": id
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
