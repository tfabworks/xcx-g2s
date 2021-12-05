import bindTransport from './firmata-io';
import SerialPort from '@serialport/stream';
import WSABinding from 'web-serial-binding';
import {
    START_SYSEX,
    END_SYSEX,
    FIRMATA_7BIT_MASK,
    COLOR_ORDER,
    PIXEL_COMMAND,
    PIXEL_CONFIG,
    PIXEL_SET_PIXEL,
    PIXEL_SHOW
} from './node-pixel/lib/constants';


// Setup transport of Firmata.
SerialPort.Binding = WSABinding;
const FirmataClass = bindTransport(SerialPort);

// eslint-disable-next-line prefer-const
export let DEBUG = true;

const neoPixelGammaTable = ((steps, gamma) => {
    const gammaTable = new Array(steps);
    for (let i = 0; i < steps; i++) {
        gammaTable[i] = Math.floor((Math.pow((i / 255.0), gamma) * 255) + 0.5);
    }
    return gammaTable;
})(256, 2.8);

const neoPixelColorValue = (colors, gammaTable) => {
    // colors are assumed to be an array of [r, g, b] bytes
    // colorValue returns a packed value able to be pushed to firmata rather than
    // text values.
    // if gammaTable is passed then it should use the supplied gamma
    // correction table to correct the received value.

    // before sending, account for gamma correction.
    const gammaCorrectedColor = Object.assign({}, colors);
    gammaCorrectedColor[0] = gammaTable[gammaCorrectedColor[0]];
    gammaCorrectedColor[1] = gammaTable[gammaCorrectedColor[1]];
    gammaCorrectedColor[2] = gammaTable[gammaCorrectedColor[2]];
    return (
        (gammaCorrectedColor[0] << 16) +
        (gammaCorrectedColor[1] << 8) +
        (gammaCorrectedColor[2])
    );
};

class FirmataBoard {

    /**
     * Construct a G2SBoard communication object.
     * @param {Runtime} runtime - the Scratch runtime
     */
    constructor (runtime) {
        this.name = 'FirmataBoard';

        /**
         * The Scratch runtime to register event listeners.
         * @type {Runtime}
         * @private
         */
        this.runtime = runtime;

        /**
         * The Firmata board for reading/writing peripheral data.
         * @type {Board}
         * @private
         */
        this.board = null;

        /**
         * The serial port for transporting of Firmata.
         */
        this.port = null;

        this.portInfo = null;

        this.neoPixel = null;
    }

    async requestPort () {
        if (this.port) return;
        this.state = 'portRequesting';
        const nativePort = await navigator.serial.requestPort();
        this.port = new SerialPort(nativePort, {
            baudRate: 57600, // firmata: 57600
            autoOpen: false
        });
        this.portInfo = this.port.path.getInfo();
        this.board = new FirmataClass(this.port);
        this.board.once('connect', () => {
            this.state = 'connect';
        });
        this.board.once('close', error => {
            if (this.state === 'disconnect') return;
            if (error) {
                this.handleDisconnectError(error);
            } else {
                this.releaseBoard();
            }
        });
        if (DEBUG) {
            this.port.addListener('data', data => {
                console.log(data);
            });
        }
        return new Promise((resolve, reject) => {
            this.port.open(error => {
                if (error) {
                    this.releaseBoard();
                    reject(error);
                    return;
                }
                this.board.once('ready', () => {
                    this.onBoarReady();
                    resolve(this.portInfo);
                });
            });
        });
    }

    onBoarReady () {
        const firmInfo = this.board.firmware;
        console.log(
            `${firmInfo.name}-${firmInfo.version.major}.${firmInfo.version.minor}`
        );
        this.board.i2cConfig();
        this.state = 'ready';
        // this.runtime.emit(this.runtime.constructor.PERIPHERAL_CONNECTED, {
        //     name: this.name,
        //     path: this.portInfo
        // });
    }

    isConnected () {
        return (this.state === 'connect' || this.state === 'ready');
    }

    isReady () {
        return this.state === 'ready';
    }

    async releaseBoard () {
        this.state = 'disconnect';
        this.neoPixel = null;
        if (this.port && this.port.isOpen) {
            this.port.close();
        }
        this.port = null;
        this.board = null;
        this.oneWireDevices = null;
        this.runtime.emit(this.runtime.constructor.PERIPHERAL_DISCONNECTED, {
            name: this.name,
            path: this.portInfo
        });
    }

    disconnect () {
        this.releaseBoard();
    }

    /**
     * Handle an error resulting from losing connection to a peripheral.
     * This could be due to:
     * - unplug the connector
     * - being powered down
     *
     * Disconnect the device, and if the extension using this object has a
     * reset callback, call it.
     *
     * @param {*} error - cause of the error
     * @returns {undefined}
     */
    handleDisconnectError (error) {
        console.err(error);
        if (this.state === 'disconnect') return;
        this.disconnect();
    }

    pinMode (pin, mode) {
        return this.board.pinMode(pin, mode);
    }

    digitalRead (pin, callback) {
        return this.board.digitalRead(pin, callback);
    }

    reportDigitalPin (pin, value) {
        return this.board.reportDigitalPin(pin, value);
    }

