/*
 * Copyright (c) 2020
 * Author: Marco Castiello
 * E-mail: marco.castiello@gmail.com
 * Project: MemoryManager.js
 */

import "index-map-class";
import "thread-manager-service";
import GarbageCollector from "./garbage-collector";

/**
 * Cross reference between stored objects and their ID.
 * @type {IndexMap}
 * @private
 */
const indexReference = new IndexMap();

/**
 * List of all the data managed.
 * @type {Map<String, Object>}
 * @private
 */
const dataMap = new Map();

/**
 * List of all the complex objects associated to the managed data.
 * @type {Map<String, Object>}
 * @private
 */
const complexDataMap = new Map();

/**
 * List of all the callbacks executed when an object is disposed.
 * @type {Map<String, Function>}
 * @private
 */
const disposeCallbackMap = new Map();

/**
 * List of all the callbacks executed when a property is updated.
 * @type {Map<String, Function>}
 * @private
 */
const updateCallbackMap = new Map();

/**
 * Reference to the garbage collector.
 * @type {WebThread}
 * @private
 */
let garbageCollector = null;

/**
 * Queue of messages to send to the garbage collector as soon as it's ready.
 * @type {Array}
 * @private
 */
let garbageCollectorQueue = [];

/**
 * Number of milliseconds used by the garbage collector to 
 * decide if it needs to dispose of an object.
 * @type {Number}
 * @private
 */
let collectionTime = 30000;

// Start the garbage collector thread.
Threads.run(GarbageCollector).then(thread => {
    garbageCollector = thread;

    // Add the listener to all the possible events triggered by the garbage collector.
    garbageCollector.addEventListener("message", event => {
        const id = event.data.index;
        switch (event.data.name) {
            case "updated":
                dataMap.set(id, event.data.content);
                break;
            case "delete":
                const callbacks = disposeCallbackMap.get(id);
                for (let callback of callbacks) {
                    callback(id);
                }
                indexReference.delete(id);
                dataMap.delete(id);
                complexDataMap.delete(id);
                disposeCallbackMap.delete(id);
                updateCallbackMap.delete(id);
                break;
        }
    });
    
    // Execute the queue of messages already generated.
    for (let message of garbageCollectorQueue) {
        garbageCollector.postMessage(message);
    }
    garbageCollectorQueue.length = 0;
});

/**
 * Check if the parameter is a complex object, like an instance of a class.
 * @returns {Boolean}
 * @private
 */
const isComplexObject = (obj) => {
    return Boolean(obj) && ((typeof obj === "object" && obj.constructor !== Object) ||
        typeof obj === "function") && !Array.isArray(obj);
};

/**
 * Check if the parameter is an object stored in the manager.
 * @returns {Boolean}
 * @private
 */
const isManagedObject = (obj) => {
    return Boolean(obj) && typeof obj === "object" && indexReference.has(obj);
};

/**
 * Check if the parameter is the index of an objects stored in the manager.
 * @returns {Boolean}
 * @private
 */
const isManagedIndex = (index) => {
    return typeof index === "string" && indexReference.has(index);
};

/**
 * Get the value stored in a proxy array.
 * @returns {*}
 * @private
 */
const getArrayValue = (index, list, id) => {
    let value = list[id];

    if (!isNaN(id)) {
        if (isManagedIndex(value)) {
            value = indexReference.get(value);
        } else if (/ComplexObject::/.test(value)) {
            value = complexDataMap.get(index).get(value.replace("ComplexObject::", ""));
        }
    }

    notifyGarbageCollector({
        "name": "update",
        "index": index
    });

    return value;
};

/**
 * Store a value into a proxy array.
 * @returns {Boolean}
 * @private
 */
const setArrayValue = (index, property, list, id, value) => {
    if (!isNaN(id)) {
        if (isManagedObject(value)) {
            value = indexReference.get(value);
        } else if (isComplexObject(value)) {
            complexDataMap.get(index).set(property + "::" + id, value);
            value = "ComplexObject::" + property + "::" + id;
        } else if (value === null || value === undefined) {
            complexDataMap.get(index).delete(property + "::" + id);
        }
    }
    list[id] = value;
    
    notifyUpdate(index, property, list);
    
    return true;
};

/**
 * Generate a proxy element used to query the original array.
 * @returns {Array}
 */
const storeArray = (index, property, arr) => {
    // Object containing all the traps to manage a proxy array of mangaed objects.
    const arrayTrap = {
        get: (...params) => getArrayValue(index, ...params),
        set: (...params) => setArrayValue(index, property, ...params)
    };
    
    for (let i=0, ii=arr.length; i<ii; i++) {
        let value = arr[i];
        if (isManagedObject(value)) {
            value = indexReference.get(value);
        } else if (isComplexObject(value)) {
            complexDataMap.get(index).set(property + "::" + i, value);
            value = "ComplexObject::" + property + "::" + i;
        }
        arr[i] = value;
    }
    complexDataMap.get(index).set(property, new Proxy(arr, arrayTrap));
    
    return arr;
};

/**
 * Notify that a property value has been updated.
 * Notification is sent to the Garbage Collector and 
 * to the registered 'onUpdate' callback.
 * @param {String} index
 * @param {String} property
 * @param {*} value
 * @private
 */
const notifyUpdate = (index, property, value) => {
    const callbacks = updateCallbackMap.get(index);

    notifyGarbageCollector({
        "name": "update",
        "index": index,
        "content": {
            [property]: value
        }
    });
    
    for (let callback of callbacks) {
        callback(index, property, value);
    }
};

