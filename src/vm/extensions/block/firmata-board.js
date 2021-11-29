import bindTransport from './firmata-io';
import SerialPort from '@serialport/stream';
import WSABinding from 'serialport-binding-webserialapi';

// Setup transport of Firmata.
SerialPort.Binding = WSABinding;
const FirmataClass = bindTransport(SerialPort);


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

        this.portPath = null;
    }

    requestPort () {
        if (this.port) return;
        this.state = 'portRequesting';
        this.port = new SerialPort('wsa://default', {
            baudRate: 57600, // firmata: 57600
            autoOpen: false
        });
        this.portPath = this.port.path;
        this.board = new FirmataClass(this.port);
        this.board.once('connect', () => {
            this.state = 'connect';
        });
        this.board.once('disconnect', error => {
            if (this.state === 'disconnect') return;
            if (error) {
                this.handleDisconnectError(error);
            } else {
                this.releaseBoard();
            }
        });
        // for DEBUG
        this.port.addListener('data', data => {
            console.log(data);
        });
        return new Promise(resolve => {
            this.port.open(error => {
                if (error) {
                    this.releaseBoard();
                    resolve(`${error}`);
                    return;
                }
                this.board.once('ready', () => {
                    this.onBoarReady();
                    resolve(`connected to ${this.port.path}`);
                });
            });
        });
    }

    onBoarReady () {
        const firmInfo = this.board.firmware;
        console.log(
            `${firmInfo.name}-${firmInfo.version.major}.${firmInfo.version.minor}`
        );
        this.state = 'ready';
        // this.runtime.emit(this.runtime.constructor.PERIPHERAL_CONNECTED, {
        //     name: this.name,
        //     path: this.portPath
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
    }

    disconnect () {
        this.releaseBoard();
        // this.runtime.emit(this.runtime.constructor.PERIPHERAL_DISCONNECTED, {
        //     name: this.name,
        //     path: this.portPath
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

    analogRead (pin, callback) {
        return this.board.analogRead(pin, callback);
    }

    reportAnalogPin (pin, value) {
        return this.board.reportAnalogPin(pin, value);
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
