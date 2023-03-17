/**
 * This is a class to represent a servo motor
 */
export default class Servo {

    /**
     * Constructor of Servo instance.
     * @param {AkadakoBoard} board - connecting akadako board
     * @param {number} pin - the pin the servo is connected to
     */
    constructor (board, pin) {
        /**
         * Connecting akadako board
         * @type {import('./akadako-board').default}
         */
        this.board = board;

        /**
         * The pin the servo is connected
         * @type {number}
         */
        this.pin = pin;

        /**
         * This servo is busy or not
         * @type {boolean}
         */
        this.isBusy = false;

        /**
         * Current angle of this servo arm
         * @type {number}
         */
        this.angle = 0;
    }

    /**
     * Turn this to the angle
     * @param {number} angle - degree to turn
     * @returns {Promise} a Promise which resolves when the message was sent
     */
    turn (angle) {
        let servoValue = 90 - angle; // convert from zero centered clockwise
        servoValue = Math.min(180, Math.max(0, servoValue));
        this.board.pinMode(this.pin, this.board.MODES.SERVO);
        return this.board.servoWrite(this.pin, servoValue);
    }

    /**
     * Turn this to the angle with the speed
     * @param {number} angle - degree to turn
     * @param {number} speed - turn speed
     */
    async turnWithSpeed (angle, speed) {
        if (speed <= 0) return; // Do not rotate when the speed is zero or less.
        speed = Math.min(100, speed);
        angle = Math.min(90, Math.max(-90, angle));
        const startAngle = this.angle;
        const step = Math.round(Math.abs(angle - startAngle) / 180) * (100 / (speed / 6));
        const stepAngle = (angle - startAngle) / step;
        for (let i = 0; i < step; i++) {
            this.angle += stepAngle;
            await this.turn(this.angle);
        }
    }
}
