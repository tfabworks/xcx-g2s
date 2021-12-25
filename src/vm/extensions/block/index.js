import BlockType from '../../extension-support/block-type';
import ArgumentType from '../../extension-support/argument-type';
import Cast from '../../util/cast';
import translations from './translations.json';
import blockIcon from './block-icon.png';

import Long from 'long';

import FirmataBoard from './firmata-board';

/**
 * Return a Promise which will reject after the delay time passed.
 * @param {number} delay - waiting time to reject in milliseconds
 * @returns {Promise<string>} Promise which will reject with reason after the delay.
 */
const timeoutReject = delay => new Promise((_, reject) => setTimeout(() => reject(`timeout ${delay}ms`), delay));

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
    stringExp = stringExp.trim();
    if (stringExp.length === 0) return [];
    stringExp = stringExp.replaceAll(/[[|\]|"]/g, '');
    const array = [];
    if (stringExp.includes(',')) {
        stringExp.split(',')
            .forEach(numberString => {
                numberString = numberString.trim();
                // remove blank items
                if (numberString.length !== 0){
                    array.push(Number(numberString));
                }
            });
    } else {
        stringExp.split(/\s+/)
            .forEach(item => {
                array.push(Number(item));
            });
    }
    return array;
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

        /**
         * state holder of the all pins
         */
        this.pins = [];
        [9, 10, 11, 14, 15, 16]
            .forEach(pin => {
                this.pins[pin] = {};
            });

        /**
         * shortest interval time between digital input readings
         */
        this.digitalReadInterval = 20;

        /**
         * shortest interval time between analog input readings
         */
        this.analogReadInterval = 20;

        this.serialPortOptions = {
            filters: [
                {usbVendorId: 0x04D8, usbProductId: 0xE83A}, // Licensed for AkaDako
                {usbVendorId: 0x04D8, usbProductId: 0x000A}, // Dev board
                {usbVendorId: 0x04D9, usbProductId: 0xB534} // Use in the future
            ]
        };

        // register to call scan()/connect()
        this.runtime.registerPeripheralExtension(EXTENSION_ID, this);

        this.runtime.on('PROJECT_STOP_ALL', () => {
            this.neoPixelClear();
        });

        /**
         * Waiting time for response of digital input reading in milliseconds.
         */
        this.updateDigitalInputWaitingTime = 100;

        /**
         * Waiting time for response of analog input reading in milliseconds.
         */
        this.analogLevelGetWaitingTime = 100;

        /**
         * Waiting time for response of I2C reading in milliseconds.
         */
        this.i2cReadWaitingTime = 100;

        /**
         * Waiting time for response of OneWire reading in milliseconds.
         */
        this.oneWireReadWaitingTime = 100;
    }

    /**
     * Called by the runtime when user wants to scan for a peripheral.
     * @returns {Promise} - a Promise which resolves when a board was connected
     */
    scan () {
        return this.connectBoard();
    }

    /**
     * Called by the runtime when user wants to cancel scanning or the peripheral was disconnected.
     */
    disconnect () {
        this.disconnectBoard();
    }

    isConnected () {
        if (!this.board) return false;
        return this.board.isReady();
    }

    connectBoard () {
        return this.board.requestPort(EXTENSION_ID, this.serialPortOptions)
            .catch(reason => {
                if (reason) {
                    console.log(reason);
                    return reason;
                }
                return 'fail to connect';
            });
    }

    disconnectBoard () {
        return this.board.disconnect();
    }

    boardStateChanged (args) {
        return (args.STATE === 'connected') === this.isConnected();
    }

    /**
     * Update pin value as a digital input when the last update was too old.
     * @param {number} pin - pin number to read
     * @returns {Promise<boolean>} a Promise which resolves boolean when the response was returned
     */
    updateDigitalInput (pin) {
        if (typeof this.pins[pin].updateTime === 'undefined') {
            this.pins[pin].updateTime = 0;
            this.pins[pin].state = 'ready';
        }
        if (this.pins[pin].state !== 'ready') {
            return Promise.resolve(this.pins[pin].value);
        }
        if ((Date.now() - this.pins[pin].updateTime) > this.digitalReadInterval) {
            this.pins[pin].state = 'digitalReading';
            const request = new Promise(resolve => {
                if (!Number.isInteger(this.pins[pin].inputMode)) {
                    this.pins[pin].inputMode = this.board.MODES.INPUT;
                }
                this.board.pinMode(pin, this.pins[pin].inputMode);
                this.board.digitalRead(
                    pin,
                    value => {
                        this.pins[pin].value = (value !== 0);
                        this.pins[pin].updateTime = Date.now();
                        resolve(this.pins[pin].value);
                    });
            });
            return Promise.race([request, timeoutReject(this.updateDigitalInputWaitingTime)])
                .catch(reason => {
                    console.log(`digitalRead(${pin}) was rejected by ${reason}`);
                    this.pins[pin].value = false;
                    return this.pins[pin].value;
                })
                .finally(() => {
                    this.pins[pin].state = 'ready';
                    return this.pins[pin].value;
                });
        }
        return Promise.resolve(this.pins[pin].value);
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
        if (!this.isConnected()) return false;
        const pin = parseInt(args.CONNECTOR, 10);
        const rise = Cast.toBoolean(args.LEVEL);
        this.updateDigitalInput(pin); // update for the next call
        return rise === this.pins[pin].value; // Do NOT return Promise for the hat execute correctly.
    }

    /**
     * Set input bias of the connector.
     * @param {object} args - the block's arguments.
     * @param {string} args.PIN - number of the pin
     * @param {string} args.BIAS - input bias of the pin [none | pullUp]
     * @returns {undefined} set send message then return immediately
     */
    inputBiasSet (args) {
        if (!this.isConnected()) return;
        const pin = parseInt(args.PIN, 10);
        const pullUp = args.BIAS === 'pullUp';
        this.pins[pin].inputMode = (pullUp ? this.board.MODES.PULLUP : this.board.MODES.INPUT);
        this.board.pinMode(pin, this.pins[pin].inputMode);
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
        const analogPin = parseInt(args.CONNECTOR, 10);
        const pin = analogPin + 14; // GPIO pin number
        if (!Number.isInteger(this.pins[pin].updateTime)) {
            this.pins[pin].updateTime = 0;
            this.pins[pin].state = 'ready';
        }
        if (this.pins[pin].state !== 'ready') {
            return Promise.resolve(this.pins[pin].value);
        }
        if ((Date.now() - this.pins[pin].updateTime) > this.analogReadInterval) {
            this.pins[pin].state = 'analogReading';
            this.board.pinMode(analogPin, this.board.MODES.ANALOG);
            const request = new Promise(resolve => {
                this.board.analogRead(analogPin, value => {
                    this.pins[pin].updateTime = Date.now();
                    this.pins[pin].value = value;
                    resolve(this.pins[pin].value);
                });
            });
            return Promise.race([request, timeoutReject(this.analogLevelGetWaitingTime)])
                .catch(reason => {
                    console.log(`analogRead(${analogPin}) was rejected by ${reason}`);
                    return this.pins[pin].value;
                })
                .finally(() => {
                    this.pins[pin].state = 'ready';
                    return this.pins[pin].value;
                });
        }
        return Promise.resolve(this.pins[pin].value);
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
        const pin = parseInt(args.CONNECTOR, 10);
        const value = Cast.toNumber(args.DEGREE);
        this.board.pinMode(pin, this.board.MODES.SERVO);
        this.board.servoWrite(pin, value);
    }

    i2cWrite (args) {
        if (!this.isConnected()) return;
        const address = Number(args.ADDRESS);
        const register = Number(args.REGISTER);
        const data = readAsNumericArray(args.DATA);
        this.board.i2cWrite(address, register, data);
    }

    i2cReadOnce (args) {
        if (!this.isConnected()) return '';
        const address = Number(args.ADDRESS);
        const register = Number(args.REGISTER);
        const length = parseInt(Cast.toNumber(args.LENGTH), 10);
        const request = new Promise(resolve => {
            this.board.i2cReadOnce(
                address,
                register,
                length,
                data => {
                    resolve(numericArrayToString(data));
                }
            );
        });
        return Promise.race([request, timeoutReject(this.i2cReadWaitingTime)])
            .catch(reason => {
                console.log(`i2cReadOnce(${address}, ${register}, ${length}) was rejected by ${reason}`);
                return '';
            });
    }

    oneWireReset (args) {
        if (!this.isConnected()) return;
        const pin = parseInt(args.CONNECTOR, 10);
        this.board.sendOneWireReset(pin);
    }

    oneWireWrite (args) {
        if (!this.isConnected()) return;
        const pin = parseInt(args.CONNECTOR, 10);
        const data = readAsNumericArray(args.DATA);
        return this.board.oneWireWrite(pin, data)
            .catch(error => {
                console.log(error);
                return error.message ? error.message : error;
            });
    }

    /**
     * Read on OneWire.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @param {BlockUtility} util - utility object provided by the runtime.
     * @returns {Promise<string>} return a Promise which will resolve with read data
     */
    oneWireRead (args, util) {
        if (!this.isConnected()) return Promise.resolve('');
        const pin = parseInt(args.CONNECTOR, 10);
        const length = parseInt(Cast.toNumber(args.LENGTH), 10);
        if (!this.pins[pin].state) {
            this.pins[pin] = {state: 'ready', value: ''};
        }
        if (this.pins[pin].state !== 'ready') {
            if (util) {
                util.yield(); // re-try this call after a while.
                return; // Do not return Promise.resolve() to re-try.
            }
            return Promise.resolve(this.pins[pin].value);
        }
        this.pins[pin].state = 'oneWireReading';
        const request = this.board.oneWireRead(pin, length)
            .then(readData => {
                this.pins[pin].value = numericArrayToString(readData);
                return this.pins[pin].value;
            });
        return Promise.race([request, timeoutReject(this.oneWireReadWaitingTime)])
            .catch(reason => {
                console.log(`oneWireRead(${pin}, ${length}) was rejected by ${reason}`);
                return '';
            })
            .finally(() => {
                this.pins[pin].state = 'ready';
            });
    }

    /**
     * Write then read on OneWire.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @param {BlockUtility} util - utility object provided by the runtime.
     * @returns {Promise<string>} return a Promise which will resolve with read data
     */
    oneWireWriteAndRead (args, util) {
        if (!this.isConnected()) return Promise.resolve('');
        const pin = parseInt(args.CONNECTOR, 10);
        const data = readAsNumericArray(args.DATA);
        const readLength = parseInt(Cast.toNumber(args.LENGTH), 10);
        if (!this.pins[pin].state) {
            this.pins[pin] = {state: 'ready', value: ''};
        }
        if (this.pins[pin].state !== 'ready') {
            if (util) {
                util.yield(); // re-try this call after a while.
                return; // Do not return Promise.resolve() to re-try.
            }
            return Promise.resolve(this.pins[pin].value);
        }
        this.pins[pin].state = 'oneWireWriteAndReading';
        const request = this.board.oneWireWriteAndRead(pin, data, readLength)
            .then(readData => {
                this.pins[pin].value = numericArrayToString(readData);
                return this.pins[pin].value;
            });
        return Promise.race([request, timeoutReject(this.oneWireReadWaitingTime)])
            .catch(reason => {
                console.log(`oneWireWriteAndRead(${pin}, ${data}, ${readLength}) was rejected by ${reason}`);
                return '';
            })
            .finally(() => {
                this.pins[pin].state = 'ready';
            });
    }


    neoPixelConfigStrip (args) {
        if (!this.isConnected()) return Promise.resolve();
        const pin = parseInt(args.CONNECTOR, 10);
        const length = parseInt(Cast.toNumber(args.LENGTH), 10);
        return this.board.neoPixelConfigStrip(pin, length);
    }

    neoPixelShow () {
        if (!this.isConnected()) return Promise.resolve();
        return this.board.neoPixelShow();
    }

    neoPixelSetColor (args) {
        if (!this.isConnected()) return Promise.resolve();
        const index = parseInt(Cast.toNumber(args.POSITION), 10) - 1;
        const r = Math.max(0, Math.min(255, parseInt(Cast.toNumber(args.RED), 10)));
        const g = Math.max(0, Math.min(255, parseInt(Cast.toNumber(args.GREEN), 10)));
        const b = Math.max(0, Math.min(255, parseInt(Cast.toNumber(args.BLUE), 10)));
        return this.board.neoPixelSetColor(index, [r, g, b]);
    }

    neoPixelClear () {
        if (!this.isConnected()) return Promise.resolve();
        return this.board.neoPixelClear();
    }

    numberAtIndex (args) {
        const array = readAsNumericArray(args.ARRAY);
        let index = Number(args.INDEX);
        if (isNaN(index)) {
            index = 0;
        }
        index = Math.min(array.length, Math.max(1, index));
        index = Math.floor(index);
        return array[index - 1];
    }

    spliceNumbers (args) {
        const array = readAsNumericArray(args.ARRAY);
        let index = Number(args.INDEX);
        if (isNaN(index)) {
            index = 0;
        }
        index = Math.floor(index);
        let deleteCount = Number(args.DELETE);
        if (isNaN(deleteCount)) {
            deleteCount = 0;
        }
        deleteCount = Math.min(array.length, Math.max(0, deleteCount));
        deleteCount = Math.floor(deleteCount);
        const newNumbers = readAsNumericArray(args.INSERT);
        array.splice(((index > 0) ? index - 1 : index), deleteCount, ...newNumbers);
        return numericArrayToString(array);
    }

    lengthOfNumbers (args) {
        const array = readAsNumericArray(args.ARRAY);
        return array.length;
    }

    readBytesAs (args) {
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

    bitNot (args) {
        const bits = integer64From(args.VALUE);
        return bits.not().toString();
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
                    opcode: 'inputBiasSet',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.inputBiasSet',
                        default: '[PIN] bias [BIAS]',
                        description: 'set bias of the connector for g2s'
                    }),
                    arguments: {
                        PIN: {
                            type: ArgumentType.STRING,
                            menu: 'inputPinsMenu'
                        },
                        BIAS: {
                            type: ArgumentType.STRING,
                            menu: 'inputBiasMenu'
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
                    opcode: 'spliceNumbers',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'g2s.spliceNumbers',
                        default: '[ARRAY] at [INDEX] delete [DELETE] insert [INSERT]',
                        description: 'splice array'
                    }),
                    arguments: {
                        ARRAY: {
                            type: ArgumentType.STRING,
                            defaultValue: '1.0, 1E1, 0xFF'
                        },
                        INDEX: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '1'
                        },
                        DELETE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '1'
                        },
                        INSERT: {
                            type: ArgumentType.STRING,
                            defaultValue: '-1, 0'
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
                },
                {
                    opcode: 'bitNot',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'g2s.bitNot',
                        default: 'bit NOT [VALUE]',
                        description: 'bitwise NOT'
                    }),
                    arguments: {
                        VALUE: {
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
                inputBiasMenu: {
                    acceptReporters: false,
                    items: this.getInputBiasMenu()
                },
                digitalLevelMenu: {
                    acceptReporters: true,
                    items: this.getDigitalLevelMenu()
                },
                analogConnectorMenu: {
                    acceptReporters: false,
                    items: this.getAnalogConnectorMenu()
                },
                inputPinsMenu: {
                    acceptReporters: true,
                    items: this.getInputPinsMenu()
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

    getInputPinsMenu () {
        const digitalPrefix = formatMessage({
            id: 'g2s.digitalConnector.prefix',
            default: 'Digital'
        });
        const analogPrefix = formatMessage({
            id: 'g2s.analogConnector.prefix',
            default: 'Analog'
        });
        return [
            {
                text: `${digitalPrefix}1`,
                value: '9'
            },
            {
                text: `${digitalPrefix}2`,
                value: '10'
            },
            {
                text: `${digitalPrefix}3`,
                value: '11'
            },
            {
                text: `${analogPrefix}1`,
                value: '14'
            },
            {
                text: `${analogPrefix}2`,
                value: '15'
            },
            {
                text: `${analogPrefix}3`,
                value: '16'
            }
        ];
    }

    getInputBiasMenu () {
        return [
            {
                text: formatMessage({
                    id: 'g2s.inputBiasMenu.none',
                    default: 'none',
                    description: 'label for none in input bias menu for g2s'
                }),
                value: 'none'
            },
            {
                text: formatMessage({
                    id: 'g2s.inputBiasMenu.pullUp',
                    default: 'pull up',
                    description: 'label for pull up in input bias menu for g2s'
                }),
                value: 'pullUp'
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
