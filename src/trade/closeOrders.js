import { log } from '../utils/logger.js';

export class CloseOrderManager {
    constructor(accounts) {
        this.accounts = Array.from(accounts.values());
    }

    async closeAllPositions(botUsername) {
        try {
            log('Начало закрытия позиций:', 'info');
            const closePromises = this.accounts.map(account => {
                const accountName = account.username || account.firstName || account.phoneNumber;
                log(`[${accountName}] Инициализация закрытия позиций`, 'info');
                return this.closePositionsForAccount(account, botUsername)
                    .then(({ hasClosedPositions, closedSymbols }) => {
                        if (hasClosedPositions) {
                            log(`[${accountName}] Закрыты позиции: ${closedSymbols.join(', ')}`, 'success');
                        } else {
                            log(`[${accountName}] Нет открытых позиций`, 'info');
                        }
                        return { account, hasClosedPositions, closedSymbols };
                    })
                    .catch(error => {
                        log(`[${accountName}] Ошибка: ${error}`, 'error');
                        return { account, hasClosedPositions: false, closedSymbols: [], error };
                    });
            });

            const results = await Promise.all(closePromises);
            
            const tableData = results
                .filter(r => r.hasClosedPositions)
                .flatMap(r => r.closedSymbols.map(symbol => ({
                    'Аккаунт': r.account.username || r.account.firstName || r.account.phoneNumber,
                    'Закрытый токен': symbol
                })));
                
            if (tableData.length > 0) {
                log('Итог закрытия позиций:', 'info');
                console.table(tableData);
            }
            
            return results;
        } catch (error) {
            log('Ошибка при закрытии всех позиций: ' + error, 'error');
            return [];
        }
    }

    async closePositionsForAccount(account, botUsername) {
        try {
            const accountName = account.username || account.firstName || account.phoneNumber;
            await account.client.sendMessage(botUsername, { message: '/close' });
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const { hasPositions, message } = await this.waitForPositionsMessage(account, botUsername);
            
            if (!hasPositions) {
                return { hasClosedPositions: false, closedSymbols: [] };
            }

            const symbols = this.extractSymbolsFromMessage(message);
            const closedSymbols = [];
            
            for (const symbol of symbols) {
                const success = await this.closePositionForSymbol(account, botUsername, symbol);
                if (success) {
                    closedSymbols.push(symbol);
                }
            }
            
            return { 
                hasClosedPositions: closedSymbols.length > 0, 
                closedSymbols 
            };

        } catch (error) {
            const accountName = account.username || account.firstName || account.phoneNumber;
            log(`[${accountName}] Ошибка при закрытии позиций: ${error}`, 'error');
            return { hasClosedPositions: false, closedSymbols: [] };
        }
    }

    async waitForPositionsMessage(account, botUsername) {
        const accountName = account.username || account.firstName || account.phoneNumber;
        for (let i = 0; i < 5; i++) {
            const messages = await account.client.getMessages(botUsername, {
                limit: 5
            });

            for (const message of messages) {
                if (message?.message?.includes('Positions Overview')) {
                    return { hasPositions: true, message };
                }
                
                if (message?.message?.includes('You have no open perps positions')) {
                    log(`[${accountName}] Нет открытых позиций`, 'info');
                    return { hasPositions: false, message: null };
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return { hasPositions: false, message: null };
    }

    extractSymbolsFromMessage(message) {
        const symbols = [];
        if (message.replyMarkup?.rows) {
            for (const row of message.replyMarkup.rows) {
                for (const button of row.buttons) {
                    symbols.push(button.text);
                }
            }
        }
        return symbols;
    }

    async closePositionForSymbol(account, botUsername, symbol) {
        const accountName = account.username || account.firstName || account.phoneNumber;
        try {
            log(`[${accountName}] Закрытие позиции ${symbol}`, 'info');
            const closeCommand = `/close ${symbol.toLowerCase()} 100`;
            await account.client.sendMessage(botUsername, { message: closeCommand });
            await new Promise(resolve => setTimeout(resolve, 2000));

            const confirmMessage = await this.waitForConfirmMessage(account, botUsername);
            if (confirmMessage) {
                const success = await this.clickConfirmButton(confirmMessage);
                if (success) {
                    return true;
                }
            }
            return false;
        } catch (error) {
            log(`[${accountName}] Ошибка при закрытии ${symbol}: ${error}`, 'error');
            return false;
        }
    }

    async waitForConfirmMessage(account, botUsername) {
        for (let i = 0; i < 5; i++) {
            const messages = await account.client.getMessages(botUsername, {
                limit: 5
            });

            for (const message of messages) {
                if (message?.message?.includes('Order Preview')) {
                    return message;
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return null;
    }

    async clickConfirmButton(message) {
        try {
            if (!message.replyMarkup?.rows) {
                return false;
            }

            for (const row of message.replyMarkup.rows) {
                for (const button of row.buttons) {
                    if (button.text.includes('✅') || 
                        (button.data && button.data.data && 
                         Buffer.from(button.data.data).toString() === 'confirm-order')) {
                        await message.click(button);
                        return true;
                    }
                }
            }
        } catch (error) {
            log('Ошибка при нажатии кнопки подтверждения: ' + error, 'error');
        }
        return false;
    }
}
