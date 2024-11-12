#!/usr/bin/env node
'use strict'

/**
 * This is a script to build g2s module files.
 * Its process removes ./build to use as a temporary storage.
 * ./dist is a destination directory for the modules.
 */

const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');


const targetDir = process.cwd();
const connectorFilePath = path.resolve(targetDir, 'src/vm/extensions/block/akadako-connector.js');
const connectorBackupFilePath = path.resolve(targetDir, 'src/vm/extensions/block/_akadako-connector.js');

// Build a normal module
execSync(`npx xcratch-build --module=g2s --gui=../scratch-gui --block=./src/vm/extensions/block --entry=./src/gui/lib/libraries/extensions/entry --output=./build`);
console.log(`Built a module`);
fs.copyFileSync('./build/g2s.mjs', './dist/g2s.mjs')
const VERSION = process.env.npm_package_version;
fs.copyFileSync('./build/g2s.mjs', `./dist/g2s-${VERSION.replace(/\./g, '_')}.mjs`);

// Build a serial disabled module
let originalCode = fs.readFileSync(connectorFilePath, 'utf-8');
originalCode = originalCode.replace(/this.useSerial\s+=\s+[^;]+;/m, `this.useSerial = false;`);
fs.renameSync(connectorFilePath, connectorBackupFilePath);
fs.writeFileSync(connectorFilePath, originalCode);
console.log(`Modify code for disable serial in ${connectorFilePath}`);
try {
    execSync(`npx xcratch-build --module=g2s-m --gui=../scratch-gui --block=./src/vm/extensions/block --entry=./src/gui/lib/libraries/extensions/entry --output=./build`);
    console.log(`Built a serial disabled module`);
} catch (err) {
    console.error(err);
}
fs.renameSync(connectorBackupFilePath, connectorFilePath);
console.log(`Restore the code to ${connectorFilePath}`);
fs.copyFileSync('./build/g2s-m.mjs', './dist/g2s-m.mjs')
