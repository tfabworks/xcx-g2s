import BlockType from '../../extension-support/block-type';
import ArgumentType from '../../extension-support/argument-type';
import Cast from '../../util/cast';
import translations from './translations.json';
import blockIcon from './block-icon.png';

import Long from 'long';

import {FirmataConnector, getFirmataConnector} from './firmata-connector';
import VL53L0X from './vl53l0x';
import ADXL345 from './adxl345';

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

        /**
         * Current connected board object with firmata protocol
         * @type {FirmataBoard}
         */
        this.board = null;

        /**
         * Distance sensor VL53L0X
         * @type {VL53L0X}
         */
        this.vl53l0x = null;

        /**
         * Manager of firmata boards
         * @type {FirmataConnector}
         */
        this.firmataConnector = getFirmataConnector(runtime);
        this.firmataConnector.addListener(FirmataConnector.BOARD_ADDED, () => this.updateBoard());
        this.firmataConnector.addListener(FirmataConnector.BOARD_REMOVED, () => this.updateBoard());

        /**
         * state holder of the all pins
         */
        this.pins = [];
        [6, 9, 10, 11, 14, 15, 16, 17]
            .forEach(pin => {
                this.pins[pin] = {};
            });

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
    }

    /**
     * Update connected board
     */
    updateBoard () {
        if (this.board && this.board.isConnected()) return;
        const prev = this.board;
        this.board = this.firmataConnector.findBoard(this.serialPortOptions);
        if (prev === this.board) return;
        this.vl53l0x = null;
        this.adxl345 = null;
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
        if (this.board && this.board.isConnected()) return; // Already connected
        return this.firmataConnector.connect(EXTENSION_ID, this.serialPortOptions)
            .then(connectedBoard => {
                this.runtime.emit(this.runtime.constructor.PERIPHERAL_CONNECTED, {
                    name: connectedBoard.name,
                    path: connectedBoard.portInfo
                });
                return 'connected';
            })
            .catch(reason => {
                if (reason) {
                    console.log(reason);
                    return reason;
                }
                return `fail to connect port: ${JSON.stringify(this.serialPortOptions)}`;
            });
    }

    disconnectBoard () {
        if (!this.board) return;
        return this.board.disconnect();
    }

    boardStateChanged (args) {
        return (args.STATE === 'connected') === this.isConnected();
    }

    /**
     * Get the digital level of the pin
     * @param {number} pin - pin number to get
     * @returns {Promise<number>} a Promise which resolves digital value [0|1] of the pin
     */
    getDigitalLevel (pin) {
        if (!this.isConnected()) return Promise.resolve(0);
        return this.board.updateDigitalInput(pin)
            .catch(reason => {
                console.log(`digitalRead(${pin}) was rejected by ${reason}`);
                return false;
            });
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
        return this.getDigitalLevel(pin)
            .then(readData => !!readData);
    }

    /**
     * The level of digital A1 connector
     * @returns {Promise} - a Promise which resolves digital level of the pin
     */
    digitalLevelA1 () {
        return this.getDigitalLevel(10);
    }

    /**
     * The level of digital A2 connector
     * @returns {Promise} - a Promise which resolves digital level of the pin
     */
    digitalLevelA2 () {
        return this.getDigitalLevel(11);
    }

    /**
     * The level of digital B1 connector
     * @returns {Promise} - a Promise which resolves digital level of the pin
     */
    digitalLevelB1 () {
        return this.getDigitalLevel(6);
    }

    /**
     * The level of digital B2 connector
     * @returns {Promise} - a Promise which resolves digital level of the pin
     */
    digitalLevelB2 () {
        return this.getDigitalLevel(9);
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
        this.board.updateDigitalInput(pin) // update for the next call
            .catch(reason => {
                console.log(`digitalRead(${pin}) was rejected by ${reason}`);
            });
        return rise === !!this.board.pins[pin].value; // Do NOT return Promise for the hat execute correctly.
    }

    /**
     * Set input bias of the connector.
     * @param {object} args - the block's arguments.
     * @param {string} args.PIN - number of the pin
     * @param {string} args.BIAS - input bias of the pin [none | pullUp]
     * @returns {Promise} a Promise which resolves when the message was sent
     */
    inputBiasSet (args) {
        if (!this.isConnected()) return;
        const pin = parseInt(args.PIN, 10);
        const pullUp = args.BIAS === 'pullUp';
        return this.board.setInputBias(pin, pullUp);
    }

    /**
     * Set the connector to the level as digital output.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @param {boolean | string | number} args.LEVEL - level to be set
     * @returns {Promise} a Promise which resolves when the message was sent
     */
    digitalLevelSet (args) {
        if (!this.isConnected()) return;
        const pin = parseInt(args.CONNECTOR, 10);
        const value = Cast.toBoolean(args.LEVEL) ? this.board.HIGH : this.board.LOW;
        this.board.pinMode(pin, this.board.MODES.OUTPUT);
        return this.board.digitalWrite(pin, value);
    }

    /**
     * The level (0...100) of the connector as analog input.
     * @param {number} analogPin - pin number of the connector
     * @returns {Promise} - a Promise which resolves analog level when the response was returned
     */
    getAnalogLevel (analogPin) {
        if (!this.isConnected()) return Promise.resolve(0);
        return this.board.updateAnalogInput(analogPin)
            .then(raw => Math.round((raw / 1023) * 1000) / 10)
            .catch(reason => {
                console.log(`analogRead(${analogPin}) was rejected by ${reason}`);
                return 0;
            });
    }

    /**
     * The level of analog A1 connector
     * @returns {Promise} - a Promise which resolves analog level when the response was returned
     */
    analogLevelA1 () {
        return this.getAnalogLevel(0);
    }

    /**
     * The level of analog A2 connector
     * @returns {Promise} - a Promise which resolves analog level when the response was returned
     */
    analogLevelA2 () {
        return this.getAnalogLevel(1);
    }

    /**
     * The level of analog B1 connector
     * @returns {Promise} - a Promise which resolves analog level when the response was returned
     */
    analogLevelB1 () {
        return this.getAnalogLevel(2);
    }

    /**
     * The level of analog A1 connector
     * @returns {Promise} - a Promise which resolves analog level when the response was returned
     */
    analogLevelB2 () {
        return this.getAnalogLevel(3);
    }

    /**
     * Set the connector to power (%) as PWM.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @param {string | number} args.LEVEL - power (%) of PWM
     * @returns {Promise} a Promise which resolves when the message was sent
     */
    analogLevelSet (args) {
        if (!this.isConnected()) return;
        const pin = parseInt(args.CONNECTOR, 10);
        const percent = Math.min(Math.max(Cast.toNumber(args.LEVEL), 0), 100);
        const value = Math.round(this.board.RESOLUTION.PWM * (percent / 100));
        this.board.pinMode(pin, this.board.MODES.PWM);
        return this.board.pwmWrite(pin, value);
    }

    /**
     * Turn the servo motor to the degrees.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @param {number} args.DEGREE - degrees to the servo to turn
     * @returns {Promise} a Promise which resolves when the message was sent
     */
    servoTurn (args) {
        const pin = parseInt(args.CONNECTOR, 10);
        const value = Cast.toNumber(args.DEGREE);
        this.board.pinMode(pin, this.board.MODES.SERVO);
        return this.board.servoWrite(pin, value);
    }

    /**
     * Write data to register
     * @param {object} args - the block's arguments.
     * @param {number} args.ADDRESS - I2C address
     * @param {number} args.REGISTER - register which write to
     * @param {Array<number>} args.DATA - bytes to be written
     * @returns {Promise} a Promise which resolves when the message was sent
     */
    i2cWrite (args) {
        if (!this.isConnected()) return;
        const address = Number(args.ADDRESS);
        const register = Number(args.REGISTER);
        const data = readAsNumericArray(args.DATA);
        return this.board.i2cWrite(address, register, data);
    }

    i2cReadOnce (args) {
        if (!this.isConnected()) return '';
        const address = Number(args.ADDRESS);
        const register = Number(args.REGISTER);
        const length = parseInt(Cast.toNumber(args.LENGTH), 10);
        return this.board.i2cReadOnce(address, register, length)
            .then(data => numericArrayToString(data))
            .catch(reason => {
                console.log(`i2cReadOnce(${address}, ${register}, ${length}) was rejected by ${reason}`);
                return '';
            });
    }

    /**
     * Reset OneWire modules on the pin
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @returns {Promise} a Promise which resolves when the message was sent
     */
    oneWireReset (args) {
        if (!this.isConnected()) return;
        const pin = parseInt(args.CONNECTOR, 10);
        return this.board.sendOneWireReset(pin);
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
    oneWireRead (args) {
        if (!this.isConnected()) return Promise.resolve('');
        const pin = parseInt(args.CONNECTOR, 10);
        const length = parseInt(Cast.toNumber(args.LENGTH), 10);
        return this.board.oneWireRead(pin, length)
            .then(readData => numericArrayToString(readData))
            .catch(reason => {
                console.log(`oneWireRead(${pin}, ${length}) was rejected by ${reason}`);
                return '';
            });
    }

    /**
     * Write then read on OneWire.
     * @param {object} args - the block's arguments.
     * @param {number} args.CONNECTOR - pin number of the connector
     * @param {BlockUtility} util - utility object provided by the runtime.
     * @returns {Promise<string>} return a Promise which will resolve with read data
     */
    oneWireWriteAndRead (args) {
        if (!this.isConnected()) return Promise.resolve('');
        const pin = parseInt(args.CONNECTOR, 10);
        const data = readAsNumericArray(args.DATA);
        const readLength = parseInt(Cast.toNumber(args.LENGTH), 10);
        return this.board.oneWireWriteAndRead(pin, data, readLength)
            .then(readData => numericArrayToString(readData))
            .catch(reason => {
                console.log(`oneWireWriteAndRead(${pin}, ${data}, ${readLength}) was rejected by ${reason}`);
                return '';
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

    async measureDistanceVL53L () {
        if (!this.isConnected()) return 0;
        if (!this.vl53l0x) {
            let newSensor = new VL53L0X(this.board);
            const found = await newSensor.init(true);
            if (!found) return 0;
            await newSensor.startContinuous()
                .catch(reason => {
                    console.log(`fail to VL53L0X.startContinuous() by ${reason}`);
                    newSensor = null;
                });
            if (!newSensor) return 0;
            this.vl53l0x = newSensor;
        }
        const distance = await this.vl53l0x.readRangeContinuousMillimeters()
            .catch(reason => {
                console.log(`VL53L0X.readRangeContinuousMillimeters() was rejected by ${reason}`);
                this.vl53l0x = null;
                return 0;
            });
        return distance;
    }

    /**
     * Get acceleration for the axis by ADXL345
     * @param {object} args - the block's arguments.
     * @param {number} args.AXIS - axis to get
     * @returns {Promise<number>} return a Promise which resolves acceleration
     */
    async getAccelerationADXL345 (args) {
        if (!this.isConnected()) return Promise.resolve(0);
        const axis = args.AXIS;
        if (!this.adxl345) {
            const newSensor = new ADXL345(this.board);
            try {
                await newSensor.init();
            } catch (error) {
                // fail to create instance
                console.log(error);
                return Promise.resolve(0);
            }
            this.adxl345 = newSensor;
        }
        return this.adxl345.getAcceleration()
            .then(acceleration => {
                if (axis === 'absolute') {
                    return Math.round(
                        Math.sqrt(
                            (acceleration.x ** 2) +
                            (acceleration.y ** 2) +
                            (acceleration.z ** 2)
                        ) * 100) / 100;
                }
                return acceleration[axis];
            })
            .catch(reason => {
                console.log(`ADXL345.getAcceleration() was rejected by ${reason}`);
                this.adxl345 = null;
                return 0;
            });
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
                    opcode: 'analogLevelA1',
                    blockType: BlockType.REPORTER,
                    disableMonitor: false,
                    text: formatMessage({
                        id: 'g2s.analogLevelA1',
                        default: 'level of analog A1',
                        description: 'report analog level of the connector'
                    }),
                    arguments: {
                    }
                },
                {
                    opcode: 'analogLevelA2',
                    blockType: BlockType.REPORTER,
                    disableMonitor: false,
                    text: formatMessage({
                        id: 'g2s.analogLevelA2',
                        default: 'level of analog A2',
                        description: 'report analog level of the connector'
                    }),
                    arguments: {
                    }
                },
                {
                    opcode: 'analogLevelB1',
                    blockType: BlockType.REPORTER,
                    disableMonitor: false,
                    text: formatMessage({
                        id: 'g2s.analogLevelB1',
                        default: 'level of analog B1',
                        description: 'report analog level of the connector'
                    }),
                    arguments: {
                    }
                },
                {
                    opcode: 'analogLevelB2',
                    blockType: BlockType.REPORTER,
                    disableMonitor: false,
                    text: formatMessage({
                        id: 'g2s.analogLevelB2',
                        default: 'level of analog B2',
                        description: 'report analog level of the connector'
                    }),
                    arguments: {
                    }
                },
                '---',
                {
                    opcode: 'digitalLevelA1',
                    blockType: BlockType.REPORTER,
                    disableMonitor: false,
                    text: formatMessage({
                        id: 'g2s.digitalLevelA1',
                        default: 'level of digital A1',
                        description: 'report digital level of the connector'
                    }),
                    arguments: {
                    }
                },
                {
                    opcode: 'digitalLevelA2',
                    blockType: BlockType.REPORTER,
                    disableMonitor: false,
                    text: formatMessage({
                        id: 'g2s.digitalLevelA2',
                        default: 'level of digital A2',
                        description: 'report digital level of the connector'
                    }),
                    arguments: {
                    }
                },
                {
                    opcode: 'digitalLevelB1',
                    blockType: BlockType.REPORTER,
                    disableMonitor: false,
                    text: formatMessage({
                        id: 'g2s.digitalLevelB1',
                        default: 'level of digital B1',
                        description: 'report digital level of the connector'
                    }),
                    arguments: {
                    }
                },
                {
                    opcode: 'digitalLevelB2',
                    blockType: BlockType.REPORTER,
                    disableMonitor: false,
                    text: formatMessage({
                        id: 'g2s.digitalLevelB2',
                        default: 'level of digital B2',
                        description: 'report digital level of the connector'
                    }),
                    arguments: {
                    }
                },
                '---',
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
                        default: 'full color LED [CONNECTOR] length [LENGTH]',
                        description: 'configure full color LED on the connector'
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
                        default: 'full color LED [POSITION] R [RED] G [GREEN] B [BLUE]',
                        description: 'set full color LED color'
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
                        default: 'full color LED show',
                        description: 'show full color LED'
                    }),
                    arguments: {
                    }
                },
                {
                    opcode: 'neoPixelClear',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'g2s.neoPixelClear',
                        default: 'full color LED clear',
                        description: 'clear full color LED'
                    }),
                    arguments: {
                    }
                },
                '---',
                {
                    opcode: 'measureDistance',
                    func: 'measureDistanceVL53L',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'g2s.measureDistance',
                        default: 'distance (mm)',
                        description: 'report distance'
                    }),
                    arguments: {
                    }
                },
                '---',
                {
                    opcode: 'getAcceleration',
                    func: 'getAccelerationADXL345',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'g2s.getAcceleration',
                        default: 'acceleration [AXIS] (m/s^2)',
                        description: 'report acceleration'
                    }),
                    arguments: {
                        AXIS: {
                            type: ArgumentType.STRING,
                            menu: 'accelerationAxisMenu'
                        }
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
                inputPinsMenu: {
                    acceptReporters: true,
                    items: this.getInputPinsMenu()
                },
                pwmConnectorMenu: {
                    acceptReporters: false,
                    items: this.getDigitalConnectorMenu()
                },
                accelerationAxisMenu: {
                    acceptReporters: false,
                    items: this.getAccelerationAxisMenu()
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
        const digitalPrefix = formatMessage({
            id: 'g2s.digitalConnector.prefix',
            default: 'Digital'
        });
        return [
            {
                text: `${digitalPrefix} A1`,
                value: '10'
            },
            {
                text: `${digitalPrefix} A2`,
                value: '11'
            },
            {
                text: `${digitalPrefix} B1`,
                value: '6'
            },
            {
                text: `${digitalPrefix} B2`,
                value: '9'
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
                text: `${digitalPrefix} A1`,
                value: '10'
            },
            {
                text: `${digitalPrefix} A2`,
                value: '11'
            },
            {
                text: `${digitalPrefix} B1`,
                value: '6'
            },
            {
                text: `${digitalPrefix} B2`,
                value: '9'
            },
            {
                text: `${analogPrefix} A1`,
                value: '0'
            },
            {
                text: `${analogPrefix} A2`,
                value: '1'
            },
            {
                text: `${analogPrefix} B1`,
                value: '2'
            },
            {
                text: `${analogPrefix} B2`,
                value: '3'
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

    getAccelerationAxisMenu () {
        return [
            {
                text: formatMessage({
                    id: 'g2s.accelerationAxisMenu.x',
                    default: 'x'
                }),
                value: 'x'
            },
            {
                text: formatMessage({
                    id: 'g2s.accelerationAxisMenu.y',
                    default: 'y'
                }),
                value: 'y'
            },
            {
                text: formatMessage({
                    id: 'g2s.accelerationAxisMenu.z',
                    default: 'z'
                }),
                value: 'z'
            },
            {
                text: formatMessage({
                    id: 'g2s.accelerationAxisMenu.absolute',
                    default: 'absolute'
                }),
                value: 'absolute'
            }
        ];
    }
}

export {
    ExtensionBlocks as default,
    ExtensionBlocks as blockClass
};
