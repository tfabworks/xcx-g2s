import formatMessage from 'format-message';

/**
 * This is an extension for Xcratch.
 */

import iconURL from './entry-icon.png';
import insetIconURL from './inset-icon.png';
import translations from './translations.json';

const version = 'v0.11.0';

const entry = {
    get name () {
        return `${formatMessage({
            defaultMessage: 'AkaDako',
            description: 'Name for the "AkaDako" extension',
            id: 'g2s.entry.name'
        })} (${version})`;
    },
    extensionId: 'g2s',
    extensionURL: null,
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
    helpLink: 'https://tfabworks.com/akadako/',
    translationMap: translations
};

export default entry;
