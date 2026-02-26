import { createPlugin } from '@/utils';
import { t } from '@/i18n';

import { defaultWebUIConfig } from './config';
import { onMenu } from './menu';
import { backend } from './backend';

export default createPlugin({
    name: () => t('plugins.web-ui.name'),
    description: () => t('plugins.web-ui.description'),
    restartNeeded: false,
    config: defaultWebUIConfig,
    addedVersion: '3.6.X',
    menu: onMenu,

    backend,
});
