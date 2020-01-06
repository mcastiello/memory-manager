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
 * Manage data generated for a specific object.
 * @class
 */
class MemoryManager {
    /**
     * Create the object data and initialise it with the provided content.
     * The data will be automatically privided with an index.
     * @param {Object} object
     * @param {Object} [content]
     */
    create(object, content) {
        content = content || {};
        if (indexReference.has(object)) {
            this.update(object, content);
        } else {
            const id = generateUUID();
            const data = Object.assign({
                "id": id
            }, content);

            indexReference.set(id, object);
            dataMap.set(id, data);

            gc.postMessage({
                "name": "create",
                "index": id,
                "content": data
            });
        }
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
            gc.postMessage({
                "name": "update",
                "index": index
            });

            return data[property];
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
        const data = index && dataMap.get(index);

        if (data) {
            Object.assign(data, content);

            gc.postMessage({
                "name": "update",
                "index": index,
                "content": data
            });
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

        gc.postMessage({
            "name": "update",
            "index": indexReference.get(reference)
        });

        return reference;
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
