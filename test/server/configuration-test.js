/*eslint-disable no-console */
const { cloneDeep } = require('lodash');
const { expect }    = require('chai');
const fs            = require('fs');
const tmp           = require('tmp');
const nanoid        = require('nanoid');
const del           = require('del');
const pathUtil      = require('path');

const TestCafeConfiguration                   = require('../../lib/configuration/testcafe-configuration');
const TypeScriptConfiguration                 = require('../../lib/configuration/typescript-configuration');
const { DEFAULT_TYPESCRIPT_COMPILER_OPTIONS } = require('../../lib/configuration/default-values');
const RunnerCtor                              = require('../../lib/runner');
const OptionNames                             = require('../../lib/configuration/option-names');
const consoleWrapper                          = require('./helpers/console-wrapper');

const {
    CONFIGURATION_EXTENSIONS,
    JS_CONFIGURATION_EXTENSION,
    JSON_CONFIGURATION_EXTENSION,
} = require('../../lib/configuration/formats');

const tsConfigPath           = 'tsconfig.json';
const customTSConfigFilePath = 'custom-config.json';

const createJSONConfig = (path, options) => {
    options = options || {};
    fs.writeFileSync(path, JSON.stringify(options));
};

const createJsConfig = (path, options) => {
    options = options || {};
    fs.writeFileSync(path, `module.exports = ${JSON.stringify(options)}`);
};

const jsConfigIndex   = CONFIGURATION_EXTENSIONS.indexOf(JS_CONFIGURATION_EXTENSION);
const jsonConfigIndex = CONFIGURATION_EXTENSIONS.indexOf(JSON_CONFIGURATION_EXTENSION);

const createJsTestCafeConfigurationFile   = createJsConfig.bind(null, TestCafeConfiguration.FILENAMES[jsConfigIndex]);
const createJSONTestCafeConfigurationFile = createJSONConfig.bind(null, TestCafeConfiguration.FILENAMES[jsonConfigIndex]);
const createTypeScriptConfigurationFile   = createJSONConfig.bind(null, tsConfigPath);

const TEST_TIMEOUT = 5000;

