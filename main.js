import { initializeAccounts, accounts } from './src/connection/connection.js';
import { OrderManager } from './src/trade/orderManager.js';
import { CloseOrderManager } from './src/trade/closeOrders.js';
import { WalletManager } from './src/trade/walletManager.js';
import fs from 'fs';
import { displayLogo, log } from './src/utils/logger.js';
import readline from 'readline';
import { PointsManager } from './src/trade/points.js';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

async function showMenu() {
    await displayLogo();
    console.log('=================================================================');
    console.log('                Выберите действие:');
    console.log('=================================================================');
    console.log('1. Проверить баланс');
    console.log('2. Запустить торговлю');
    console.log('3. Проверить поинты');
    console.log('4. Выход');
    console.log('=================================================================');

    const answer = await new Promise(resolve => {
        rl.question('Введите номер действия: ', resolve);
    });

    return answer;
}

async function startTrading(botUsername, config) {
    const orderManager = new OrderManager(accounts);
    const closeManager = new CloseOrderManager(accounts);

    async function openAndClosePositions() {
        while (true) {
            try {
                const openDelay = getRandomDelay(config.openDelay.min, config.openDelay.max);
                await displayLogo();
                log(`Ожидание ${openDelay/1000} секунд перед открытием позиций...`, 'wait');
                await new Promise(resolve => setTimeout(resolve, openDelay));
                
                log('Начало открытия новых позиций...', 'info');
                await orderManager.sendPairedOrders(botUsername);
                
                const closeDelay = getRandomDelay(config.closeDelay.min, config.closeDelay.max);
                log(`Ожидание ${closeDelay/1000} секунд перед закрытием позиций...`, 'wait');
                await new Promise(resolve => setTimeout(resolve, closeDelay));
                
                log('Начало закрытия позиций...', 'info');
                await closeManager.closeAllPositions(botUsername);
                
            } catch (error) {
                log(`Ошибка в цикле открытия/закрытия позиций: ${error}`, 'error');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    await openAndClosePositions();
}

function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

async function main() {
    try {
        await initializeAccounts();
        const botUsername = '@pvptrade_bot';
        
        // Читаем конфигурацию для задержек
        const configContent = fs.readFileSync('config.txt', 'utf8');
        const config = {
            timeDelay: 30,
            openDelay: { min: 20, max: 40 },
            closeDelay: { min: 25, max: 45 }
        };

        configContent.split('\n').forEach(line => {
            if (line.startsWith('TIME_DELAY=')) {
                config.timeDelay = parseInt(line.split('=')[1].trim());
            } else if (line.startsWith('OPEN_DELAY_MIN=')) {
                config.openDelay.min = parseInt(line.split('=')[1].trim());
            } else if (line.startsWith('OPEN_DELAY_MAX=')) {
                config.openDelay.max = parseInt(line.split('=')[1].trim());
            } else if (line.startsWith('CLOSE_DELAY_MIN=')) {
                config.closeDelay.min = parseInt(line.split('=')[1].trim());
            } else if (line.startsWith('CLOSE_DELAY_MAX=')) {
                config.closeDelay.max = parseInt(line.split('=')[1].trim());
            }
        });

        while (true) {
            const choice = await showMenu();
            
            switch(choice) {
                case '1':
                    const walletManager = new WalletManager(accounts);
                    await walletManager.checkBalances(botUsername);
                    await new Promise(resolve => {
                        rl.question('\nНажмите Enter для возврата в меню...', resolve);
                    });
                    break;
                    
                case '2':
                    await startTrading(botUsername, config);
                    break;
                    
                case '3':
                    const pointsManager = new PointsManager(accounts);
                    await pointsManager.checkPoints(botUsername);
                    await new Promise(resolve => {
                        rl.question('\nНажмите Enter для возврата в меню...', resolve);
                    });
                    break;
                    
                case '4':
                    rl.close();
                    process.exit(0);
                    break;
                    
                default:
                    log('Неверный выбор. Попробуйте снова.', 'error');
            }
        }
        
    } catch (error) {
        log('Ошибка: ' + error, 'error');
    }
}

main().catch(console.error);
