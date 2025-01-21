import fs from 'fs';
import { log } from '../utils/logger.js';

export class OrderManager {
    constructor(accounts) {
        this.accounts = Array.from(accounts.values());
        
        // Читаем и парсим конфигурацию
        const configContent = fs.readFileSync('config.txt', 'utf8');
        const lines = configContent.split('\n');
        this.config = {
            tickers: [],
            leverages: [],
            amount: { min: 0, max: 0 }
        };

        for (const line of lines) {
            if (line.trim()) {
                if (line.startsWith('TICKERS=')) {
                    const tickersStr = line.split('=')[1].trim();
                    this.config.tickers = tickersStr.replace(/['"]/g, '').split(',').map(t => t.trim());
                } else if (line.startsWith('LEVERAGES=')) {
                    const leveragesStr = line.split('=')[1].trim();
                    this.config.leverages = leveragesStr.replace(/['"]/g, '').split(',').map(l => parseInt(l.trim()));
                } else if (line.startsWith('AMOUNT_MIN=')) {
                    this.config.amount.min = parseFloat(line.split('=')[1].trim());
                } else if (line.startsWith('AMOUNT_MAX=')) {
                    this.config.amount.max = parseFloat(line.split('=')[1].trim());
                }
            }
        }
    }

    getPairedAccounts() {
        if (this.accounts.length % 2 !== 0) {
            throw new Error('Количество аккаунтов должно быть четным');
        }

        const shuffled = [...this.accounts].sort(() => Math.random() - 0.5);
        
        const pairs = [];
        for (let i = 0; i < shuffled.length; i += 2) {
            pairs.push([shuffled[i], shuffled[i + 1]]);
        }
        
        return pairs;
    }

    async sendPairedOrders(botUsername) {
        try {
            const pairs = this.getPairedAccounts();
            
            await Promise.all(pairs.map(async pair => {
                const baseParams = {
                    ticker: this.config.tickers[Math.floor(Math.random() * this.config.tickers.length)],
                    leverage: this.config.leverages[Math.floor(Math.random() * this.config.leverages.length)],
                    amount: (Math.random() * (this.config.amount.max - this.config.amount.min) + 
                            this.config.amount.min).toFixed(2)
                };

                const account1Name = pair[0].username || pair[0].firstName || pair[0].phoneNumber;
                const account2Name = pair[1].username || pair[1].firstName || pair[1].phoneNumber;

                const tableData = [
                    {
                        'Аккаунт': account1Name,
                        'Позиция': 'LONG',
                        'Токен': baseParams.ticker,
                        'Плечо': `${baseParams.leverage}x`,
                        'Количество': baseParams.amount
                    },
                    {
                        'Аккаунт': account2Name,
                        'Позиция': 'SHORT',
                        'Токен': baseParams.ticker,
                        'Плечо': `${baseParams.leverage}x`,
                        'Количество': baseParams.amount
                    }
                ];

                log('Открытие новых позиций:', 'info');
                console.table(tableData);

                const longCommand = `/long ${baseParams.ticker} ${baseParams.leverage}x ${baseParams.amount}`;
                const shortCommand = `/short ${baseParams.ticker} ${baseParams.leverage}x ${baseParams.amount}`;

                await Promise.all([
                    this.sendCommand(pair[0], botUsername, longCommand),
                    this.sendCommand(pair[1], botUsername, shortCommand)
                ]);

                const stopLossParams = {
                    stopLossTakeProfit: Math.floor(Math.random() * 6 + 5),
                }

                log(`Установка Stop Loss для пары аккаунтов...`, 'wait');
                await Promise.all([
                    this.setStopLoss(pair[0], botUsername, baseParams.ticker, stopLossParams),
                    this.setStopLoss(pair[1], botUsername, baseParams.ticker, stopLossParams)
                ]);
            }));
            
        } catch (error) {
            log('Ошибка при отправке парных ордеров: ' + error, 'error');
        }
    }

    async sendCommand(account, botUsername, orderCommand) {
        const accountName = account.username || account.firstName || account.phoneNumber;
        try {
            const [direction, ticker, leverage, amount] = orderCommand.split(' ');
            const orderType = direction.replace('/', '').toUpperCase(); 
            const leverageValue = leverage.replace('x', 'X');

            log(`[${accountName}] Отправка команды: ${orderCommand}`, 'info');
            await account.client.sendMessage(botUsername, {
                message: orderCommand
            });

            // Пытаемся найти сообщение несколько раз
            for (let attempt = 1; attempt <= 3; attempt++) {
                log(`[${accountName}] Попытка ${attempt} найти сообщение...`, 'debug');
                
                // Ждем ответа от бота
                await new Promise(resolve => setTimeout(resolve, 5000));

                // Получаем сообщения
                const messages = await account.client.getMessages(botUsername, { limit: 5 });
                
                if (messages.length === 0) {
                    log(`[${accountName}] Нет сообщений для проверки`, 'error');
                    continue;
                }

                const messagePromises = messages.map(message => new Promise((resolve, reject) => {
                    const messageText = message?.message || '';
                    
                    if (!messageText || messageText.startsWith('/')) {
                        reject('Пропуск сообщения');
                        return;
                    }
                    
                    log(`[${accountName}] Сообщение для проверки: ${messageText}`, 'debug');
                    
                    const hasConfirmButton = message?.replyMarkup?.rows?.some(row => 
                        row.buttons?.some(btn => 
                            btn.text === 'Confirm' || 
                            btn.text === '✅ Confirm'
                        )
                    );
                    
                    const isOrderPreview = messageText.includes('👀 Order Preview');
                    const hasMarket = messageText.includes(`Market: ${orderType}`);
                    const hasTicker = messageText.includes(ticker.toUpperCase());
                    const hasLeverage = messageText.includes(`Leverage: ${leverageValue}`);
                    
                    log(`[${accountName}] Проверки: Preview=${isOrderPreview}, Market=${hasMarket}, Ticker=${hasTicker}, Leverage=${hasLeverage}, Button=${hasConfirmButton}`, 'debug');

                    if (isOrderPreview && hasMarket && hasTicker && hasLeverage && hasConfirmButton) {
                        log(`[${accountName}] Найдено подходящее сообщение`, 'debug');
                        resolve(message);
                    } else {
                        reject(`Сообщение не подходит`);
                    }
                }));

                try {
                    const message = await Promise.any(messagePromises);
                    if (message) {
                        const clicked = await this.clickConfirmButton(message, accountName);
                        if (clicked) {
                            log(`[${accountName}] Ордер успешно подтвержден`, 'success');
                            return true;
                        }
                    }
                } catch (error) {
                    log(`[${accountName}] Попытка ${attempt}: сообщения не подходят`, 'debug');
                    continue;
                }
            }

            log(`[${accountName}] Не удалось найти нужное сообщение после всех попыток`, 'error');
            return false;

        } catch (error) {
            log(`[${accountName}] Ошибка при отправке ордера: ${error}`, 'error');
            return false;
        }
    }

    async sendSimpleCommand(account, botUsername, command) {
        const accountName = account.username || account.firstName || account.phoneNumber;
        try {
            log(`[${accountName}] Отправка команды: ${command}`, 'info');
            await account.client.sendMessage(botUsername, {
                message: command
            });
            return true;
        } catch (error) {
            log(`[${accountName}] Ошибка при отправке команды: ${error}`, 'error');
            return false;
        }
    }

    async waitForButtonMessage(account, botUsername) {
        const accountName = account.username || account.firstName || account.phoneNumber;
        for (let i = 0; i < 5; i++) {
            const messages = await account.client.getMessages(botUsername, {
                limit: 5
            });
            
            for (const message of messages) {
                if (message?.buttons || 
                    (message?.replyMarkup?.rows && message.replyMarkup.rows.length > 0)) {
                    return message;
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return null;
    }

    async waitForSpecificMessage(account, botUsername) {
        const accountName = account.username || account.firstName || account.phoneNumber;
        for (let i = 0; i < 7; i++) {
            const messages = await account.client.getMessages(botUsername, {
                limit: 3
            });
            
            for (const message of messages) {
                if (message?.message?.includes('Set a stop loss') || 
                    message?.message?.includes('Set a take profit') ||
                    message?.message?.includes('Pick a %')) {
                    return message;
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        log(`[${accountName}] Не удалось найти сообщение SL/TP`, 'warning');
        return null;
    }

    async setStopLoss(account, botUsername, ticker, params) {
        const accountName = account.username || account.firstName || account.phoneNumber;
        try {
            // Отправляем команду стоплосса
            log(`[${accountName}] Отправка команды стоплосса: /stoploss ${ticker}`, 'info');
            await account.client.sendMessage(botUsername, {
                message: `/stoploss ${ticker}`
            });
            await new Promise(resolve => setTimeout(resolve, 3000));

            for (let attempt = 1; attempt <= 5; attempt++) {
                const messages = await account.client.getMessages(botUsername, { limit: 10 });
                const messagePromises = messages.map(message => new Promise((resolve, reject) => {
                    const messageText = message?.message || '';
                    
                    if (!messageText) {
                        reject('Пустое сообщение');
                        return;
                    }

                    if ((messageText.includes('Set a stop loss') || 
                         messageText.includes('Pick a % or trigger price')) &&
                        message?.replyMarkup?.rows?.some(row => 
                            row.buttons?.some(btn => 
                                btn.text === 'Set %' || 
                                btn.text === 'Set Price'
                            )
                        )) {
                        resolve(message);
                    } else {
                        reject('Сообщение не подходит');
                    }
                }));

                try {
                    const slMessage = await Promise.any(messagePromises);
                    
                    const setButton = slMessage.replyMarkup.rows
                        .find(row => row.buttons.some(btn => 
                            btn.text === 'Set %' || 
                            btn.text === 'Set Price'
                        ))
                        .buttons.find(btn => 
                            btn.text === 'Set %' || 
                            btn.text === 'Set Price'
                        );
                    
                    await slMessage.click(setButton);
                    await new Promise(resolve => setTimeout(resolve, 4000));
                    
                    await account.client.sendMessage(botUsername, {
                        message: params.stopLossTakeProfit.toString()
                    });
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    const confirmMessages = await account.client.getMessages(botUsername, { limit: 5 });
                    const confirmPromises = confirmMessages.map(message => new Promise((resolve, reject) => {
                        if (message?.replyMarkup?.rows?.some(row => 
                            row.buttons?.some(btn => 
                                btn.text.includes('✅') || 
                                btn.text.toLowerCase().includes('confirm')
                            )
                        )) {
                            resolve(message);
                        } else {
                            reject('Нет кнопки подтверждения');
                        }
                    }));

                    const confirmMessage = await Promise.any(confirmPromises);
                    const confirmButton = confirmMessage.replyMarkup.rows
                        .find(row => row.buttons.some(btn => 
                            btn.text.includes('✅') || 
                            btn.text.toLowerCase().includes('confirm')
                        ))
                        .buttons.find(btn => 
                            btn.text.includes('✅') || 
                            btn.text.toLowerCase().includes('confirm')
                        );
                    
                    await confirmMessage.click(confirmButton);
                    log(`[${accountName}] Stop Loss установлен на ${params.stopLossTakeProfit}%`, 'success');
                    return true;
                    
                } catch (error) {
                    if (attempt === 5) {
                        throw new Error(`Не удалось установить Stop Loss после ${attempt} попыток`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
        } catch (error) {
            log(`[${accountName}] Ошибка при установке Stop Loss: ${error.message}`, 'error');
            return false;
        }
    }

    async clickConfirmButton(message, accountName) {
        try {
            if (!message.replyMarkup?.rows) {
                return false;
            }

            for (const row of message.replyMarkup.rows) {
                for (const button of row.buttons) {
                    if (button.text === 'Confirm' || 
                        button.text === '✅ Confirm') {
                        
                        await message.click(button);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return true;
                    }
                }
            }
        } catch (error) {
            log(`[${accountName}] Ошибка при нажатии кнопки: ${error}`, 'error');
        }
        return false;
    }
}
