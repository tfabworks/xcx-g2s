import BlockType from '../../extension-support/block-type';
import ArgumentType from '../../extension-support/argument-type';
import Cast from '../../util/cast';
import translations from './translations.json';
import blockIcon from './block-icon.png';

import Long from 'long';

import FirmataBoard from './firmata-board';

export const DEBUG = true;

const integer64From = (value, unsigned) => {
    if (!value) return (unsigned ? Long.UZERO : Long.ZERO);
    let radix = 10;
    if (typeof value === 'string'){
        value = value.trim();
        if (value.length === 0) return (unsigned ? Long.UZERO : Long.ZERO);
        let sign = '';
        if (value[0] === '-') {
            sign = '-';
            value = value.slice(1).trim();
        }
        if (value.includes('0x')) {
            radix = 16;
            value = value.slice(2);
        }
        if (value.includes('0b')) {
            radix = 2;
            value = value.slice(2);
        }
        return Long.fromString((sign + value), unsigned, radix);
    }
    return Long.fromValue(value, unsigned);
};

const numericArrayToString = array => array.join(', ');

const readAsNumericArray = stringExp => {
    if (typeof stringExp !== 'string') return [Number(stringExp)];
    stringExp = stringExp.replaceAll(/[[|\]|"]/g, '');
    if (stringExp.includes(',')) {
        return stringExp.split(',')
            .map(item => Number(item));
    }
    return stringExp.split(/\s+/)
        .map(item => Number(item));
};

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
            default: 'AkaDako',
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

        this.pins = [];
        this.digitalReadInterval = 100;

        this.serialPortOptions = {
            filters: [
                {usbVendorId: 0x04D8, usbProductId: 0xE83A}, // Licensed for AkaDako
                {usbVendorId: 0x04D8, usbProductId: 0x000A}, // Dev board
                {usbVendorId: 0x04D9, usbProductId: 0xB534} // Use in the future
            ]
        };

        // register to call scan()/connect()
        this.runtime.registerPeripheralExtension(EXTENSION_ID, this);

        this.runtime.addListener(this.runtime.constructor.PERIPHERAL_CONNECTED, peripheral => {
            if (!peripheral) return;
            if ((peripheral.name === this.board.name) &&
                (peripheral.portInfo === this.board.portInfo)) {
                // this.startBoardReporting();
            }
        });
        this.runtime.addListener(this.runtime.constructor.PERIPHERAL_DISCONNECTED, peripheral => {
            if (!peripheral) return;
            if ((peripheral.name === this.board.name) &&
                (peripheral.portInfo === this.board.portInfo)) {
                this.runtime.emit(this.runtime.constructor.PERIPHERAL_CONNECTION_LOST_ERROR, {
                    message: `Scratch lost connection to`,
                    extensionId: EXTENSION_ID
                });
            }
        });
        this.runtime.on('PROJECT_STOP_ALL', () => {
            this.neoPixelClear();
        });
    }

    /**
     * Called by the runtime when user wants to scan for a peripheral.
     * @returns {Promise} - a Promise which resolves when a board was connected
     */
    scan () {
        return this.connectBoard();
    }

    /**
     * Called by the runtime when user wants to connect to a certain peripheral.
     * @param {number} id - the id of the peripheral to connect to.
     */
    connect (...args) {
        if (DEBUG) console.log(args);
    }

    /**
     * Called by the runtime when user wants to cancel scanning or the peripheral was disconnected.
     */
    disconnect () {
        if (DEBUG) console.log('disconnect');
        this.disconnectBoard();
    }

    isConnected () {
        if (!this.board) return false;
        return this.board.isReady();
    }

    connectBoard () {
        return this.board.requestPort(EXTENSION_ID, this.serialPortOptions);
    }

    disconnectBoard () {
        return this.board.disconnect();
    }

    // startBoardReporting () {
    // }

    boardStateChanged (args) {
        return (args.STATE === 'connected') === this.isConnected();
    }

    /**
     * Update pin value as a digital input when the last update was too old.
     * @param {number} pin - pin number to read
     * @returns {Promise<boolean>} a Promise which resolves boolean when the response was returned
     */
    updateDigitalInput (pin) {
        if (!this.pins[pin]) {
            this.pins[pin] = {time: 0, level: false};
        }
        if ((Date.now() - this.pins[pin].time) > this.digitalReadInterval) {
            return new Promise(resolve => {
                this.board.digitalRead(
                    pin,
                    value => {
                        this.pins[pin].level = (value !== 0);
                        resolve(this.pins[pin].level);
                    });
            });
        }
        return new Promise.resolve(this.pins[pin].level);
    }

    /**
     * Whether the current level of the connector is HIGHT as digital input.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @returns {Promise} a Promise which resolves boolean when the response was returned
     */
    digitalIsHigh (args) {
        if (!this.isConnected()) return Promise.resolve(false);
        const pin = parseInt(args.CONNECTOR, 10);
        this.board.pinMode(pin, this.board.MODES.INPUT);
        return this.updateDigitalInput(pin);
    }

    /**
     * Detect the edge as digital level of the connector for HAT block.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @param {boolean} args.LEVEL - level to detect edge
     * @returns {boolean} is the level same as the current of the connector
     */
    digitalLevelChanged (args) {
        if (!this.isConnected()) return Promise.resolve(false);
        const pin = parseInt(args.CONNECTOR, 10);
        const rise = Cast.toBoolean(args.LEVEL);
        this.updateDigitalInput(pin); // update for the next call
        return rise === this.pins[pin].level; // Do NOT return Promise for the hat execute correctly.
    }

    /**
     * Set the connector to the level as digital output.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @param {boolean | string | number} args.LEVEL - level to be set
     */
    digitalLevelSet (args) {
        if (!this.isConnected()) return;
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
    analogLevelGet (args) {
        if (!this.isConnected()) return Promise.resolve(0);
        const pin = parseInt(args.CONNECTOR, 10);
        this.board.pinMode(pin, this.board.MODES.ANALOG);
        return new Promise(resolve => {
            this.board.analogRead(pin, value => {
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
    analogLevelSet (args) {
        if (!this.isConnected()) return;
        const pin = parseInt(args.CONNECTOR, 10);
        const percent = Math.min(Math.max(Cast.toNumber(args.LEVEL), 0), 100);
        const value = Math.round((this.board.RESOLUTION.PWM - 0) * (percent / 100));
        this.board.pinMode(pin, this.board.MODES.PWM);
        this.board.pwmWrite(pin, value);
    }

    servoTurn (args) {
        if (DEBUG) console.log(args);
        const pin = parseInt(args.CONNECTOR, 10);
        const value = Cast.toNumber(args.DEGREE);
        this.board.pinMode(pin, this.board.MODES.SERVO);
        this.board.servoWrite(pin, value);
    }

    i2cWrite (args) {
        if (DEBUG) console.log(args);
        if (!this.isConnected()) return;
        const address = Number(args.ADDRESS);
        const register = Number(args.REGISTER);
        const data = readAsNumericArray(args.DATA);
        this.board.i2cWrite(address, register, data);
    }

    i2cReadOnce (args) {
        if (DEBUG) console.log(args);
        if (!this.isConnected()) return;
        const address = Number(args.ADDRESS);
        const register = Number(args.REGISTER);
        const length = parseInt(Cast.toNumber(args.LENGTH), 10);
        return new Promise(resolve => {
            this.board.i2cReadOnce(
                address,
                register,
                length,
                data => {
                    resolve(numericArrayToString(data));
                }
            );
        })
            .catch(reason => {
                console.error(reason);
                return '';
            });
    }

    oneWireReset (args) {
        if (DEBUG) console.log(args);
        if (!this.isConnected()) return;
        const pin = parseInt(args.CONNECTOR, 10);
        this.board.sendOneWireReset(pin);
    }

    oneWireWrite (args) {
        if (DEBUG) console.log(args);
        if (!this.isConnected()) return;
        const pin = parseInt(args.CONNECTOR, 10);
        const data = readAsNumericArray(args.DATA);
        return this.board.oneWireWrite(pin, data)
            .catch(error => {
                console.log(error);
                return error.message ? error.message : error;
            });
    }

    oneWireRead (args) {
        if (DEBUG) console.log(args);
        if (!this.isConnected()) return;
        const pin = parseInt(args.CONNECTOR, 10);
        const length = parseInt(Cast.toNumber(args.LENGTH), 10);
        return this.board.oneWireRead(pin, length)
            .catch(error => {
                console.log(error);
                return error.message ? error.message : error;
            });
    }
    
    oneWireWriteAndRead (args) {
        if (DEBUG) console.log(args);
        if (!this.isConnected()) return;
        const pin = parseInt(args.CONNECTOR, 10);
        const data = readAsNumericArray(args.DATA);
        const readLength = parseInt(Cast.toNumber(args.LENGTH), 10);
        return this.board.oneWireWriteAndRead(pin, data, readLength)
            .then(readData => numericArrayToString(readData))
            .catch(error => {
                console.log(error);
                return error.message ? error.message : error;
            });
    }


    oneWireConfigure (args) {
        if (DEBUG) console.log(args);
        return 'not implemented yet';
    }

    neoPixelConfigStrip (args) {
        if (DEBUG) console.log(args);
        if (!this.isConnected()) return Promise.resolve();
        const pin = parseInt(args.CONNECTOR, 10);
        const length = parseInt(Cast.toNumber(args.LENGTH), 10);
        return this.board.neoPixelConfigStrip(pin, length);
    }

    neoPixelShow (args) {
        if (DEBUG) console.log(args);
        if (!this.isConnected()) return Promise.resolve();
        return this.board.neoPixelShow();
    }

    neoPixelSetColor (args) {
        if (DEBUG) console.log(args);
        if (!this.isConnected()) return Promise.resolve();
        const index = parseInt(Cast.toNumber(args.POSITION), 10) - 1;
        const r = Math.max(0, Math.min(255, parseInt(Cast.toNumber(args.RED), 10)));
        const g = Math.max(0, Math.min(255, parseInt(Cast.toNumber(args.GREEN), 10)));
        const b = Math.max(0, Math.min(255, parseInt(Cast.toNumber(args.BLUE), 10)));
        return this.board.neoPixelSetColor(index, [r, g, b]);
    }

    neoPixelClear (args) {
        if (DEBUG) console.log(args);
        if (!this.isConnected()) return Promise.resolve();
        return this.board.neoPixelClear();
    }

    numberAtIndex (args) {
        const array = readAsNumericArray(args.ARRAY);
        const index = Number(args.INDEX);
        if (isNaN(index) || array.length < index || index < 1) return NaN;
        return array[index - 1];
    }

    lengthOfNumbers (args) {
        const array = readAsNumericArray(args.ARRAY);
        return array.length;
    }

    readBytesAs (args) {
        if (DEBUG) console.log(args);
        try {
            const array = readAsNumericArray(args.ARRAY);
            const buffer = new Uint8Array(array).buffer;
            const dataView = new DataView(buffer);
            const little = (args.ENDIAN === 'little');
            const result = [];
            if (args.TYPE === 'Int16') {
                if (array.length < 2) return '';
                for (let index = 0; index < Math.floor(array.length / 2); index++) {
                    const element = dataView.getInt16(index * 2, little);
                    result[index] = element;
                }
                return numericArrayToString(result);
            }
            if (args.TYPE === 'Uint16') {
                if (array.length < 2) return '';
                for (let index = 0; index < Math.floor(array.length / 2); index++) {
                    const element = dataView.getUint16(index * 2, little);
                    result[index] = element;
                }
                return numericArrayToString(result);
            }
        } catch (error) {
            console.log(error);
        }
        return '';
    }

    int64Operation (args) {
        const op = args.OP;
        const left = integer64From(args.LEFT);
        const right = integer64From(args.RIGHT);
        if (op === '＋') {
            return left.add(right).toString(10);
        }
        if (op === '－') {
            return left.subtract(right).toString(10);
        }
        if (op === '✕') {
            return left.multiply(right).toString(10);
        }
        if (op === '÷') {
            return left.divide(right).toString(10);
        }
        if (op === 'mod') {
            return left.modulo(right).toString(10);
        }
    }

    bitOperation (args) {
        const op = args.OP;
        const left = integer64From(args.LEFT);
        const right = integer64From(args.RIGHT);
        if (op === '<<') {
            return left.shiftLeft(right).toString(10);
        }
        if (op === '>>') {
            return left.shiftRight(right).toString(10);
        }
        if (op === '&') {
            return left.and(right).toString(10);
        }
        if (op === '|') {
            return left.or(right).toString(10);
        }
        if (op === '^') {
            return left.xor(right).toString(10);
        }
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
            showStatusButton: true,
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
                {
                    opcode: 'boardStateChanged',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'g2s.boardStateChanged',
                        default: 'When board is [STATE]',
                        description: 'catch event when the board state was changed'
                    }),
                    arguments: {
                        STATE: {
                            type: ArgumentType.STRING,
                            menu: 'boardStateMenu'
                        }
                    }
                },
                '---',
                {
                    opcode: 'analogLevelGet',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'g2s.analogLevelGet',
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
                    opcode: 'digitalIsHigh',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'g2s.digitalIsHigh',
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
                    opcode: 'digitalLevelChanged',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'g2s.digitalLevelChanged',
                        default: 'When [CONNECTOR] is [LEVEL]',
                        description: 'catch pulse rise/fall of the connector'
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
                    opcode: 'digitalLevelSet',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.digitalLevelSet',
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
                    opcode: 'analogLevelSet',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.analogLevelSet',
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
                },
                '---',
                {
                    opcode: 'servoTurn',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.servoTurn',
                        default: 'Servo [CONNECTOR] turn [DEGREE]',
                        description: 'turn servo motor'
                    }),
                    arguments: {
                        CONNECTOR: {
                            type: ArgumentType.STRING,
                            menu: 'digitalConnectorMenu'
                        },
                        DEGREE: {
                            type: ArgumentType.ANGLE
                        }
                    }
                },
                '---',
                {
                    opcode: 'i2cWrite',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.i2cWrite',
                        default: 'I2C write on [ADDRESS] register [REGISTER] with [DATA]',
                        description: 'write I2C data to the connector'
                    }),
                    arguments: {
                        ADDRESS: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x00'
                        },
                        REGISTER: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x00'
                        },
                        DATA: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x00, 0x00'
                        }
                    }
                },
                {
                    opcode: 'i2cReadOnce',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'g2s.i2cReadOnce',
                        default: 'I2C read [LENGTH] bytes from [ADDRESS] register [REGISTER]',
                        description: 'read I2C data from the connector'
                    }),
                    arguments: {
                        ADDRESS: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x00'
                        },
                        REGISTER: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x00'
                        },
                        LENGTH: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                },
                '---',
                {
                    opcode: 'oneWireReset',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.oneWireReset',
                        default: 'reset OneWire [CONNECTOR]',
                        description: 'Reset OneWire on the connector'
                    }),
                    arguments: {
                        CONNECTOR: {
                            type: ArgumentType.STRING,
                            menu: 'digitalConnectorMenu'
                        }
                    }
                },
                {
                    opcode: 'oneWireWrite',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.oneWireWrite',
                        default: 'OneWire [CONNECTOR] write [DATA]',
                        description: 'write OneWire data to the connector'
                    }),
                    arguments: {
                        CONNECTOR: {
                            type: ArgumentType.STRING,
                            menu: 'digitalConnectorMenu'
                        },
                        DATA: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x00, 0x00'
                        }
                    }
                },
                {
                    opcode: 'oneWireRead',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'g2s.oneWireRead',
                        default: 'OneWire [CONNECTOR] read [LENGTH] bytes',
                        description: 'read OneWire data from the device on the connector'
                    }),
                    arguments: {
                        CONNECTOR: {
                            type: ArgumentType.STRING,
                            menu: 'digitalConnectorMenu'
                        },
                        LENGTH: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                },
                {
                    opcode: 'oneWireWriteAndRead',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'g2s.oneWireWriteAndRead',
                        default: 'OneWire [CONNECTOR] write [DATA] then read [LENGTH] bytes',
                        description: 'write OneWire data then read at the device on the connector'
                    }),
                    arguments: {
                        CONNECTOR: {
                            type: ArgumentType.STRING,
                            menu: 'digitalConnectorMenu'
                        },
                        DATA: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x00, 0x00'
                        },
                        LENGTH: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                },
                '---',
                {
                    opcode: 'neoPixelConfigStrip',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.neoPixelConfigStrip',
                        default: 'NeoPixel [CONNECTOR] length [LENGTH]',
                        description: 'configure NeoPixel on the connector'
                    }),
                    arguments: {
                        CONNECTOR: {
                            type: ArgumentType.STRING,
                            menu: 'digitalConnectorMenu'
                        },
                        LENGTH: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '16'
                        }
                    }
                },
                {
                    opcode: 'neoPixelSetColor',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.neoPixelSetColor',
                        default: 'NeoPixel color [POSITION] R [RED] G [GREEN] B [BLUE]',
                        description: 'set NeoPixel color'
                    }),
                    arguments: {
                        POSITION: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '1'
                        },
                        RED: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '255'
                        },
                        GREEN: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '255'
                        },
                        BLUE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '255'
                        }
                    }
                },
                {
                    opcode: 'neoPixelShow',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.neoPixelShow',
                        default: 'NeoPixel show',
                        description: 'show NeoPixel'
                    }),
                    arguments: {
                    }
                },
                {
                    opcode: 'neoPixelClear',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.neoPixelClear',
                        default: 'NeoPixel clear',
                        description: 'clear NeoPixel'
                    }),
                    arguments: {
                    }
                },
                '---',
                {
                    opcode: 'numberAtIndex',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'g2s.numberAtIndex',
                        default: 'number of [ARRAY] at [INDEX]',
                        description: 'get a number at the index of the array'
                    }),
                    arguments: {
                        ARRAY: {
                            type: ArgumentType.STRING,
                            defaultValue: '1.0, 1E1, 0xFF'
                        },
                        INDEX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '1'
                        }
                    }
                },
                {
                    opcode: 'lengthOfNumbers',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'g2s.lengthOfNumbers',
                        default: 'length of numbers [ARRAY]',
                        description: 'get length of an Array in string'
                    }),
                    arguments: {
                        ARRAY: {
                            type: ArgumentType.STRING,
                            defaultValue: '1.0, 1E1, 0xFF'
                        }
                    }
                },
                {
                    opcode: 'readBytesAs',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'g2s.readBytesAs',
                        default: 'read bytes [ARRAY] as [TYPE] [ENDIAN]',
                        description: 'read typed value from bytes'
                    }),
                    arguments: {
                        ARRAY: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x00, 0xFF, 0xFF, 0x00'
                        },
                        TYPE: {
                            type: ArgumentType.STRING,
                            menu: 'bytesTypeMenu'
                        },
                        ENDIAN: {
                            type: ArgumentType.STRING,
                            menu: 'endianMenu'
                        }
                    }
                },
                {
                    opcode: 'int64Operation',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'g2s.int64Operation',
                        default: 'int64 [LEFT] [OP] [RIGHT]',
                        description: 'bitwise operation'
                    }),
                    arguments: {
                        OP: {
                            type: ArgumentType.STRING,
                            menu: 'int64OperationMenu'
                        },
                        LEFT: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x01'
                        },
                        RIGHT: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x02'
                        }
                    }
                },
                {
                    opcode: 'bitOperation',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'g2s.bitOperation',
                        default: 'bit [LEFT] [OP] [RIGHT]',
                        description: 'bitwise operation'
                    }),
                    arguments: {
                        OP: {
                            type: ArgumentType.STRING,
                            menu: 'bitOperationMenu'
                        },
                        LEFT: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x03'
                        },
                        RIGHT: {
                            type: ArgumentType.STRING,
                            defaultValue: '0x01'
                        }
                    }
                }
            ],
            menus: {
                boardStateMenu: {
                    acceptReporters: false,
                    items: this.getBoardStateMenu()
                },
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
                },
                oneWireDeviceMenu: {
                    acceptReporters: false,
                    items: this.getOneWireDeviceMenu()
                },
                bytesTypeMenu: {
                    acceptReporters: false,
                    items: ['Int16', 'Uint16']
                },
                endianMenu: {
                    acceptReporters: false,
                    items: ['little', 'big']
                },
                int64OperationMenu: {
                    acceptReporters: false,
                    items: ['＋', '－', '✕', '÷', 'mod']
                },
                bitOperationMenu: {
                    acceptReporters: false,
                    items: ['<<', '>>', '&', '|', '^']
                }
            }
        };
    }

    getBoardStateMenu () {
        return [
            {
                text: formatMessage({
                    id: 'g2s.boardState.connected',
                    default: 'connected'
                }),
                value: 'connected'
            },
            {
                text: formatMessage({
                    id: 'g2s.boardState.disconnected',
                    default: 'disconnected'
                }),
                value: 'disconnected'
            }
        ];
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

    getOneWireDeviceMenu () {
        const prefix = formatMessage({
            id: 'g2s.oneWireDevice.prefix',
            default: 'Device'
        });
        return [
            {
                text: `${prefix}1`,
                value: '1'
            },
            {
                text: `${prefix}2`,
                value: '2'
            },
            {
                text: `${prefix}3`,
                value: '3'
            },
            {
                text: `${prefix}4`,
                value: '4'
            }
        ];
    }
}

export {
    ExtensionBlocks as default,
    ExtensionBlocks as blockClass
};
