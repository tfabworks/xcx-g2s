import bindTransport from './firmata-io';
import SerialPort from '@serialport/stream';
import WSABinding from 'web-serial-binding';

// Setup transport of Firmata.
SerialPort.Binding = WSABinding;
const FirmataClass = bindTransport(SerialPort);

// eslint-disable-next-line prefer-const
export let DEBUG = true;

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
        return new Promise(resolve => {
            this.port.open(error => {
                if (error) {
                    this.releaseBoard();
                    resolve(`${error}`);
                    return;
                }
                this.board.once('ready', () => {
                    this.onBoarReady();
                    resolve(`connected to ${JSON.stringify(this.portInfo)}`);
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

    releaseBoard () {
        this.state = 'disconnect';
        if (this.port && this.port.isOpen) {
            this.port.close();
        }
        this.port = null;
        this.board = null;
        this.oneWireDevices = null;
    }

    disconnect () {
        this.releaseBoard();
        // this.runtime.emit(this.runtime.constructor.PERIPHERAL_DISCONNECTED, {
        //     name: this.name,
        //     path: this.portInfo
        // });
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
