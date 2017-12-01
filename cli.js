const fs = require('fs');
const cpp = require('child-process-promise');
const copy = require('recursive-copy');
const rimraf = require('rimraf');
const modulePath = require('npm-module-path');

const userDirectory = process.cwd();

let inModuleDir = false;
let runLocally = false;
let commandToRun = 'run';
let ielmUserPath = undefined;
if (process.argv && process.argv.length) {
    process.argv.forEach((arg) => {
        if ((arg === 'build') ||
            (arg === 'run') ||
            (arg === 'clean-run') ||
            (arg === 'run-dev') ||
            (arg === 'clean-run-dev') ||
            (arg === 'test')) {
                commandToRun = arg;
            };
        if (arg === 'local') {
            runLocally = true;
        }
        if (arg.startsWith('path=')) {
            ielmUserPath = arg.substring(5);
        }
    })
}

console.log(`:: ${commandToRun}`);

const outputDirName = 'output';
const outputDir = `./${outputDirName}`;
const serverDir = './src/server';
const npmBinDir = './node_modules/.bin/';

const ielmBinary = './ielm.js';
const componentsDir = `${serverDir}/Component`;
const serverScript = `${serverDir}/server.js`;
const simpleHttpServerBin = `${npmBinDir}/node-simplehttpserver`;
const simpleHttpServerPort = 8080;
const webpackDevServerBin = `${npmBinDir}/webpack-dev-server`;
const elmPackageSource = `${serverDir}/elm-package.sample.json`;
const elmPackageDest = `${outputDir}/elm-package.json`;
const componentsDest = `${outputDir}/Component`;

function build() {
    // webpack
    return goToModuleDir()
        .then(execInPromise('webpack'))
        .then(goBackToOriginalDir)
        .catch(reportError);
}

function run() {
    return goToModuleDir()
        .then(buildIfNotExists)
        .then(createOutputDir)
        .then(copyComponents)
        .then(copyElmPackage)
        .then(installPackages)
        .then(() => {
            return Promise.all([ startServer(), startClient() ]);
        })
        .then(goBackToOriginalDir)
        .catch(reportError);
}

function cleanRun() {
    return goToModuleDir()
        .then(cleanOutput)
        .then(quickRun)
        .catch(reportError);
}

function runDev() {
    return goToModuleDir()
        .then(createOutputDir)
        .then(copyComponents)
        .then(copyElmPackage)
        .then(installPackages)
        .then(() => {
            return Promise.all([ startServer(), startDevClient() ]);
        })
        .then(goBackToOriginalDir)
        .catch(reportError);
}

function cleanRunDev() {
    return goToModuleDir()
        .then(cleanOutput)
        .then(quickRunDev)
        .catch(reportError);
}

function test() {
    throw new Error("Error: no test specified");
}

function goToModuleDir() {
    if (ielmUserPath) {
        console.log(`:: iElm module path: ${ielmUserPath}`);
        return chdirInPromise(ielmUserPath);
    }
    return (inModuleDir || runLocally)
        ? Promise.resolve()
        : modulePath.resolveOne('ielm').then((ielmModulePath) => {
            if (!ielmModulePath) {
                return Promise.reject('iElm module path was not found. Ensure iElm is installed (globally or locally, no matter) or provide custom path with `path=` argument');
            }
            inModuleDir = true;
            console.log(`:: iElm module path: ${ielmModulePath}`);
            return chdirInPromise(ielmModulePath);
        }).catch((err) => {
            reportError(err);
            return Promise.resolve();
        })
}

function goBackToOriginalDir() {
    return chdirInPromise(userDirectory);
}

function createOutputDir() {
    // mkdir ./output
    console.log(':: create output directory.');
    return new Promise((resolve, reject) => {
        try {
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir);
            }
            resolve();
        } catch(e) {
            reject(e);
        }
    });
}

function cleanOutput() {
    // rm -Rf ./output
    return rimrafInPromise(outputDir);
}

function copyComponents() {
    // cp -R ./src/server/Component ./output
    console.log(':: copy components.');
    return copy(componentsDir, componentsDest, { overwrite: true });
}

function copyElmPackage() {
    // cp ./src/server/elm-package.sample.json ./output/elm-package.json
    console.log(':: copy elm-package.json.');
    const sample = require(elmPackageSource);

    if (!sample['source-directories']) sample['source-directories'] = [];
    sample['source-directories'].push(userDirectory);

    let sourceDependencies = sample.dependencies;
    let userDependencies = {};
    try {
        userDependencies = require(`${userDirectory}/elm-package.json`).dependencies || {};
    } catch(e) {}
    Object.keys(userDependencies).forEach((dependencyName) => {
        sourceDependencies[dependencyName] = userDependencies[dependencyName];
    });

    return new Promise((resolve, reject) => {
        fs.writeFile(elmPackageDest, JSON.stringify(sample, null, '\t'), 'utf8', (err) => {
            if (!err) {
                resolve();
            } else {
                reject(err);
            }
        });
    });
}

function installPackages() {
    // cd ./output && elm-package install --yes && cd ..
    return chdirInPromise(outputDir)
        .then(() => { console.log(':: install Elm packages.'); })
        .then(execInPromise('elm-package', [ 'install', '--yes' ]))
        .then(chdirInPromise('..'));
}

function startServer() {
    // node ./src/server/server.js
    console.log(':: start server at http://localhost:3000.');
    return execInPromise('node', [ serverScript ]);
}

function startClient() {
    // ./node_modules/.bin/node-simplehttpserver . 8080
    console.log(':: start client at http://localhost:8080.');
    return execInPromise(simpleHttpServerBin, [ '.', simpleHttpServerPort ]);
}

function startDevClient() {
    // ./node_modules/.bin/webpack-dev-server
    console.log(':: start development client at http://localhost:8080.');
    return execInPromise(webpackDevServerBin);
}

function buildIfNotExists() {
    return new Promise((resolve, reject) => {
        try {
            if (!fs.existsSync(ielmBinary)) {
                return build();
            }
            resolve();
        } catch(e) {
            reject(e);
        }
    });
}

function execInPromise(command, args) {
    //console.log(`:: execute '${command}' with arguments: '${args}'.`);
    const promise = cpp.spawn(command, args || []);
    const childProcess = promise.childProcess;
    childProcess.stdout.on('data', function (data) {
        //console.log(`${command} :: ${data.toString()}`);
    });
    childProcess.stderr.on('data', function (data) {
        console.log(`${command} error :: ${data.toString()}`);
    });
    return promise;
}

function chdirInPromise(path) {
    return new Promise((resolve, reject) => {
        try {
            //console.log(`:: change directory to '${path}'.`);
            process.chdir(path);
            resolve();
        } catch(e) {
            reject(e);
        }
    });
}

function rimrafInPromise(path) {
    return new Promise((resolve, reject) => {
        console.log(`:: clean '${path}'.`);
        rimraf(path, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

function reportError(err) {
    console.error(`xx Error: ${err}`);
}

if (commandToRun === 'build') {
    build();
} else if (commandToRun === 'run') {
    run();
} else if (commandToRun === 'clean-run') {
    cleanRun();
} else if (commandToRun === 'run-dev') {
    runDev();
} else if (commandToRun === 'clean-run-dev') {
    cleanRunDev();
} else if (commandToRun === 'test') {
    test();
}
