import BlockType from '../../extension-support/block-type';
import ArgumentType from '../../extension-support/argument-type';
import Cast from '../../util/cast';
import translations from './translations.json';
import blockIcon from './block-icon.png';

import FirmataBoard from './firmata-board';

/**
 * Formatter which is used for translation.
 * This will be replaced which is used in the runtime.
 * @param {object} messageData - format-message object
 * @returns {string} - message for the locale
 */
let formatMessage = messageData => messageData.defaultMessage;

/**
 * Setup format-message for this extension.
 */
const setupTranslations = () => {
    const localeSetup = formatMessage.setup();
    if (localeSetup && localeSetup.translations[localeSetup.locale]) {
        Object.assign(
            localeSetup.translations[localeSetup.locale],
            translations[localeSetup.locale]
        );
    }
};

const EXTENSION_ID = 'g2s';

/**
 * URL to get this extension as a module.
 * When it was loaded as a module, 'extensionURL' will be replaced a URL which is retrieved from.
 * @type {string}
 */
let extensionURL = 'https://tfabworks.github.io/xcx-g2s/dist/g2s.mjs';

/**
 * Scratch 3.0 blocks for example of Xcratch.
 */
class ExtensionBlocks {

    /**
     * @return {string} - the name of this extension.
     */
    static get EXTENSION_NAME () {
        return formatMessage({
            id: 'g2s.name',
            default: 'Grove',
            description: 'name of the extension'
        });
    }

    /**
     * @return {string} - the ID of this extension.
     */
    static get EXTENSION_ID () {
        return EXTENSION_ID;
    }

    /**
     * URL to get this extension.
     * @type {string}
     */
    static get extensionURL () {
        return extensionURL;
    }

    /**
     * Set URL to get this extension.
     * The extensionURL will be changed to the URL of the loading server.
     * @param {string} url - URL
     */
    static set extensionURL (url) {
        extensionURL = url;
    }

