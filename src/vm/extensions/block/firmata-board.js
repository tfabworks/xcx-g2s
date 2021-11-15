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
        if (this.isConnected()) return;
        this.port = new SerialPort('wsa://default', {
            baudRate: 57600, // firmata: 57600
            autoOpen: false
        });
        this.portPath = this.port.path;
        this.board = new FirmataClass(this.port);
        this.board.once('ready', () => {
            console.log('READY!');
            console.log(
                `${this.board.firmware.name}-${this.board.firmware.version.major}.${this.board.firmware.version.minor}`
            );
            this.runtime.emit(this.runtime.constructor.PERIPHERAL_CONNECTED, {
                name: this.name,
                path: this.portPath
            });
        });
        this.onDisconnect = this.onDisconnect.bind(this);
        this.board.addListener('disconnect', this.onDisconnect);
        // for DEBUG
        this.port.on('data', data => {
            console.log(data);
        });
        return this.port.open();
    }

    isConnected () {
        return (!!this.port && this.port.isOpen);
    }

    release () {
        if (this.port && this.port.isOpen) {
            this.port.close();
        }
        if (this.board) {
            this.board.removeListener('disconnect', this.onDisconnect);
        }
        this.port = null;
        this.board = null;
    }

    disconnect () {
        this.release();
        this.runtime.emit(this.runtime.constructor.PERIPHERAL_DISCONNECTED, {
            name: this.name,
            path: this.portPath
        });
    }

    onDisconnect (error) {
        if (error) {
            this.handleDisconnectError(error);
        } else {
            this.release();
        }
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
        if (!this.isConnected()) return;
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

    get MODES () {
        return this.board.MODES;
    }

    get HIGH () {
        return this.board.HIGH;
    }

    get LOW () {
        return this.board.LOW;
    }
}

export default FirmataBoard;
