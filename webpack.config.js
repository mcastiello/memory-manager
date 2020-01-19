/*
 * Copyright (c) 2019
 * Author: Marco Castiello
 * E-mail: marco.castiello@gmail.com
 * Project: MemoryManager.js
 */

const path = require('path');

module.exports = {
    entry: './src/index.js',
    output: {
        filename: 'memory-manager.js',
        path: path.resolve(__dirname, 'dist'),
    }
};