/**
 * Send a message to the garbage collector or store it into a queue if it's not yet ready.
 * @param {Object} message
 * @private
 */
const notifyGarbageCollector = message => {
    if (garbageCollector) {
        garbageCollector.postMessage(message);
    } else {
        garbageCollectorQueue.push(message);
    }
};

/**
 * Manage data generated for a specific object.
 * @class
 */
class MemoryManager {
    /**
     * Create the object data and initialise it with the provided content.
     * The data will be automatically provided with an index.
     * The method will return the generated index.
     * If the keepAlive is set to true, the object will not be garbage collected
     * and will require to be disposed manually.
     * @param {Object} object
     * @param {Object} [content]
     * @param {Boolean} [keepAlive]
     * @returns {String}
     */
    create(object, content, keepAlive) {
        let id;
        content = content || {};
        
        if (indexReference.has(object)) {
            id = indexReference.get(object);
            this.update(object, content);
        } else {
            id = content.id || Threads.generateUUID();
            const data = Object.assign({
                "id": id
            }, content);

            notifyGarbageCollector({
                "name": "create",
                "index": id,
                "keepAlive": Boolean(keepAlive)
            });

            dataMap.set(id, {});
            indexReference.set(id, object);
            complexDataMap.set(id, new Map());
            disposeCallbackMap.set(id, []);
            updateCallbackMap.set(id, []);
            
            this.update(object, data);
        }
        
        return id;
    }

    /**
     * Get the content of a property stored for a specific reference.
     * @param {String|Object} reference
     * @param {String} property
     * @returns {*}
     */
    get(reference, property) {
        const index = typeof reference === "string" ? reference : indexReference.get(reference);
        const data = index && dataMap.get(index);

        if (data) {
            let value = data[property];
            
            if (isManagedIndex(value) && property !== "id") {
                value = indexReference.get(value);
            } else if (value === "ComplexData::" + property || Array.isArray(value)) {
                value = complexDataMap.get(index).get(property);
            }
            
            notifyGarbageCollector({
                "name": "update",
                "index": index
            });

            return value;
        }
    }

    /**
     * Set the value of a property for a specific object reference.
     * @param {String|Object} reference
     * @param {String} property
     * @param {*} value
     */
    set(reference, property, value) {
        const index = typeof reference === "string" ? reference : indexReference.get(reference);
        const data = index && dataMap.get(index);

        if (data) {
            if (isManagedObject(value)) {
                value = indexReference.get(value);
            } else if (isComplexObject(value)) {
                complexDataMap.get(index).set(property, value);
                value = "ComplexData::" + property;
            } else if (Array.isArray(value)) {
                value = storeArray(index, property, value);
            } else if (value === null || value === undefined) {
                complexDataMap.get(index).delete(property);
            }
            data[property] = value;
    
            notifyUpdate(index, property, value);
        }
    }

    /**
     * Update all the data for a specific reference.
     * @param {String|Object} reference
     * @param {Object} content
     */
    update(reference, content) {
        const index = typeof reference === "string" ? reference : indexReference.get(reference);

        if (content && index && indexReference.has(index)) {
            const keys = Object.keys(content);
            for (let i=0, ii=keys.length; i<ii; i++) {
                const key = keys[i];
                this.set(index, key, content[key]);
            }
        }
    }

    /**
     * Check if a reference exists.
     * @param {String|Object} reference
     * @returns {Boolean}
     */
    has(reference) {
        return indexReference.has(reference);
    }

    /**
     * Get the reference for the requested object.
     * @param {String|Object} reference
     * @returns {Object}
     */
    reference(reference) {
        if (typeof reference === "string") {
            reference = indexReference.get(reference);
        }

        if (indexReference.has(reference)) {
            notifyGarbageCollector({
                "name": "update",
                "index": indexReference.get(reference)
            });

            return reference;
        }
    }

    /**
     * Dispose a stored object.
     * @param {String|Object} reference
     */
    dispose(reference) {
        const index = typeof reference === "string" ? reference : indexReference.get(reference);

        if (index) {
            notifyGarbageCollector({
                "name": "dispose",
                "index": index
            });
        }
    }

    /**
     * Store a callback that will be executed when the object is disposed.
     * @param {String|Object} reference
     * @param {Function} callback
     */
    onDispose(reference, callback) {
        const index = typeof reference === "string" ? reference : indexReference.get(reference);
        const callbacks = disposeCallbackMap.get(index);

        if (callbacks && typeof callback === "function") {
            callbacks.push(callback);
        }
    }

    /**
     * Store a callback that will be executed when the object is updated.
     * @param {String|Object} reference
     * @param {Function} callback
     */
    onUpdate(reference, callback) {
        const index = typeof reference === "string" ? reference : indexReference.get(reference);
        const callbacks = updateCallbackMap.get(index);

        if (callbacks && typeof callback === "function") {
            callbacks.push(callback);
        }
    }

    /**
     * Flush the memory.
     */
    flush() {
        notifyGarbageCollector({
            "name": "flush"
        });
    }
    
    /**
     * Gets the garbage collection time.
     * @returns {Number}
     */
    get collectionTime() {
        return collectionTime;
    }
    
    /**
     * Sets the garbage collection time.
     * @param {Number} time
     */
    set collectionTime(time) {
        time = Number(time);
        if (!isNaN(time)) {
            collectionTime = Math.round(time);
            
            notifyGarbageCollector({
                "name": "time",
                "value": collectionTime
            });
        }
    }
}

// Initialise the service.
const manager = new MemoryManager();
manager.collectionTime = collectionTime;

export default manager;
