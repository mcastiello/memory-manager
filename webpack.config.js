/*
 * Copyright (c) 2019
 * Author: Marco Castiello
 * E-mail: marco.castiello@gmail.com
 * Project: MemoryManager.js
 */

const path = require('path');

module.exports = {
    entry: './src/memory-manager.js',
    devtool: 'source-map',
    output: {
        filename: 'memory-manager.js',
        path: path.resolve(__dirname, 'dist'),
    },
    module: {
        rules: [
            {
                test: /garbage-collector.js$/,
                use: {
                    loader: 'worker-loader',
                    options: { inline: true, name: "services/gc.js" }
                }
            }
        ]
    }
};