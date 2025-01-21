import * as telegram from "telegram";
const { StringSession } = telegram.sessions;
import { sessionPath } from "./config.js";
import fs from "fs";
import readline from "readline";
import { log } from "../utils/logger.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

export class TelegramAccount {
    constructor(apiId, apiHash, phoneNumber) {
        this.apiId = apiId;
        this.apiHash = apiHash;
        this.phoneNumber = phoneNumber;
        this.session = new StringSession("");
        this.client = null;
        this.isConnecting = false;
    }

    async connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;

        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const sessionFile = `${sessionPath}${this.phoneNumber}.session`;

        if (fs.existsSync(sessionFile)) {
            const savedSession = fs.readFileSync(sessionFile, "utf-8");
            this.session = new StringSession(savedSession);
        }

        this.client = new telegram.TelegramClient(this.session, this.apiId, this.apiHash, {
            connectionRetries: 5,
            autoReconnect: true,
        });

        console.log(this.phoneNumber)


        try {
            await this.client.start({
                phoneNumber: async () => this.phoneNumber,
                password: async () =>
                    new Promise((resolve) =>
                        rl.question(`Введите пароль для ${this.phoneNumber}: `, resolve)
                    ),
                phoneCode: async () =>
                    new Promise((resolve) =>
                        rl.question(`Введите код для ${this.phoneNumber}: `, resolve)
                    ),
                onError: (err) => console.log(`Ошибка для ${this.phoneNumber}:`, err),
            });

            this.client.addEventHandler((update) => {
                if (update?.constructor?.name === 'Raw' && update?.rawUpdate?._ === 'updateConnectionState') {
                    console.log(`[${this.phoneNumber}] Обнаружено изменение состояния соединения`);
                }
            });

            const me = await this.client.getMe();
            this.username = me.username || me.firstName || this.phoneNumber;
            
            log(`[${this.username}] Подключение успешно установлено`, 'success');
            
            const sessionStr = this.client.session.save();
            fs.writeFileSync(sessionFile, sessionStr);
        } finally {
            this.isConnecting = false;
        }
    }

    async sendCommand(chatId, command) {
        try {
            await this.client.sendMessage(chatId, command);
            log(`[${this.username}] Отправка команды: ${command}`, 'info');
        } catch (error) {
            log(`[${this.username}] Ошибка отправки команды ${command}: ${error}`, 'error');
        }
    }
}

export const accounts = new Map();

export async function initializeAccounts() {
    const { accounts: configAccounts } = await import('./config.js');
    
    for (const acc of configAccounts) {
        try {
            const account = new TelegramAccount(acc.apiId, acc.apiHash, acc.phoneNumber);
            await account.connect();
            accounts.set(acc.phoneNumber, account);
            log(`[${account.username}] Аккаунт успешно инициализирован`, 'success');
        } catch (error) {
            log(`[${account.username}] Ошибка инициализации: ${error}`, 'error');
        }
    }
    
    log(`Всего инициализировано ${accounts.size} аккаунтов`, 'info');
}