    /**
     * Construct a set of blocks for Grove.
     * @param {Runtime} runtime - the Scratch 3.0 runtime.
     */
    constructor (runtime) {
        /**
         * The Scratch 3.0 runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        if (runtime.formatMessage) {
            // Replace 'formatMessage' to a formatter which is used in the runtime.
            formatMessage = runtime.formatMessage;
        }

        this.board = new FirmataBoard(runtime);

        this.runtime.addListener(this.runtime.constructor.PERIPHERAL_CONNECTED, peripheral => {
            if ((peripheral.name === this.board.name) &&
                (peripheral.path === this.board.portPath)) {
                // this.startBoardReporting();
            }
        });
        this.runtime.addListener(this.runtime.constructor.PERIPHERAL_DISCONNECTED, peripheral => {
            if ((peripheral.name === this.board.name) &&
                (peripheral.path === this.board.portPath)) {
                this.runtime.emit(this.runtime.constructor.PERIPHERAL_CONNECTION_LOST_ERROR, {
                    message: `Scratch lost connection to`,
                    extensionId: EXTENSION_ID
                });
            }
        });
    }


    isConnected () {
        return this.board.isConnected();
    }

    connectBoard () {
        return this.board.requestPort();
    }

    disconnectBoard () {
        return this.board.disconnect();
    }

    // startBoardReporting () {
    // }

    /**
     * Whether the level of the connector is HIGHT as digital input.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @returns {Promise} - a Promise which resolves boolean when the response was returned
     */
    isDigitalHight (args) {
        if (!this.board.isConnected()) return Promise.resolve(false);
        const pin = parseInt(args.CONNECTOR, 10);
        this.board.pinMode(pin, this.board.MODES.INPUT);
        return new Promise(resolve => {
            this.board.digitalRead(pin, value => {
                // `board.digitalRead()` starts reporting automatically, so it should be stopped.
                this.board.reportDigitalPin(pin, 0);
                resolve(value !== 0);
            });
        });
    }

    /**
     * Set the connector to the level as digital output.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @param {boolean | string | number} args.LEVEL - level to be set
     */
    setDigitalLevel (args) {
        if (!this.board.isConnected()) return;
        const pin = parseInt(args.CONNECTOR, 10);
        const value = Cast.toBoolean(args.LEVEL) ? this.board.HIGH : this.board.LOW;
        this.board.pinMode(pin, this.board.MODES.OUTPUT);
        this.board.digitalWrite(pin, value);
    }

    /**
     * The level of the connector as analog input.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @returns {Promise} - a Promise which resolves analog level when the response was returned
     */
    getAnalogLevel (args) {
        if (!this.board.isConnected()) return Promise.resolve(0);
        const pin = parseInt(args.CONNECTOR, 10);
        this.board.pinMode(pin, this.board.MODES.ANALOG);
        return new Promise(resolve => {
            this.board.analogRead(pin, value => {
                // `board.analogRead()` starts reporting automatically, so it should be stopped.
                this.board.reportAnalogPin(pin, 0);
                resolve(value);
            });
        });
    }

    /**
     * Set the connector to power (%) as PWM.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @param {string | number} args.LEVEL - power (%) of PWM
     */
    setAnalogLevel (args) {
        if (!this.board.isConnected()) return;
        const pin = parseInt(args.CONNECTOR, 10);
        const percent = Math.min(Math.max(Cast.toNumber(args.LEVEL), 0), 100);
        const value = Math.round((this.board.RESOLUTION.PWM - 0) * (percent / 100));
        this.board.pinMode(pin, this.board.MODES.PWM);
        this.board.pwmWrite(pin, value);
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        setupTranslations();
        return {
            id: ExtensionBlocks.EXTENSION_ID,
            name: ExtensionBlocks.EXTENSION_NAME,
            extensionURL: ExtensionBlocks.extensionURL,
            blockIconURI: blockIcon,
            showStatusButton: false,
            blocks: [
                {
                    opcode: 'connectBoard',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.connectBoard',
                        default: 'connect board',
                        description: 'open serial port and connect a board'
                    }),
                    arguments: {
                    }
                },
                {
                    opcode: 'disconnectBoard',
                    blockType: BlockType.COMMAND,
                    blockAllThreads: false,
                    text: formatMessage({
                        id: 'g2s.disconnectBoard',
                        default: 'disconnect board',
                        description: 'disconnect the board'
                    }),
                    arguments: {
                    }
                },
                {
                    opcode: 'isConnected',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'g2s.isConnected',
                        default: 'board is connected',
                        description: 'firmata board is connected'
                    }),
                    arguments: {
                    }
                },
                '---',
                {
                    opcode: 'isDigitalHight',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'g2s.isDigitalHight',
                        default: '[CONNECTOR] is HIGH',
                        description: 'whether the digital level of the connector is high or not'
                    }),
                    arguments: {
                        CONNECTOR: {
                            type: ArgumentType.STRING,
                            menu: 'digitalConnectorMenu'
                        }
                    }
                },
                {
                    opcode: 'setDigitalLevel',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.setDigitalLevel',
                        default: '[CONNECTOR] to digital [LEVEL]',
                        description: 'set digital level of the connector'
                    }),
                    arguments: {
                        CONNECTOR: {
                            type: ArgumentType.STRING,
                            menu: 'digitalConnectorMenu'
                        },
                        LEVEL: {
                            type: ArgumentType.STRING,
                            menu: 'digitalLevelMenu'
                        }
                    }
                },
                {
                    opcode: 'getAnalogLevel',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'g2s.getAnalogLevel',
                        default: 'level of analog [CONNECTOR]',
                        description: 'report analog level of the connector'
                    }),
                    arguments: {
                        CONNECTOR: {
                            type: ArgumentType.STRING,
                            menu: 'analogConnectorMenu'
                        }
                    }
                },
                {
                    opcode: 'setAnalogLevel',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.setAnalogLevel',
                        default: '[CONNECTOR] to analog [LEVEL]',
                        description: 'set analog level of the connector'
                    }),
                    arguments: {
                        CONNECTOR: {
                            type: ArgumentType.STRING,
                            menu: 'pwmConnectorMenu'
                        },
                        LEVEL: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                }
            ],
            menus: {
                digitalConnectorMenu: {
                    acceptReporters: false,
                    items: this.getDigitalConnectorMenu()
                },
                digitalLevelMenu: {
                    acceptReporters: true,
                    items: this.getDigitalLevelMenu()
                },
                analogConnectorMenu: {
                    acceptReporters: false,
                    items: this.getAnalogConnectorMenu()
                },
                pwmConnectorMenu: {
                    acceptReporters: false,
                    items: this.getDigitalConnectorMenu()
                }
            }
        };
    }

    getDigitalConnectorMenu () {
        const prefix = formatMessage({
            id: 'g2s.digitalConnector.prefix',
            default: 'Digital'
        });
        return [
            {
                text: `${prefix}1`,
                value: '9'
            },
            {
                text: `${prefix}2`,
                value: '10'
            },
            {
                text: `${prefix}3`,
                value: '11'
            }
        ];
    }

    getDigitalLevelMenu () {
        return [
            {
                text: formatMessage({
                    id: 'g2s.digitalLevelMenu.low',
                    default: 'Low',
                    description: 'label for low value in digital output menu for g2s'
                }),
                value: 'false'
            },
            {
                text: formatMessage({
                    id: 'g2s.digitalLevelMenu.high',
                    default: 'High',
                    description: 'label for high value in digital output menu for g2s'
                }),
                value: 'true'
            }
        ];
    }

    getAnalogConnectorMenu () {
        const prefix = formatMessage({
            id: 'g2s.analogConnector.prefix',
            default: 'Analog'
        });
        return [
            {
                text: `${prefix}1`,
                value: '0'
            },
            {
                text: `${prefix}2`,
                value: '1'
            },
            {
                text: `${prefix}3`,
                value: '2'
            }
        ];
    }
}

export {
    ExtensionBlocks as default,
    ExtensionBlocks as blockClass
};
