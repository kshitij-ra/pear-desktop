import { t } from '@/i18n';
import promptOptions from '@/providers/prompt-options';
import prompt from 'custom-electron-prompt';

import { defaultWebUIConfig, type WebUIConfig } from './config';

import type { MenuContext } from '@/types/contexts';
import type { MenuTemplate } from '@/menu';

export const onMenu = async ({
    getConfig,
    setConfig,
    window,
}: MenuContext<WebUIConfig>): Promise<MenuTemplate> => {
    return [
        {
            label: t('plugins.web-ui.menu.hostname.label'),
            type: 'normal',
            async click() {
                const config = await getConfig();

                const newHostname =
                    (await prompt(
                        {
                            title: t('plugins.web-ui.prompt.hostname.title'),
                            label: t('plugins.web-ui.prompt.hostname.label'),
                            value: config.hostname,
                            type: 'input',
                            width: 380,
                            ...promptOptions(),
                        },
                        window,
                    )) ??
                    config.hostname ??
                    defaultWebUIConfig.hostname;

                setConfig({ ...config, hostname: newHostname });
            },
        },
        {
            label: t('plugins.web-ui.menu.port.label'),
            type: 'normal',
            async click() {
                const config = await getConfig();

                const newPort =
                    (await prompt(
                        {
                            title: t('plugins.web-ui.prompt.port.title'),
                            label: t('plugins.web-ui.prompt.port.label'),
                            value: config.port,
                            type: 'counter',
                            counterOptions: { minimum: 0, maximum: 65565 },
                            width: 380,
                            ...promptOptions(),
                        },
                        window,
                    )) ??
                    config.port ??
                    defaultWebUIConfig.port;

                setConfig({ ...config, port: newPort });
            },
        },
    ];
};
