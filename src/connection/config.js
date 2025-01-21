export const sessionPath = "./sessions/";
export const configPath = "./config.txt";
export const accounts = [];

import fs from 'fs';

const configContent = fs.readFileSync(configPath, 'utf-8');
const lines = configContent.split('\n');

for (const line of lines) {
    if (line.trim() && line.startsWith('ACCOUNTS')) {
        const accountsStr = line.split('=')[1].trim();
        const cleanAccountsStr = accountsStr.replace(/^"|"$/g, '');
        const accountsList = cleanAccountsStr.split(',').filter(acc => acc.trim());
        
        for (const account of accountsList) {
            const [apiId, apiHash, phoneNumber] = account.trim().split(':');
            if (apiId && apiHash && phoneNumber) {
                const cleanApiHash = apiHash.trim().replace(/['"]/g, '');
                const cleanPhoneNumber = phoneNumber.trim().replace(/['"]/g, '');
                
                const parsedApiId = parseInt(apiId);
                if (isNaN(parsedApiId)) {
                    console.error(`Некорректный API ID для номера ${cleanPhoneNumber}`);
                    continue;
                }

                accounts.push({
                    apiId: parsedApiId,
                    apiHash: cleanApiHash,
                    phoneNumber: cleanPhoneNumber
                });
            }
        }
    }
} 