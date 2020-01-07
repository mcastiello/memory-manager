/*
 * Copyright (c) 2020
 * Author: Marco Castiello
 * E-mail: marco.castiello@gmail.com
 * Project: MemoryManager.js
 */

/**
 * Reference to all the data stored.
 * @type {Map<String, Object>}
 */
const dataMap = new Map();

/**
 * Milliseconds limit since the last object update.
 * If an object hasn't been updated during this time, 
 * it is considered ready to be garbage collected.
 * @type {Number}
 */
let garbageTimeDiff = 0;

// Main garbage collector loop.
setInterval(() => garbageCollect(), 500);

// Listen to all the messages from the main thread.
self.addEventListener("message", event => {
    switch (event.data.name) {
        case "create":
            initialiseData(event.data.index);
            break;
        case "update":
            updateData(event.data.index, event.data.content);
            break;
        case "dispose":
            disposeData(event.data.index);
            break;
        case "time":
            garbageTimeDiff = event.data.value;
            break;
        case "flush":
            const currentCollectionTime = garbageTimeDiff;
            // Disable collection time delta
            garbageTimeDiff = 0;
            
            // Force collection
            garbageCollect();
            
            // Restore collection time
            garbageTimeDiff = currentCollectionTime;
            break;
    }
});

/**
 * Check if a data object should be garbage collected.
 * @returns {Boolean}
 */
const shouldBeCollected = data => {
    const time = Date.now();
    
    return data.referenced.length === 0 &&
        time-data.timestamp > garbageTimeDiff;
};

/**
 * Collect all the object that are not cross referenced by 
 * any other object and that hasn't been updated during the 
 * collection time delta defined.
 */
const garbageCollect = () => {
    dataMap.forEach((content, index) => shouldBeCollected(content) && disposeData(index));
};

/**
 * Initialise a data element.
 * @param {String} index
 */
const initialiseData = (index) => {
    dataMap.set(index, {
        "timestamp": Date.now(),
        "data": {},
        "references": [],
        "referenced": []
    });
};

/**
 * Update the data stored in the main thread.
 * @param {String} index
 * @param {Object} data
 */
const updateData = (index, data) => {
    const content = dataMap.get(index);
    let i, ii;

    if (content) {
        content.timestamp = Date.now();

        if (data) {
            Object.assign(content.data, data);

            const references = loadReferences(content.data);
            const diff = diffReferences(content.references, references);

            content.references = references;

            for (i=0, ii=diff.added.length; i<ii; i++) {
                addReference(diff.added[i], index);
            }
            for (i=0, ii=diff.removed.length; i<ii; i++) {
                removeReference(diff.removed[i], index);
            }
        }
    }
};

/**
 * Dispose of an element.
 * @param {String} index
 */
const disposeData = index => {
    const content = dataMap.get(index);

    if (content) {
        for (let reference of content.references) {
            disposeReference(reference, index);
        }

        dataMap.delete(index);

        self.postMessage({
            "name": "delete",
            "index": index
        });
    }
};

/**
 * Check for all the reference that has been added and/or removed since the last update.
 * @param {Array} initial
 * @param {Array} final
 * @returns {{removed: Array, added: Array}}
 */
const diffReferences = (initial, final) => {
    const removed = [];
    const added = final.slice();
    const list = initial.slice();
    let i, len = list.length;

    for (i=0; i<len; i++) {
        const id = list.pop();
        const index = added.indexOf(id);

        if (index < 0) {
            removed.push(id);
        } else {
            added.splice(index, 1);
        }
    }

    return { added, removed };
};

/**
 * Extract all the references to other objects inside the current object data.
 * @param {Object} data
 * @returns {Array}
 */
const loadReferences = data => {
    const references = [];
    const properties = Object.keys(data);

    for (let property of properties) {
        const value = data[property];
        if (property !== "id") {
            if (typeof value === "string" && dataMap.has(value)) {
                references.push(value);
            } else if (Array.isArray(value)) {
                for (let element of value) {
                    if (typeof element === "string" && dataMap.has(element)) {
                        references.push(element);
                    }
                }
            }
        }
    }

    return references;
};

/**
 * Add a cross reference between the two provided objects.
 * @param {String} index
 * @param {String} reference
 */
const addReference = (index, reference) => {
    const content = dataMap.get(index);

    if (content) {
        content.referenced.push(reference);
    }
};


/**
 * Remove a cross reference between the two provided objects.
 * @param {String} index
 * @param {String} reference
 */
const removeReference = (index, reference) => {
    const content = dataMap.get(index);

    if (content) {
        const id = content.referenced.indexOf(reference);

        if (id >= 0) {
            content.referenced.splice(id, 1);
        }
    }
};

/**
 * When an object is forced to be disposed, the index is removed from all the cross references.
 * @param {String} index
 * @param {String} reference
 */
const disposeReference = (index, reference) => {
    const content = dataMap.get(index);
    const properties = Object.keys(content.data);
    let id = content.referenced.indexOf(reference);

    if (id >= 0) {
        content.referenced.splice(id, 1);
    }

    for (let property of properties) {
        const value = content.data[property];
        if (value === reference) {
            content.data[property] = null;
        } else if (Array.isArray(value)) {
            id = value.indexOf(reference);
            if (id >= 0) {
                value.splice(id, 1);
            }
        }
    }

    // Notify the main thread the reference has been removed, hence the data has been updated.
    self.postMessage({
        "name": "updated",
        "index": index,
        "data": content.data
    });
};
