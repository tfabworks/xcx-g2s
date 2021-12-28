import {EventEmitter} from 'events';
import FirmataBoard from './firmata-board';

/**
 * Manager object which serves firmata boards.
 */
export class FirmataConnector extends EventEmitter {

    /**
     * Event name for reporting that a board removed.
     * @const {string}
     */
    static get BOARD_REMOVED () {
        return 'BOARD_REMOVED';
    }

    /**
     * Event name for reporting that a board added.
     * @const {string}
     */
    static get BOARD_ADDED () {
        return 'BOARD_ADDED';
    }

    /**
     * Constructor of this instance.
     * @param {Runtime} runtime - Scratch runtime object
     */
    constructor (runtime) {
        super();
        
        /**
         * The Scratch 3.0 runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        /**
         * Available boards
         * @type {Array<FirmataBoard>}
         */
        this.boards = [];
    }

    /**
     * Return connected board which is confirmed with the options.
     * @param {object} options serial port options
     * @param {Array<{usbVendorId, usbProductId}>} options.filters allay of filters
     * @returns {FirmataBoard?} first board which confirmed with options
     */
    findBoard (options) {
        if (this.boards.length === 0) return;
        if (!options || !options.filters) return this.boards[0];
        return this.boards.find(aBoard => (aBoard.isConnected() && options.filters.some(filter =>
            ((filter.usbVendorId === aBoard.portInfo.usbVendorId) &&
                    (filter.usbProductId === aBoard.portInfo.usbProductId)))));
    }

    /**
     * Add a board to the boards holder.
     * @param {FirmataBoard} newBoard the board to be added
     */
    addBoard (newBoard) {
        this.boards.push(newBoard);
        this.emit(FirmataConnector.BOARD_ADDED, newBoard);
    }

    /**
     * Remove a board from the boards holder.
     * @param {FirmataBoard} removal the board to be removed
     */
    removeBoard (removal) {
        const indexOfRemoval = this.boards.indexOf(removal);
        if (indexOfRemoval < 0) return; // not found
        this.boards.splice(indexOfRemoval, 1);
        this.emit(FirmataConnector.BOARD_ADDED, removal);
    }

    /**
     * Return a connected firmata board which is confirmed with the options
     * @param {string} extensionId - ID of the extension which is requesting
     * @param {object} options - serial port options
     * @returns {Promise<FirmataBoard>} a Promise which resolves a connected firmata board or reject with reason
     */
    connect (extensionId, options) {
        if (!('serial' in navigator)) {
            console.log('This browser does not support Web Serial API.');
            return Promise.reject('This browser does not support Web Serial API.');
        }
        const connectedBoard = this.findBoard(options);
        if (connectedBoard) {
            // share a board object
            return Promise.resolve(connectedBoard);
        }
        const newBoard = new FirmataBoard(this.runtime);
        newBoard.once(FirmataBoard.RELEASED, () => {
            this.removeBoard(newBoard);
            this.runtime.emit(this.runtime.constructor.PERIPHERAL_DISCONNECTED, {
                name: newBoard.name,
                path: newBoard.portInfo
            });
        });
        return newBoard.requestPort(extensionId, options)
            .then(connected => {
                this.addBoard(connected);
                return connected;
            });
    }
}

/**
 * Return a shared firmata connector object
 * @param {Runtime} runtime - Scratch runtime object
 * @returns {FirmataConnector} a firmata connector object
 */
export const getFirmataConnector = runtime => {
    if (!runtime.firmataConnector) {
        runtime.firmataConnector = new FirmataConnector(runtime);
    }
    return runtime.firmataConnector;
};
