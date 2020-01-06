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
const garbageTimeDiff = 5000;

// Main garbage collector loop.
// When data is not referenced by anything and hasn't been used for more than
// 30 seconds, it gets automatically disposed.
setInterval(() => {
    const time = Date.now();

    dataMap.forEach((content, index) => {
        if (content.referenced.length === 0 && garbageTimeDiff-content.timestamp > diff) {
            disposeData(index);
        }
    });
}, 500);

// Listen to all the messages from the main thread.
self.addEventListener("message", event => {
    switch (event.data.name) {
        case "create":
            initialiseData(event.data.index, event.data.content);
            break;
        case "update":
            updateData(event.data.index, event.data.content);
            break;
        case "dispose":
            disposeData(event.data.index);
            break
        case "time":
            garbageTimeDiff = event.data.time;
            break
    }
});

/**
 * Initialise a data element.
 * @param {String} index
 * @param {Object} [data]
 */
const initialiseData = (index, data) => {
    const refs = loadReferences(data);
    const content = {
        "timestamp": Date.now(),
        "data": data,
        "references": refs,
        "referenced": []
    };
    dataMap.set(index, content);

    for (let id of refs) {
        addReference(id, index);
    }
};

/**
 * Update the data stored in the main thread.
 * @param {String} index
 * @param {Object} data
 */
const updateData = (index, data) => {
    const content = dataMap.get(index);
    let i, ii;

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
};

/**
 * Dispose of an element.
 * @param {String} index
 */
const disposeData = index => {
    const content = dataMap.get(index);

    for (let reference of content.references) {
        disposeReference(reference, index);
    }

    dataMap.delete(index);

    self.postMessage({
        "name": "delete",
        "index": index
    });
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
