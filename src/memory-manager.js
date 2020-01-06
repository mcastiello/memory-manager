/*
 * Copyright (c) 2020
 * Author: Marco Castiello
 * E-mail: marco.castiello@gmail.com
 * Project: MemoryManager.js
 */

import IndexMap from "./index-map";
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
let collectionTime = 5000;

// Add the listener to all the possible events triggered by the garbage collector.
gc.addEventListener("message", event => {
    switch (event.data.name) {
        case "updated":
            dataMap.set(event.data.index, event.data.content);
            break;
        case "delete":
            indexReference.delete(event.data.index);
            dataMap.delete(event.data.index);
            complexDataMap.delete(event.data.index);
            break
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
 * Generate a proxy element used to query the original array.
 * @returns {Array}
 */
const storeArray = (index, property, arr) => {
    /**
     * Object containing all the traps to manage a proxy array of mangaed objects.
     * @type {Object}
     */
    const arrayTrap = {
        get: (list, prop) => {
            let value = list[prop];
            
            if (!isNaN(prop)) {
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
        },
        set: (list, prop, value) => {
            if (!isNaN(prop)) {
                if (isManagedObject(value)) {
                    value = indexReference.get(value);
                } else if (isComplexObject(value)) {
                    complexDataMap.get(index).set(property + "::" + prop, value);
                    value = "ComplexObject::" + property + "::" + prop;
                } else if (value === null || value === undefined) {
                    complexDataMap.get(index).delete(property + "::" + prop);
                }
            }
            list[prop] = value;

            gc.postMessage({
                "name": "update",
                "index": index,
                "content": {
                    [property]: list
                }
            });
            return true;
        },
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
                "index": id,
                "isGlobalScope": Object.values(self).indexOf(object) >= 0
            });

            indexReference.set(id, object);
            complexDataMap.set(id, new Map());
            
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
            
            if (isManagedIndex(value)) {
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

            gc.postMessage({
                "name": "update",
                "index": index,
                "content": {
                    [property]: value
                }
            });
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
            for (let key in content) {
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

export default manager;
