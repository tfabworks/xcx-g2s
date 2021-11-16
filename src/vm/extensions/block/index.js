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
    formatMessage.setup({
        translations: translations
    });
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


    getDigitalConnectors () {
        return [2, 3, 4, 5, 6, 7, 8,
            13 // for test
        ];
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
     * Get level of the connector as digital input.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - connector to be set
     * @returns {Promise} - a Promise which resolves when the response was returned
     */
    getDigitalLevel (args) {
        if (!this.board.isConnected()) return Promise.resolve(0);
        const pin = parseInt(args.CONNECTOR, 10);
        this.board.pinMode(pin, this.board.MODES.INPUT);
        return new Promise(resolve => {
            this.board.digitalRead(pin, value => {
                // `board.digitalRead()` starts reporting automatically, so it should be stopped.
                this.board.reportDigitalPin(pin, 0);
                resolve(value);
            });
        });
    }

    /**
     * Set the connector to the level as digital output.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - connector to be set
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
                    blockAllThreads: false,
                    text: formatMessage({
                        id: 'g2s.connectBoard',
                        default: 'connect board',
                        description: 'open serial port and connect a board'
                    }),
                    func: 'connectBoard',
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
                    func: 'disconnectBoard',
                    arguments: {
                    }
                },
                {
                    opcode: 'isConnected',
                    blockType: BlockType.BOOLEAN,
                    blockAllThreads: false,
                    text: formatMessage({
                        id: 'g2s.isConnected',
                        default: 'board is connected',
                        description: 'firmata board is connected'
                    }),
                    func: 'isConnected',
                    arguments: {
                    }
                },
                '---',
                {
                    opcode: 'getDigitalLevel',
                    blockType: BlockType.REPORTER,
                    blockAllThreads: false,
                    text: formatMessage({
                        id: 'g2s.getDigitalLevel',
                        default: 'level of [CONNECTOR]',
                        description: 'report digital level of the connector'
                    }),
                    func: 'getDigitalLevel',
                    arguments: {
                        CONNECTOR: {
                            type: ArgumentType.STRING,
                            menu: 'digitalConnectorMenu',
                            defaultValue: 2
                        }
                    }
                },
                {
                    opcode: 'setDigitalLevel',
                    blockType: BlockType.COMMAND,
                    blockAllThreads: false,
                    text: formatMessage({
                        id: 'g2s.setDigitalLevel',
                        default: '[CONNECTOR] to [LEVEL]',
                        description: 'set digital level of the connector'
                    }),
                    func: 'setDigitalLevel',
                    arguments: {
                        CONNECTOR: {
                            type: ArgumentType.STRING,
                            menu: 'digitalConnectorMenu',
                            defaultValue: 2
                        },
                        LEVEL: {
                            type: ArgumentType.STRING,
                            menu: 'digitalLevelMenu',
                            defaultValue: 'false'
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
                }
            }
        };
    }

    getDigitalConnectorMenu () {
        return this.getDigitalConnectors().map(
            pinIndex =>
                Object.create({
                    text: `D${pinIndex.toString()}`,
                    value: pinIndex.toString()
                })
        );
    }

    getDigitalLevelMenu () {
        return [
            {
                text: formatMessage({
                    id: 'g2s.digitalLevelMenu.Low',
                    default: 'Low',
                    description: 'label for low value in digital output menu for g2s'
                }),
                value: 'false'
            },
            {
                text: formatMessage({
                    id: 'g2s.digitalLevelMenu.High',
                    default: 'High',
                    description: 'label for high value in digital output menu for g2s'
                }),
                value: 'true'
            }
        ];
    }
}

export {
    ExtensionBlocks as default,
    ExtensionBlocks as blockClass
};
