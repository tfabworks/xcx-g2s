import React from 'react';
import {FormattedMessage} from 'react-intl';

/**
 * This is an extension for Xcratch.
 */

import iconURL from './entry-icon.png';
import insetIconURL from './inset-icon.png';
import version from './version';

const translations =
{
    'en': {
        'g2s.entry.name': 'AkaDako',
        'g2s.entry.description': `Connect Grove sensors and actuators. (v${version})`
    },
    'ja': {
        'g2s.entry.name': 'AkaDako',
        'g2s.entry.description': `Groveのセンサー・アクチュエーターを接続する。 (v${version})`
    },
    'ja-Hira': {
        'g2s.entry.name': 'AkaDako',
        'g2s.entry.description': `Groveのセンサー・アクチュエーターを接続する。 (v${version})`
    }
};

const entry = {
    name: (
        <FormattedMessage
            defaultMessage="AkaDako"
            description="Name for the 'AkaDako' extension"
            id="g2s.entry.name"
        />
    ),
    extensionId: 'g2s',
    extensionURL: null,
    collaborator: 'TFabWorks',
    iconURL: iconURL,
    insetIconURL: insetIconURL,
    description: (
        <FormattedMessage
            defaultMessage="Connect Grove sensors and actuators."
            description="Description for the 'AkaDako' extension"
            id="g2s.entry.description"
        />
    ),
    featured: true,
    disabled: false,
    bluetoothRequired: false,
    internetConnectionRequired: false,
    helpLink: 'https://akadako.com/',
    translationMap: translations
};

export default entry;
