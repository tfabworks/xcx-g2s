/**
 * This is an extension for Xcratch.
 */

import iconURL from './entry-icon.png';
import insetIconURL from './inset-icon.png';
import translations from './translations.json';

const version = 'v0.13.0';

/**
 * Formatter to translate the messages in this extension.
 * This will be replaced which is used in the React component.
 * @param {object} messageData - data for format-message
 * @returns {string} - translated message for the current locale
 */
let formatMessage = messageData => messageData.defaultMessage;

const entry = {
    get name () {
        return `${formatMessage({
            defaultMessage: 'AkaDako',
            description: 'Name for the "AkaDako" extension',
            id: 'g2s.entry.name'
        })} (${version})`;
    },
    extensionId: 'g2s',
    extensionURL: 'https://tfabworks.github.io/xcx-g2s/dist/g2s.mjs',
    collaborator: 'TFabWorks',
    iconURL: iconURL,
    insetIconURL: insetIconURL,
    get description () {
        return formatMessage({
            defaultMessage: 'Connect Grove sensors and actuators.',
            description: 'Description for the "AkaDako" extension',
            id: 'g2s.entry.description'
        });
    },
    featured: true,
    disabled: false,
    bluetoothRequired: false,
    internetConnectionRequired: false,
    helpLink: 'https://akadako.com/',
    setFormatMessage: formatter => {
        formatMessage = formatter;
    },
    translationMap: translations
};

export {entry}; // loadable-extension needs this line.
export default entry;
