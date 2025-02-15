import { log } from '../utils/logger.js';

export class PointsManager {
    constructor(accounts) {
        this.accounts = Array.from(accounts.values());
    }

    async checkPoints(botUsername) {
        try {
            log('Получение информации о поинтах...', 'info');
            const pointsPromises = this.accounts.map(account => 
                this.getAccountPoints(account, botUsername)
            );

            const results = await Promise.all(pointsPromises);
            
            const tableData = results.map(r => ({
                'Аккаунт': r.accountName,
                'Поинты': r.points
            }));

            if (tableData.length > 0) {
                console.table(tableData);
                
                // Подсчет общего количества поинтов
                const totalPoints = results.reduce((sum, result) => sum + result.points, 0);
                log(`Общее количество поинтов: ${totalPoints}`, 'success');
            }
            
            return results;
        } catch (error) {
            log('Ошибка при получении поинтов: ' + error, 'error');
            return [];
        }
    }

    async getAccountPoints(account, botUsername) {
        const accountName = account.username || account.firstName || account.phoneNumber;
        try {
            await account.client.sendMessage(botUsername, { message: '/points' });
            
            for (let attempt = 1; attempt <= 5; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const messages = await account.client.getMessages(botUsername, { limit: 5 });
                
                for (const message of messages) {
                    const messageText = message?.message || '';
                    if (messageText.includes('You have') && messageText.includes('points')) {
                        const pointsMatch = messageText.match(/You have (\d+) points/);
                        const points = pointsMatch ? parseInt(pointsMatch[1]) : 0;

                        return {
                            accountName,
                            points
                        };
                    }
                }
                
                if (attempt < 5) {
                    log(`[${accountName}] Попытка ${attempt}/5 найти сообщение с информацией о поинтах...`, 'info');
                }
            }

            throw new Error('Сообщение с информацией о поинтах не найдено после 5 попыток');

        } catch (error) {
            log(`[${accountName}] Ошибка при получении информации о поинтах: ${error}`, 'error');
            return {
                accountName,
                points: 0
            };
        }
    }
}