describe('TestCafeConfiguration', function () {
    this.timeout(TEST_TIMEOUT);

    const testCafeConfiguration = new TestCafeConfiguration();
    let keyFileContent          = null;

    consoleWrapper.init();
    tmp.setGracefulCleanup();

    beforeEach(() => {
        const keyFile = tmp.fileSync();

        keyFileContent = Buffer.from(nanoid());
        fs.writeFileSync(keyFile.name, keyFileContent);

        createJSONTestCafeConfigurationFile({
            'hostname': '123.456.789',
            'port1':    1234,
            'port2':    5678,
            'src':      'path1/folder',
            'ssl':      {
                'key':                keyFile.name,
                'rejectUnauthorized': 'true',
            },
            'browsers':    'remote',
            'concurrency': 0.5,
            'filter':      {
                'fixture':     'testFixture',
                'test':        'some test',
                'testGrep':    'test\\d',
                'fixtureGrep': 'fixture\\d',
                'testMeta':    { test: 'meta' },
                'fixtureMeta': { fixture: 'meta' },
            },
            'clientScripts': 'test-client-script.js',
            'disableHttp2':  true,
            'proxyless':     true,
        });
    });

    afterEach(async () => {
        await del(testCafeConfiguration.defaultPaths);

        consoleWrapper.unwrap();
        consoleWrapper.messages.clear();
    });

    describe('Init', () => {
        describe('Exists', () => {
            it('Config is not well-formed', () => {
                const filePath = testCafeConfiguration.defaultPaths[jsonConfigIndex];

                fs.writeFileSync(filePath, '{');
                consoleWrapper.wrap();

                return testCafeConfiguration.init()
                    .then(() => {
                        consoleWrapper.unwrap();

                        expect(testCafeConfiguration.getOption('hostname')).eql(void 0);
                        expect(consoleWrapper.messages.log).contains(`Failed to parse the '${testCafeConfiguration.defaultPaths[jsonConfigIndex]}' file.`);
                    });
            });

            it('Options', () => {
                return testCafeConfiguration.init()
                    .then(() => {
                        expect(testCafeConfiguration.getOption('hostname')).eql('123.456.789');
                        expect(testCafeConfiguration.getOption('port1')).eql(1234);

                        const ssl = testCafeConfiguration.getOption('ssl');

                        expect(ssl.key).eql(keyFileContent);
                        expect(ssl.rejectUnauthorized).eql(true);
                        expect(testCafeConfiguration.getOption('src')).eql(['path1/folder']);
                        expect(testCafeConfiguration.getOption('browsers')).to.be.an('array').that.not.empty;
                        expect(testCafeConfiguration.getOption('browsers')[0]).to.include({ providerName: 'remote' });
                        expect(testCafeConfiguration.getOption('concurrency')).eql(0.5);
                        expect(testCafeConfiguration.getOption('filter')).to.be.a('function');
                        expect(testCafeConfiguration.getOption('filter').testGrep.test('test1')).to.be.true;
                        expect(testCafeConfiguration.getOption('filter').fixtureGrep.test('fixture1')).to.be.true;
                        expect(testCafeConfiguration.getOption('filter').testMeta).to.be.deep.equal({ test: 'meta' });
                        expect(testCafeConfiguration.getOption('filter').fixtureMeta).to.be.deep.equal({ fixture: 'meta' });
                        expect(testCafeConfiguration.getOption('clientScripts')).eql([ 'test-client-script.js' ]);
                        expect(testCafeConfiguration.getOption('disableHttp2')).to.be.true;
                        expect(testCafeConfiguration.getOption('proxyless')).to.be.true;
                    });
            });

            it('"Reporter" option', () => {
                let optionValue = null;

                createJSONTestCafeConfigurationFile({
                    reporter: 'json',
                });

                return testCafeConfiguration
                    .init()
                    .then(() => {
                        optionValue = testCafeConfiguration.getOption('reporter');

                        expect(optionValue.length).eql(1);
                        expect(optionValue[0].name).eql('json');

                        createJSONTestCafeConfigurationFile({
                            reporter: ['json', 'minimal'],
                        });

                        return testCafeConfiguration.init();
                    })
                    .then(() => {
                        optionValue = testCafeConfiguration.getOption('reporter');

                        expect(optionValue.length).eql(2);
                        expect(optionValue[0].name).eql('json');
                        expect(optionValue[1].name).eql('minimal');

                        createJSONTestCafeConfigurationFile({
                            reporter: [ {
                                name: 'json',
                                file: 'path/to/file',
                            }],
                        });

                        return testCafeConfiguration.init();
                    })
                    .then(() => {
                        optionValue = testCafeConfiguration.getOption('reporter');

                        expect(optionValue.length).eql(1);
                        expect(optionValue[0].name).eql('json');
                        expect(optionValue[0].file).eql('path/to/file');
                    });
            });

            describe('Screenshot options', () => {
                it('`mergeOptions` overrides config values', () => {
                    createJSONTestCafeConfigurationFile({
                        'screenshots': {
                            'path':        'screenshot-path',
                            'pathPattern': 'screenshot-path-pattern',
                            'takeOnFails': true,
                            'fullPage':    true,
                            'thumbnails':  true,
                        },
                    });

                    return testCafeConfiguration.init()
                        .then(() => {
                            testCafeConfiguration.mergeOptions({
                                screenshots: {
                                    path:        'modified-path',
                                    pathPattern: 'modified-pattern',
                                    takeOnFails: false,
                                    fullPage:    false,
                                    thumbnails:  false,
                                },
                            });

                            expect(testCafeConfiguration.getOption('screenshots')).eql({
                                path:        'modified-path',
                                pathPattern: 'modified-pattern',
                                takeOnFails: false,
                                fullPage:    false,
                                thumbnails:  false,
                            });

                            expect(testCafeConfiguration._overriddenOptions).eql([
                                'screenshots.path',
                                'screenshots.pathPattern',
                                'screenshots.takeOnFails',
                                'screenshots.fullPage',
                                'screenshots.thumbnails',
                            ]);
                        });
                });

                it('`mergeOptions` merges config values', () => {
                    createJSONTestCafeConfigurationFile({
                        'screenshots': {
                            'path':        'screenshot-path',
                            'pathPattern': 'screenshot-path-pattern',
                        },
                    });

                    return testCafeConfiguration.init()
                        .then(() => {
                            testCafeConfiguration.mergeOptions({
                                screenshots: {
                                    path:        'modified-path',
                                    pathPattern: void 0,
                                    takeOnFails: false,
                                },
                            });

                            expect(testCafeConfiguration.getOption('screenshots')).eql({
                                path:        'modified-path',
                                pathPattern: 'screenshot-path-pattern',
                                takeOnFails: false,
                            });

                            expect(testCafeConfiguration._overriddenOptions).eql(['screenshots.path']);
                        });
                });

                it('`mergeOptions` with an empty object does not override anything', () => {
                    createJSONTestCafeConfigurationFile({
                        'screenshots': {
                            'path':        'screenshot-path',
                            'pathPattern': 'screenshot-path-pattern',
                        },
                    });

                    return testCafeConfiguration.init()
                        .then(() => {

                            testCafeConfiguration.mergeOptions({ });

                            testCafeConfiguration.mergeOptions({ screenshots: {} });

                            expect(testCafeConfiguration.getOption('screenshots')).eql({
                                path:        'screenshot-path',
                                pathPattern: 'screenshot-path-pattern',
                            });
                        });
                });

                it('both `screenshots` options exist in config', () => {
                    createJSONTestCafeConfigurationFile({
                        'screenshots': {
                            'path':        'screenshot-path-1',
                            'pathPattern': 'screenshot-path-pattern-1',
                            'takeOnFails': true,
                            'fullPage':    true,
                            'thumbnails':  true,
                        },
                        'screenshotPath':         'screenshot-path-2',
                        'screenshotPathPattern':  'screenshot-path-pattern-2',
                        'takeScreenshotsOnFails': false,
                    });

                    return testCafeConfiguration.init()
                        .then(() => {
                            expect(testCafeConfiguration._overriddenOptions.length).eql(0);

                            expect(testCafeConfiguration.getOption('screenshots')).eql({
                                path:        'screenshot-path-1',
                                pathPattern: 'screenshot-path-pattern-1',
                                takeOnFails: true,
                                fullPage:    true,
                                thumbnails:  true,
                            });

                            expect(testCafeConfiguration.getOption('screenshotPath')).eql('screenshot-path-2');
                            expect(testCafeConfiguration.getOption('screenshotPathPattern')).eql('screenshot-path-pattern-2');
                            expect(testCafeConfiguration.getOption('takeScreenshotsOnFails')).eql(false);
                        });
                });
            });

            it("Shouldn't change filter option with function", async () => {
                fs.writeFileSync(TestCafeConfiguration.FILENAMES[jsConfigIndex], `module.exports = {filter: (testName, fixtureName, fixturePath, testMeta, fixtureMeta) => true}`);

                await testCafeConfiguration.init();

                expect(testCafeConfiguration.getOption('filter')).to.be.a('function');
                expect(testCafeConfiguration.getOption('filter')()).to.be.true;
            });

            it('Should warn message on multiple configuration files', async () => {
                createJsTestCafeConfigurationFile({
                    'hostname': '123.456.789',
                    'port1':    1234,
                    'port2':    5678,
                    'src':      'path1/folder',
                    'browser':  'ie',
                });

                consoleWrapper.wrap();
                await testCafeConfiguration.init();
                consoleWrapper.unwrap();

                const expectedMessage =
                          `There are multiple configuration files found, TestCafe will only use one. The file "${pathUtil.resolve('.testcaferc.js')}" will be used.\n` +
                          'The priority order is as follows:\n' +
                          `1. ${pathUtil.resolve('.testcaferc.js')}\n` +
                          `2. ${pathUtil.resolve('.testcaferc.json')}`;

                expect(consoleWrapper.messages.log).eql(expectedMessage);
            });

            it('Should read JS config file if JSON and JS default files exist', async () => {
                createJsTestCafeConfigurationFile({
                    'jsConfig': true,
                });
                createJSONTestCafeConfigurationFile({
                    'jsConfig': false,
                });

                await testCafeConfiguration.init();

                expect(testCafeConfiguration.getOption('jsConfig')).to.be.true;
            });
        });

        it('File doesn\'t exists', () => {
            fs.unlinkSync(TestCafeConfiguration.FILENAMES[jsonConfigIndex]);

            const defaultOptions = cloneDeep(testCafeConfiguration._options);

            return testCafeConfiguration.init()
                .then(() => {
                    expect(testCafeConfiguration._options).to.deep.equal(defaultOptions);
                });
        });

        it('Explicitly specified configuration file doesn\'t exist', async () => {
            let message = null;

            const nonExistingConfiguration = new TestCafeConfiguration('non-existing-path');

            try {
                await nonExistingConfiguration.init();
            }
            catch (err) {
                message = err.message;
            }

            expect(message).eql(`"${nonExistingConfiguration.filePath}" is not a valid path to the TestCafe configuration file. Make sure the configuration file exists and you spell the path name correctly.`);
        });
    });

    describe('Merge options', () => {
        it('One', () => {
            consoleWrapper.wrap();

            return testCafeConfiguration.init()
                .then(() => {
                    testCafeConfiguration.mergeOptions({ 'hostname': 'anotherHostname' });
                    testCafeConfiguration.notifyAboutOverriddenOptions();

                    consoleWrapper.unwrap();

                    expect(testCafeConfiguration.getOption('hostname')).eql('anotherHostname');
                    expect(consoleWrapper.messages.log).eql('The "hostname" option from the configuration file will be ignored.');
                });
        });

        it('Many', () => {
            consoleWrapper.wrap();

            return testCafeConfiguration.init()
                .then(() => {
                    testCafeConfiguration.mergeOptions({
                        'hostname': 'anotherHostname',
                        'port1':    'anotherPort1',
                        'port2':    'anotherPort2',
                    });

                    testCafeConfiguration.notifyAboutOverriddenOptions();

                    consoleWrapper.unwrap();

                    expect(testCafeConfiguration.getOption('hostname')).eql('anotherHostname');
                    expect(testCafeConfiguration.getOption('port1')).eql('anotherPort1');
                    expect(testCafeConfiguration.getOption('port2')).eql('anotherPort2');
                    expect(consoleWrapper.messages.log).eql('The "hostname", "port1", and "port2" options from the configuration file will be ignored.');
                });
        });

        it('Should ignore an option with the "undefined" value', () => {
            return testCafeConfiguration.init()
                .then(() => {
                    testCafeConfiguration.mergeOptions({ 'hostname': void 0 });

                    expect(testCafeConfiguration.getOption('hostname')).eql('123.456.789');
                });
        });
    });

    describe('Should copy value from "tsConfigPath" to compiler options', () => {
        it('only tsConfigPath is specified', async () => {
            const configuration = new TestCafeConfiguration();
            const runner        = new RunnerCtor({ configuration });

            await runner.tsConfigPath('path-to-ts-config');
            await runner._setConfigurationOptions();
            await runner._setBootstrapperOptions();

            expect(runner.configuration.getOption(OptionNames.compilerOptions)).eql({
                'typescript': {
                    configPath: 'path-to-ts-config',
                },
            });
        });

        it('tsConfigPath is specified and compiler options are "undefined"', async () => {
            const configuration = new TestCafeConfiguration();
            const runner        = new RunnerCtor({ configuration });

            await runner
                .tsConfigPath('path-to-ts-config')
                .compilerOptions(void 0); // emulate command-line run
            await runner._setConfigurationOptions();
            await runner._setBootstrapperOptions();

            expect(runner.configuration.getOption(OptionNames.compilerOptions)).eql({
                'typescript': {
                    configPath: 'path-to-ts-config',
                },
            });
        });

        it('both "tsConfigPath" and compiler options are specified', async () => {
            const configuration = new TestCafeConfiguration();
            const runner        = new RunnerCtor({ configuration });

            await runner
                .tsConfigPath('path-to-ts-config')
                .compilerOptions({
                    'typescript': {
                        configPath: 'path-in-compiler-options',
                    },
                });
            await runner._setConfigurationOptions();
            await runner._setBootstrapperOptions();

            expect(runner.configuration.getOption(OptionNames.compilerOptions)).eql({
                'typescript': {
                    configPath: 'path-in-compiler-options',
                },
            });
        });
    });
});

