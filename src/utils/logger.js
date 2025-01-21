export async function displayLogo() {
    process.stdout.write('\x1Bc');
    console.log(`
\x1b[36m
   ▄████████    ▄████████  ▄████████     ███      ▄██████▄     ▄████████ 
  ███    ███   ███    ███ ███    ███ ▀█████████▄ ███    ███   ███    ███ 
  ███    █▀    ███    █▀  ███    █▀     ▀███▀▀██ ███    ███   ███    ███ 
  ███         ▄███▄▄▄     ███            ███   ▀ ███    ███  ▄███▄▄▄▄██▀ 
▀███████████ ▀▀███▀▀▀     ███            ███     ███    ███ ▀▀███▀▀▀▀▀   
         ███   ███    █▄  ███    █▄      ███     ███    ███ ▀███████████ 
   ▄█    ███   ███    ███ ███    ███     ███     ███    ███   ███    ███ 
 ▄████████▀    ██████████ ████████▀     ▄████▀    ▀██████▀    ███    ███ 
                                                               ███    ███ \x1b[0m

\x1b[33m=================================================================
                Created by SECTOR | @sectordot
                TG: https://t.me/sectormoves
=================================================================\x1b[0m

`);
}

export function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    switch(type) {
        case 'info':
            console.log(`\n[${timestamp}] ℹ️  ${message}`);
            break;
        case 'error':
            console.error(`\n[${timestamp}] ❌  ${message}`);
            break;
        case 'wait':
            console.log(`\n[${timestamp}] ⏰  ${message}`);
            break;
        case 'success':
            console.log(`\n[${timestamp}] ✅  ${message}`);
            break;
        case 'search':
            console.log(`\n[${timestamp}] 🔍  ${message}`);
            break;
        case 'warning':
            console.log(`\n[${timestamp}] ⚠️  ${message}`);
            break;
        case 'chart':
            console.log(`\n[${timestamp}] 📊  ${message}`);
            break;
    }
} 