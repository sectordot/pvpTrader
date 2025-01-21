import { log } from '../utils/logger.js';

export class WalletManager {
    constructor(accounts) {
        this.accounts = Array.from(accounts.values());
    }

    async checkBalances(botUsername) {
        try {
            log('Получение информации о балансах...', 'info');
            const balancePromises = this.accounts.map(account => 
                this.getWalletInfo(account, botUsername)
            );

            const results = await Promise.all(balancePromises);
            
            const tableData = results.map(r => ({
                'Аккаунт': r.accountName,
                'Баланс': `$${r.perpsBalance}`,
                'ETH адрес': r.ethAddress,
                'SOL адрес': r.solAddress
            }));

            if (tableData.length > 0) {
                console.table(tableData);
            }
            
            return results;
        } catch (error) {
            log('Ошибка при получении балансов: ' + error, 'error');
            return [];
        }
    }

    async getWalletInfo(account, botUsername) {
        const accountName = account.username || account.firstName || account.phoneNumber;
        try {
            await account.client.sendMessage(botUsername, { message: '/wallet' });
            
            // Пытаемся найти сообщение несколько раз
            for (let attempt = 1; attempt <= 5; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const messages = await account.client.getMessages(botUsername, { limit: 10 });
                
                for (const message of messages) {
                    const messageText = message?.message || '';
                    if (messageText.includes('Your Wallet')) {
                        // Извлекаем ETH адрес
                        const ethMatch = messageText.match(/ETH Address: (0x[a-fA-F0-9]{40})/);
                        const ethAddress = ethMatch ? ethMatch[1] : 'Не найден';

                        // Извлекаем SOL адрес
                        const solMatch = messageText.match(/SOL Address: ([a-zA-Z0-9]{32,44})/);
                        const solAddress = solMatch ? solMatch[1] : 'Не найден';

                        // Извлекаем Perps Balance
                        const perpsMatch = messageText.match(/Perps Balance: \$([0-9.]+)/);
                        const perpsBalance = perpsMatch ? parseFloat(perpsMatch[1]) : 0;

                        return {
                            accountName,
                            ethAddress,
                            solAddress,
                            perpsBalance
                        };
                    }
                }
                
                if (attempt < 5) {
                    log(`[${accountName}] Попытка ${attempt}/5 найти сообщение с информацией о кошельке...`, 'info');
                }
            }

            throw new Error('Сообщение с информацией о кошельке не найдено после 5 попыток');

        } catch (error) {
            log(`[${accountName}] Ошибка при получении информации о кошельке: ${error}`, 'error');
            return {
                accountName,
                ethAddress: 'Ошибка',
                solAddress: 'Ошибка',
                perpsBalance: 0
            };
        }
    }
} 