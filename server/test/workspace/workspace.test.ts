import path = require('path');

import { createDocumentByPath } from '../../src/UC/indexer';
import { CORE_PACKAGE } from '../../src/UC/Symbols';

describe('Initialize workspace', () => {
    const pathToObject = path.resolve(__dirname, '..', 'Core', 'Classes', 'Object.uc');
    createDocumentByPath(pathToObject, CORE_PACKAGE);
});