    digitalWrite (pin, value, enqueue) {
        return this.board.digitalWrite(pin, value, enqueue);
    }

    pwmWrite (pin, value) {
        return this.board.pwmWrite(pin, value);
    }

    servoWrite (...args) {
        return this.board.servoWrite(...args);
    }

    analogRead (pin, callback) {
        return this.board.analogRead(pin, callback);
    }

    reportAnalogPin (pin, value) {
        return this.board.reportAnalogPin(pin, value);
    }

    i2cWrite (address, registerOrData, inBytes) {
        return this.board.i2cWrite(address, registerOrData, inBytes);
    }

    i2cRead (address, register, bytesToRead, callback) {
        return this.board.i2cRead(address, register, bytesToRead, callback);
    }

    i2cStop (options) {
        return this.board.i2cStop(options);
    }

    i2cReadOnce (address, register, bytesToRead, callback) {
        return this.board.i2cReadOnce(address, register, bytesToRead, callback);
    }

    sendOneWireReset (pin) {
        return this.board.sendOneWireReset(pin);
    }

    searchOneWireDevices (pin) {
        return new Promise((resolve, reject) => {
            if (this.board.pins[pin].mode !== this.board.MODES.ONEWIRE) {
                this.board.sendOneWireConfig(pin, true);
                return this.board.sendOneWireSearch(pin, (error, founds) => {
                    if (error) return reject(error);
                    if (founds.length < 1) return reject(new Error('no device'));
                    this.board.pinMode(pin, this.board.MODES.ONEWIRE);
                    this.oneWireDevices = founds;
                    this.board.sendOneWireDelay(pin, 1);
                    resolve(this.oneWireDevices);
                });
            }
            resolve(this.oneWireDevices);
        });
    }

    oneWireWrite (pin, data) {
        return this.searchOneWireDevices(pin)
            .then(devices => {
                this.board.sendOneWireWrite(pin, devices[0], data);
            });
    }

    oneWireRead (pin, length) {
        return this.searchOneWireDevices(pin)
            .then(devices =>
                new Promise((resolve, reject) => {
                    this.board.sendOneWireRead(pin, devices[0], length, (readError, data) => {
                        if (readError) return reject(readError);
                        resolve(data);
                    });
                }));
    }

    oneWireWriteAndRead (pin, data, numBytesToRead) {
        return this.searchOneWireDevices(pin)
            .then(devices =>
                new Promise((resolve, reject) => {
                    this.board.sendOneWireWriteAndRead(pin, devices[0], data, numBytesToRead, (readError, readData) => {
                        if (readError) return reject(readError);
                        resolve(readData);
                    });
                }));
    }

    neoPixelConfigStrip (pin, length) {
        // now send the config message with length and data point.
        this.neoPixel = {pin: pin, length: length};
        const data = new Array(7);
        data[0] = START_SYSEX;
        data[1] = PIXEL_COMMAND;
        data[2] = PIXEL_CONFIG;
        data[3] = ((COLOR_ORDER.GRB << 5) | pin);
        data[4] = (length & FIRMATA_7BIT_MASK);
        data[5] = ((length >> 7) & FIRMATA_7BIT_MASK);
        data[6] = (END_SYSEX);
        return new Promise(
            resolve => {
                this.port.write(data, () => resolve());
            });
    }

    neoPixelSetColor (index, color) {
        if (!this.neoPixel) return Promise.resolve();
        const address = Math.min(this.neoPixel.length, Math.max(0, index));
        const colorValue = neoPixelColorValue(color, neoPixelGammaTable);
        const data = new Array(10);
        data[0] = (START_SYSEX);
        data[1] = (PIXEL_COMMAND);
        data[2] = (PIXEL_SET_PIXEL);
        data[3] = (address & FIRMATA_7BIT_MASK);
        data[4] = ((address >> 7) & FIRMATA_7BIT_MASK);
        data[5] = (colorValue & FIRMATA_7BIT_MASK);
        data[6] = ((colorValue >> 7) & FIRMATA_7BIT_MASK);
        data[7] = ((colorValue >> 14) & FIRMATA_7BIT_MASK);
        data[8] = ((colorValue >> 21) & FIRMATA_7BIT_MASK);
        data[9] = (END_SYSEX);
        return new Promise(
            resolve => {
                this.port.write(data, () => resolve());
            });
    }

    async neoPixelClear () {
        if (!this.neoPixel) return Promise.resolve();
        for (let index = 0; index < this.neoPixel.length; index++) {
            await this.neoPixelSetColor(index, [0, 0, 0]);
        }
        return this.neoPixelShow();
    }

    neoPixelShow () {
        const data = [];
        data[0] = START_SYSEX;
        data[1] = PIXEL_COMMAND;
        data[2] = PIXEL_SHOW;
        data[3] = END_SYSEX;
        return new Promise(
            resolve => {
                this.port.write(data, () => resolve());
            });
    }

    get MODES () {
        return this.board.MODES;
    }

    get HIGH () {
        return this.board.HIGH;
    }

    get LOW () {
        return this.board.LOW;
    }

    get RESOLUTION () {
        return this.board.RESOLUTION;
    }
}

export default FirmataBoard;