describe('TypeScriptConfiguration', function () {
    this.timeout(TEST_TIMEOUT);

    const typeScriptConfiguration = new TypeScriptConfiguration(tsConfigPath);

    it('Default', () => {
        const defaultTypeScriptConfiguration = new TypeScriptConfiguration();

        return defaultTypeScriptConfiguration.init()
            .then(() => {
                expect(defaultTypeScriptConfiguration.getOptions()).to.deep.equal(DEFAULT_TYPESCRIPT_COMPILER_OPTIONS);
            });
    });

    it('Configuration file does not exist', async () => {
        let message = null;

        const nonExistingConfiguration = new TypeScriptConfiguration('non-existing-path');

        try {
            await nonExistingConfiguration.init();
        }
        catch (err) {
            message = err.message;
        }

        expect(message).eql(`"${nonExistingConfiguration.defaultPaths[jsConfigIndex]}" is not a valid TypeScript configuration file.`);
    });

    it('Config is not well-formed', () => {
        fs.writeFileSync(tsConfigPath, '{');
        consoleWrapper.wrap();

        return typeScriptConfiguration.init()
            .then(() => {
                consoleWrapper.unwrap();
                fs.unlinkSync(tsConfigPath);

                expect(typeScriptConfiguration.getOption('hostname')).eql(void 0);
                expect(consoleWrapper.messages.log).contains(`Failed to parse the '${typeScriptConfiguration.filePath}' file.`);
            });
    });

    describe('With configuration file', () => {
        tmp.setGracefulCleanup();

        beforeEach(() => {
            consoleWrapper.init();
            consoleWrapper.wrap();
        });

        afterEach(async () => {
            await del(typeScriptConfiguration.defaultPaths.concat(customTSConfigFilePath));

            consoleWrapper.unwrap();
            consoleWrapper.messages.clear();
        });

        it('tsconfig.json does not apply automatically', () => {
            const defaultTSConfiguration = new TypeScriptConfiguration();

            createTypeScriptConfigurationFile({
                compilerOptions: {
                    experimentalDecorators: false,
                },
            });

            return defaultTSConfiguration.init()
                .then(() => {
                    consoleWrapper.unwrap();

                    const options = defaultTSConfiguration.getOptions();

                    expect(options['experimentalDecorators']).eql(true);
                });
        });

        it('override options', () => {
            // NOTE: suppressOutputPathCheck can't be overridden by a config file
            createTypeScriptConfigurationFile({
                compilerOptions: {
                    experimentalDecorators: false,
                    emitDecoratorMetadata:  false,
                    allowJs:                false,
                    pretty:                 false,
                    inlineSourceMap:        false,
                    noImplicitAny:          true,

                    module:           'esnext',
                    moduleResolution: 'classic',
                    target:           'esnext',
                    lib:              ['es2018', 'dom'],

                    incremental:         true,
                    tsBuildInfoFile:     'tsBuildInfo.txt',
                    emitDeclarationOnly: true,
                    declarationMap:      true,
                    declarationDir:      'C:/',
                    composite:           true,
                    outFile:             'oufile.js',
                    out:                 '',
                },
            });

            return typeScriptConfiguration.init()
                .then(() => {
                    consoleWrapper.unwrap();

                    const options = typeScriptConfiguration.getOptions();

                    expect(options['experimentalDecorators']).eql(false);
                    expect(options['emitDecoratorMetadata']).eql(false);
                    expect(options['allowJs']).eql(false);
                    expect(options['pretty']).eql(false);
                    expect(options['inlineSourceMap']).eql(false);
                    expect(options['noImplicitAny']).eql(true);
                    expect(options['suppressOutputPathCheck']).eql(true);

                    // NOTE: `module` and `target` default options can not be overridden by custom config
                    expect(options['module']).eql(1);
                    expect(options['moduleResolution']).eql(2);
                    expect(options['target']).eql(3);

                    expect(options['lib']).deep.eql(['lib.es2018.d.ts', 'lib.dom.d.ts']);

                    expect(options).not.have.property('incremental');
                    expect(options).not.have.property('tsBuildInfoFile');
                    expect(options).not.have.property('emitDeclarationOnly');
                    expect(options).not.have.property('declarationMap');
                    expect(options).not.have.property('declarationDir');
                    expect(options).not.have.property('composite');
                    expect(options).not.have.property('outFile');
                    expect(options).not.have.property('out');

                    expect(consoleWrapper.messages.log).contains('You cannot override the "module" compiler option in the TypeScript configuration file.');
                    expect(consoleWrapper.messages.log).contains('You cannot override the "moduleResolution" compiler option in the TypeScript configuration file.');
                    expect(consoleWrapper.messages.log).contains('You cannot override the "target" compiler option in the TypeScript configuration file.');
                });
        });

        it('Should not display override messages if config values are the same as default values', () => {
            const tsConfiguration = new TypeScriptConfiguration(tsConfigPath);

            createTypeScriptConfigurationFile({
                compilerOptions: {
                    module:           'commonjs',
                    moduleResolution: 'node',
                    target:           'es2016',
                },
            });

            return tsConfiguration.init()
                .then(() => {
                    consoleWrapper.unwrap();

                    expect(consoleWrapper.messages.log).not.ok;
                });
        });

        it('TestCafe config + TypeScript config', async function () {
            createJSONTestCafeConfigurationFile({
                tsConfigPath: customTSConfigFilePath,
            });

            createJSONConfig(customTSConfigFilePath, {
                compilerOptions: {
                    target: 'es5',
                },
            });

            const configuration = new TestCafeConfiguration();
            const runner        = new RunnerCtor({ configuration });

            await configuration.init();
            await runner.src('test/server/data/test-suites/typescript-basic/testfile1.ts');
            await runner._setConfigurationOptions();
            await runner._setBootstrapperOptions();
            await runner.bootstrapper._getTests();

            fs.unlinkSync(TestCafeConfiguration.FILENAMES[jsonConfigIndex]);
            typeScriptConfiguration._filePath = customTSConfigFilePath;

            expect(runner.bootstrapper.tsConfigPath).eql(customTSConfigFilePath);
            expect(consoleWrapper.messages.log).contains('You cannot override the "target" compiler option in the TypeScript configuration file.');
        });

        describe('Should warn message on rewrite a non-overridable property', () => {
            it('TypeScript config', async function () {
                let runner = null;

                createJSONConfig(customTSConfigFilePath, {
                    compilerOptions: {
                        target: 'es5',
                    },
                });

                runner = new RunnerCtor({ configuration: new TestCafeConfiguration() });

                runner.src('test/server/data/test-suites/typescript-basic/testfile1.ts');
                runner.tsConfigPath(customTSConfigFilePath);
                runner._setBootstrapperOptions();

                await runner._setConfigurationOptions();
                await runner._setBootstrapperOptions();
                await runner.bootstrapper._getTests();

                typeScriptConfiguration._filePath = customTSConfigFilePath;

                expect(runner.bootstrapper.tsConfigPath).eql(customTSConfigFilePath);
                expect(consoleWrapper.messages.log).contains('You cannot override the "target" compiler option in the TypeScript configuration file.');
            });

            it('Custom compiler options', async () => {
                const runner = new RunnerCtor({ configuration: new TestCafeConfiguration() });

                runner
                    .src('test/server/data/test-suites/typescript-basic/testfile1.ts')
                    .compilerOptions({
                        'typescript': {
                            'options': { target: 'es5' },
                        },
                    });

                await runner._setConfigurationOptions();
                await runner._setBootstrapperOptions();
                await runner.bootstrapper._getTests();

                expect(consoleWrapper.messages.log).contains('You cannot override the "target" compiler option in the TypeScript configuration file.');
            });
        });
    });

    describe('Custom Testcafe Config Path', () => {
        let configuration;

        afterEach(async () => {
            await del(configuration.defaultPaths);
        });

        it('Custom config path is used', () => {
            const customConfigFile = 'custom11.testcaferc.json';

            const options = {
                'hostname': '123.456.789',
                'port1':    1234,
                'port2':    5678,
                'src':      'path1/folder',
                'browser':  'ie',
            };

            createJSONConfig(customConfigFile, options);

            configuration = new TestCafeConfiguration(customConfigFile);

            return configuration.init()
                .then(() => {
                    expect(pathUtil.basename(configuration.filePath)).eql(customConfigFile);
                    expect(configuration.getOption('hostname')).eql(options.hostname);
                    expect(configuration.getOption('port1')).eql(options.port1);
                    expect(configuration.getOption('port2')).eql(options.port2);
                    expect(configuration.getOption('src')).eql([ options.src ]);
                    expect(configuration.getOption('browser')).eql(options.browser);
                });
        });

        it('Custom js config path is used', async () => {
            const customConfigFile = 'custom11.testcaferc.js';

            const options = {
                'hostname': '123.456.789',
                'port1':    1234,
                'port2':    5678,
                'src':      'path1/folder',
                'browser':  'ie',
            };

            createJsConfig(customConfigFile, options);

            configuration = new TestCafeConfiguration(customConfigFile);

            await configuration.init();

            expect(pathUtil.basename(configuration.filePath)).eql(customConfigFile);
            expect(configuration.getOption('hostname')).eql(options.hostname);
            expect(configuration.getOption('port1')).eql(options.port1);
            expect(configuration.getOption('port2')).eql(options.port2);
            expect(configuration.getOption('src')).eql([ options.src ]);
            expect(configuration.getOption('browser')).eql(options.browser);
        });

        it('Constructor should revert back to default when no custom config', () => {
            const defaultFileLocation = '.testcaferc.json';

            const options = {
                'hostname': '123.456.789',
                'port1':    1234,
                'port2':    5678,
                'src':      'path1/folder',
                'browser':  'ie',
            };

            createJSONConfig(defaultFileLocation, options);

            configuration = new TestCafeConfiguration();

            return configuration.init()
                .then(() => {
                    expect(pathUtil.basename(configuration.filePath)).eql(defaultFileLocation);
                    expect(configuration.getOption('hostname')).eql(options.hostname);
                    expect(configuration.getOption('port1')).eql(options.port1);
                    expect(configuration.getOption('port2')).eql(options.port2);
                    expect(configuration.getOption('src')).eql([ options.src ]);
                    expect(configuration.getOption('browser')).eql(options.browser);
                });
        });
    });
});
