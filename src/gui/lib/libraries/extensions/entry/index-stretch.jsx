import React from 'react';
import { FormattedMessage } from 'react-intl';

/**
 * This is an extension for Xcratch.
 */

import iconURL from './entry-icon.png';
import insetIconURL from './inset-icon.png';
const version = 'v0.10.0';
const translations =
{
    "en": {
        "g2s.entry.name": "AkaDako",
        "g2s.entry.description": `Connect Grove sensors and actuators. (${version})`
    },
    "ja": {
        "g2s.entry.name": "AkaDako",
        "g2s.entry.description": `Groveのセンサー・アクチュエーターを接続する。 (${version})`
    },
    "ja-Hira": {
        "g2s.entry.name": "AkaDako",
        "g2s.entry.description": `Groveのセンサー・アクチュエーターをせつぞくする。 (${version})`
    }
}

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
    helpLink: 'https://tfabworks.com/akadako/',
    translationMap: translations
};

export { entry }; // loadable-extension needs this line.
export default entry;
