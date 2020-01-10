/*
 * Copyright (c) 2020
 * Author: Marco Castiello
 * E-mail: marco.castiello@gmail.com
 * Project: MemoryManager.js
 */

import IndexMap from "index-map-class";
import GarbageCollector from "./garbage-collector";

/**
 * List of tokens used to generate a Unique ID
 * @type {ArrayBuffer}
 * @private
 */
const lut = new ArrayBuffer(256);

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
 * @type {Worker}
 * @private
 */
const gc = new GarbageCollector();

/**
 * Number of milliseconds used by the garbage collector to 
 * decide if it needs to dispose of an object.
 * @type {Number}
 * @private
 */
let collectionTime = 30000;

// Add the listener to all the possible events triggered by the garbage collector.
gc.addEventListener("message", event => {
    const id = event.data.index;
    switch (event.data.name) {
        case "updated":
            dataMap.set(id, event.data.content);
            break;
        case "delete":
            const callbacks = disposeCallbackMap.get(id);
            for (let callback of callbacks) {
                callback();
            }
            indexReference.delete(id);
            dataMap.delete(id);
            complexDataMap.delete(id);
            disposeCallbackMap.delete(id);
            updateCallbackMap.delete(id);
            break;
    }
});

// Initialise all the index tokens.
for (let i=0; i<256; i++) {
    lut[i] = (i<16 ? '0' : '' ) + (i).toString(16).toUpperCase();
}

/**
 * Generate a UUID.
 * @returns {String}
 * @private
 */
const generateUUID = () => {
    const d0 = Math.random()*0xffffffff|0;
    const d1 = Math.random()*0xffffffff|0;
    const d2 = Math.random()*0xffffffff|0;
    const d3 = Math.random()*0xffffffff|0;
    return lut[d0&0xff]+lut[d0>>8&0xff]+lut[d0>>16&0xff]+lut[d0>>24&0xff]+'-'+
        lut[d1&0xff]+lut[d1>>8&0xff]+'-'+lut[d1>>16&0x0f|0x40]+lut[d1>>24&0xff]+'-'+
        lut[d2&0x3f|0x80]+lut[d2>>8&0xff]+'-'+lut[d2>>16&0xff]+lut[d2>>24&0xff]+
        lut[d3&0xff]+lut[d3>>8&0xff]+lut[d3>>16&0xff]+lut[d3>>24&0xff];
};

/**
 * Check if the parameter is a complex object, like an instance of a class.
 * @returns {Boolean}
 * @private
 */
const isComplexObject = (obj) => {
    return Boolean(obj) && typeof obj === "object" && 
        obj.constructor !== Object && !Array.isArray(obj);
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

    gc.postMessage({
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
        if (isManagedObject(value)) {
            arr[i] = indexReference.get(arr[i]);
        }
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

    gc.postMessage({
        "name": "update",
        "index": index,
        "content": {
            [property]: value
        }
    });
    
    for (let callback of callbacks) {
        callback(property, value);
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
     * @param {Object} object
     * @param {Object} [content]
     * @returns {String}
     */
    create(object, content) {
        let id;
        content = content || {};
        
        if (indexReference.has(object)) {
            id = indexReference.get(object);
            this.update(object, content);
        } else {
            id = content.id || generateUUID();
            const data = Object.assign({
                "id": id
            }, content);

            gc.postMessage({
                "name": "create",
                "index": id
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
            
            gc.postMessage({
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
     * Get the reference for the requested object.
     * @param {String|Object} reference
     * @returns {Object}
     */
    reference(reference) {
        if (typeof reference === "string") {
            reference = indexReference.get(reference);
        }

        if (indexReference.has(reference)) {
            gc.postMessage({
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
            gc.postMessage({
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
        gc.postMessage({
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
            
            gc.postMessage({
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
