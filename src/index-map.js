/*
 * Copyright (c) 2020
 * Author: Marco Castiello
 * E-mail: marco.castiello@gmail.com
 * Project: MemoryManager.js
 */

/**
 * Define a bi-directional map that allow to link an Index with an object.
 * If you try to get, delete or check the existence of an entry, you can pass either the index or the object value.
 * @class
 * @type IndexMap
 * @extends Map
 */
class IndexMap extends Map {
    /**
     * Initialise the WeakMap.
     * @constructor
     */
    constructor() {
        super();

        /**
         * WeakMap used to perform the reverse checks.
         * @type {WeakMap}
         */
        this.weak = new WeakMap();
    }

    /**
     * Set the value on both maps.
     * @param {String} key
     * @param {Object} value
     * @returns {Map}
     */
    set(key, value) {
        this.weak.set(value, key);
        return super.set(key, value);
    }

    /**
     * Get the reference of the object or the associated index.
     * @param {String|Object} key
     * @returns {String|Object}
     */
    get(key) {
        if (typeof key === "string") {
            return super.get(key);
        } else {
            return this.weak.get(key);
        }
    }

    /**
     * Delete an entry.
     * @param {String|Object} key
     * @returns {Boolean}
     */
    delete(key) {
        let id, object;
        if (typeof key === "string") {
            object = super.get(key);
            id = key;
        } else {
            object = key;
            id = this.weak.get(key);
        }
        this.weak.delete(object);
        return super.delete(id);
    }

    /**
     * Check if an entry exists.
     * @param {String|Object} key
     * @returns {Boolean}
     */
    has(key) {
        if (typeof key === "string") {
            return super.has(key);
        } else {
            return this.weak.has(key);
        }
    }
}

export default IndexMap;