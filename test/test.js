/*
 * Copyright (c) 2020
 * Author: Marco Castiello
 * E-mail: marco.castiello@gmail.com
 * Project: MemoryManager.js
 */

// Mocking the Blob class to make sure that the text method exists.
class MockBlob extends Blob {
    constructor(parts) {
        super(parts);
        this.parts = parts.slice();
    }

    async text() {
        return this.parts.join(";");
    }
}
self.Blob = MockBlob;
self.EventTarget = null;
self.URL = {
    createObjectURL: blob => blob
};

const Memory = require('../src/memory-manager.js').default;

Memory.collectionTime = 100;

describe("Memory manager", () => {

    it("should create a data object", () => {
        const ref = {};
        Memory.create(ref);

        const id = Memory.get(ref, "id");

        expect(typeof id === "string").toBeTruthy();
        expect(Memory.reference(id) === ref).toBeTruthy();

    });
    it("should store data for an object", () => {
        const ref = {};
        const value = "sdfge5qfjl\eiagiuhòwerkgìed";
        Memory.create(ref);

        Memory.set(ref, "test", value);

        expect(Memory.get(ref, "test") === value).toBeTruthy();
    });
    it("should store data for an object", () => {
        const ref = {};
        const value = "sdfge5qfjl\eiagiuhòwerkgìed";
        Memory.create(ref);

        Memory.set(ref, "test", value);

        expect(Memory.get(ref, "test") === value).toBeTruthy();
    });
    it("should notify when object updated", done => {
        const ref = {};
        const prop = "test";
        const value = "sdfge5qfjl\eiagiuhòwerkgìed";

        Memory.create(ref);

        const id = Memory.get(ref, "id");

        Memory.onUpdate(ref, (index, property, content) => {
            expect(id === index).toBeTruthy();
            expect(prop === property).toBeTruthy();
            expect(value === content).toBeTruthy();
            done();
        });
        Memory.set(ref, prop, value);

    });
    it("should notify when object disposed", done => {
        const ref = {};

        Memory.create(ref);

        const id = Memory.get(ref, "id");

        Memory.onDispose(ref, index => {
            expect(id === index).toBeTruthy();
            done();
        });
        Memory.dispose(ref);
    });
    it("should dispose automatically", done => {
        const ref = {};
        const ts = Date.now();

        Memory.create(ref);

        const id = Memory.get(ref, "id");

        Memory.onDispose(ref, index => {
            const delta = Date.now()-ts;
            expect(id === index).toBeTruthy();
            expect(delta >= Memory.collectionTime && delta <= Memory.collectionTime + 50);
            expect(Memory.get(ref, "id") !== index);
            done();
        });
    });
    it("should keep alive an object", done => {
        const ref = {};

        Memory.create(ref,null, true);

        const id = Memory.get(ref, "id");

        setTimeout(() => {
            expect(Memory.get(ref, "id") === id);
            done();
        }, Memory.collectionTime*2);
    });
    it("should keep alive a cross reference", done => {
        const ref = {};
        const obj = {};

        Memory.create(ref,null, true);
        Memory.create(obj);

        const id = Memory.get(obj, "id");

        setTimeout(() => {
            expect(Memory.get(obj, "id") === id);
            Memory.onDispose(obj, index => {
                expect(index === id);
                done();
            });
            Memory.dispose(ref);
        }, Memory.collectionTime*2);
    });
    it("should flush all inactive objects", done => {
        const ref = {};
        const ts = Date.now();
        const duration = Memory.collectionTime;

        Memory.create(ref);

        const id = Memory.get(ref, "id");

        Memory.onDispose(ref, index => {
            const delta = Date.now()-ts;
            expect(id === index).toBeTruthy();
            expect(delta < duration).toBeTruthy();
            done();
        });

        setTimeout(() => Memory.flush(), 20);
    });
});